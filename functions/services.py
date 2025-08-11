"""Service layer for handling business logic and data interactions."""
import json
import os
import requests
from collections import defaultdict
from datetime import datetime
from io import BytesIO
from typing import Any, Dict, List, Tuple

from firebase_admin import firestore
from openpyxl import Workbook

import excel_generator
import firestore_manager
from utils import parse_date_str, format_date_to_ddmmyyyy, _sanitize_filename

# --- Constantes ---
RUC_API_URL = "https://api.apis.net.pe/v2/ruc/?numero={}"
COLOR_PALETTE = {
    "viniball": "C00000",
    "vinifan": "0070C0",
    "otros": "00B050"
}
DEFAULT_COLOR = "808080"

class ApiError(Exception):
    """Custom exception for API errors."""
    def __init__(self, message, status_code=400):
        super().__init__(message)
        self.message = message
        self.status_code = status_code

    def to_dict(self):
        """Converts the ApiError object to a dictionary."""
        return {'message': self.message}

# --- Holiday Service ---
def get_holidays_for_year(year: int) -> List[Dict[str, str]]:
    """Service to get all holidays for a given year."""
    try:
        return firestore_manager.get_all_holidays_for_year(year)
    except Exception as e:
        print(f"Error in holiday service: {e}")
        raise ApiError("Failed to retrieve holiday data.", 500) from e

# --- RUC Service ---
def get_ruc_data(ruc_number: str) -> Dict[str, Any]:
    """Service to consult RUC, using cache first."""
    cached_data = firestore_manager.get_ruc_from_cache(ruc_number)
    if cached_data:
        print(f"Returning RUC {ruc_number} from cache.")
        return cached_data

    print(f"RUC {ruc_number} not in cache. Calling external API.")
    try:
        api_token = os.environ.get("SUNAT_API_TOKEN")
        if not api_token:
            raise ApiError("API token not configured on the server.", 500)
        
        url = RUC_API_URL.format(ruc_number)
        headers = {"Authorization": f"Bearer {api_token}"}
        response = requests.get(url, headers=headers, timeout=10)
        response.raise_for_status()
        api_data = response.json()

        if api_data and api_data.get('razonSocial'):
            data_to_cache = {
                'ruc': ruc_number,
                'razonSocial': api_data['razonSocial'],
                'estado': api_data.get('estado'),
                'condicion': api_data.get('condicion'),
                'timestamp': firestore.SERVER_TIMESTAMP
            }
            db = firestore_manager.get_db()
            db.collection(firestore_manager.RUC_CACHE_COLLECTION).document(ruc_number).set(data_to_cache)
            return data_to_cache
        else:
            raise ApiError("RUC not found.", 404)
    except requests.exceptions.RequestException as e:
        print(f"Connection error with RUC API: {e}")
        raise ApiError("Could not connect to the RUC consultation service.", 503) from e
    except Exception as e:
        print(f"Unexpected error in get_ruc_data: {e}")
        raise ApiError("An internal error occurred while consulting the RUC.", 500) from e

# --- Calculation Service ---
def perform_calculation(monto_total: float, fechas_str: List[str]) -> Dict[str, Any]:
    """Pure logic to calculate the distribution of amounts."""
    fechas_dt = sorted([parse_date_str(f) for f in fechas_str])
    num_fechas = len(fechas_dt)
    if num_fechas == 0:
        raise ApiError("The list of dates cannot be empty.", 400)

    monto_total_en_centavos = int(round(monto_total * 100))
    monto_base_centavos = monto_total_en_centavos // num_fechas
    centavos_restantes = monto_total_en_centavos % num_fechas

    montos_calculados = [
        (monto_base_centavos + (1 if i < centavos_restantes else 0)) / 100.0
        for i in range(num_fechas)
    ]

    montos_asignados = {
        format_date_to_ddmmyyyy(date): monto
        for date, monto in zip(fechas_dt, montos_calculados)
    }
    
    resumen_mensual = defaultdict(float)
    for date, monto in zip(fechas_dt, montos_calculados):
        resumen_mensual[date.strftime("%Y-%m")] += monto

    return {"montosAsignados": montos_asignados, "resumenMensual": dict(resumen_mensual)}

def _generate_report_filename(data: Dict[str, Any], use_restored_date: bool) -> str:
    """
    Genera una base de nombre de archivo sanitizada y formateada.
    
    Args:
        data: Diccionario con los datos del reporte.
        use_restored_date: Si es True y el reporte es restaurado, usa la primera
                           fecha del reporte como referencia. De lo contrario, usa la fecha actual.
    """
    sanitized_cliente = _sanitize_filename(data.get('razonSocial', ''))
    sanitized_pedido = _sanitize_filename(data.get('pedido', ''))
    
    reference_date = datetime.now() # Por defecto, la fecha actual
    if use_restored_date and data.get('isRestored'):
        fechas_ordenadas = data.get('fechasOrdenadas', [])
        if fechas_ordenadas:
            reference_date = parse_date_str(fechas_ordenadas[0])

    month_year_str = reference_date.strftime("%m_%y")
    return f"{sanitized_pedido}-{sanitized_cliente}-{month_year_str}"

# --- Report Generation Service ---
def generate_excel_service(data: Dict[str, Any]) -> Tuple[BytesIO, str]:
    """Service to generate the Excel report."""
    linea = data.get("linea", "otros").lower()
    color_hex = COLOR_PALETTE.get(linea, DEFAULT_COLOR)

    wb = Workbook()
    excel_generator.create_full_report_sheet(wb, data, color_hex)
    excel_generator.create_payment_detail_sheet(wb, data, color_hex)

    excel_file = BytesIO()
    wb.save(excel_file)
    excel_file.seek(0)

    base_name = _generate_report_filename(data, use_restored_date=True)
    filename = f"reporte_{base_name}.xlsx"
    return excel_file, filename

def generate_json_service(data: Dict[str, Any]) -> Tuple[bytes, str]:
    """Service to generate the JSON backup report."""
    # Esta lógica se mueve desde main.py para asegurar un formato de respaldo consistente.
    json_data_to_save = {
        "montoOriginal": data.get('montoOriginal'),
        "fechasOrdenadas": data.get('fechasOrdenadas'),
        "montosAsignados": data.get('montosAsignados'),
        "resumenMensual": data.get('resumenMensual'),
        "razonSocial": data.get('razonSocial'),
        "linea": data.get('linea'),
        "pedido": data.get('pedido'),
        "ruc": data.get('ruc', ''),
        "codigoCliente": data.get('codigoCliente', '')
    }

    json_content = json.dumps(json_data_to_save, indent=4, ensure_ascii=False).encode('utf-8')

    # Los respaldos JSON siempre usan la fecha actual para el versionado.
    base_name = _generate_report_filename(data, use_restored_date=False)
    filename = f"respaldo_{base_name}.json"
    return json_content, filename