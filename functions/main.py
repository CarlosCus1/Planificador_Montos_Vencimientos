import firebase_admin
from firebase_admin import firestore, credentials
import os
from flask import Flask, request, jsonify, Blueprint, Response
from io import BytesIO
from flask_cors import CORS
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from firebase_functions import https_fn, options
from datetime import datetime, date, timedelta
import requests
import asyncio
import json
from typing import List, Dict, Any, Set, Tuple
from collections import defaultdict

from .shared.date_utils import calcular_feriados_pascuas

# --- Constantes ---
RUC_API_URL = "https://api.apis.net.pe/v2/ruc/?numero={}"
RUC_CACHE_COLLECTION = 'ruc_cache'
HOLIDAYS_COLLECTION = 'holidays'
RUC_CACHE_DAYS = 7

# --- Caché en memoria para feriados ---
# Cache para feriados por año (incluye fijos y de Pascua)
yearly_holidays_cache = {}
# Cache solo para feriados fijos globales (para no leer DB repetidamente)
_global_fixed_holidays_cache = None

# --- Paleta de Colores ---
COLOR_PALETTE = {
    "viniball": "C00000",  # Rojo
    "vinifan": "0070C0",   # Azul
    "otros": "00B050"      # Verde
}
MONTH_NAMES_ES = [
    "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", 
    "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
]
DEFAULT_COLOR = "808080" # Gris para casos no definidos

# Paleta de colores extendida y visualmente distinta para el gráfico
VIVID_PALETTE = [
    "FF5733", "33C7FF", "9B33FF", "FFC733", "33FF57", "FF33A1",
    "A133FF", "33FFA1", "FF8C33", "337BFF", "E833FF", "FFEC33"
]

# Colores para encabezados y totales (más suaves)
HEADER_TOTAL_COLOR = "D9D9D9" # Un gris claro
GREEN_HEADER_COLOR = "00B050" # Verde oscuro para encabezados principales

def _lighten_color(hex_color, factor=0.5):
    """Aclara un color hexadecimal mezclándolo con blanco."""
    hex_color = hex_color.lstrip('#')
    rgb = tuple(int(hex_color[i:i+2], 16) for i in (0, 2, 4))
    
    # Mezclar con blanco
    new_rgb = [int(val + (255 - val) * factor) for val in rgb]
    
    return '%02X%02X%02X' % tuple(new_rgb)

# --- Configuración de la Aplicación Flask ---
app = Flask(__name__)
CORS(app)

# --- Configuración de Rate Limiter ---
limiter = Limiter(
    get_remote_address,
    app=app,
    default_limits=["200 per day", "50 per hour"],
    storage_uri="memory://",  # 'memory://' es suficiente para Cloud Functions (cada instancia tiene su propio límite)
)

api_blueprint = Blueprint('api', __name__)

# --- Manejo de Errores Centralizado ---
class ApiError(Exception):
    """Excepción personalizada para errores de la API."""
    def __init__(self, message, status_code=400):
        super().__init__(message)
        self.message = message
        self.status_code = status_code

    def to_dict(self):
        return {'message': self.message}

@app.errorhandler(ApiError)
def handle_api_error(error):
    response = jsonify(error.to_dict())
    response.status_code = error.status_code
    return response

# --- Inicialización de Firebase ---
# En el entorno de producción de Firebase, las credenciales se manejan automáticamente.
# Para el emulador local, asegúrate de que el emulador de Firestore esté corriendo.
if not firebase_admin._apps:
    firebase_admin.initialize_app()

_db_client = None
def get_db():
    """Obtiene una instancia del cliente de Firestore, inicializándola si es necesario."""
    global _db_client
    if _db_client is None:
        _db_client = firestore.client()
    return _db_client


# --- Funciones de Utilidad de Fechas ---
def parse_date_str(date_str: str) -> date:
    return datetime.strptime(date_str, '%d/%m/%Y').date()

def format_month_year_es(date_obj: date) -> str:
    """Formatea una fecha a 'Mes Año' en español, ej: 'Enero 2023'."""
    return f"{MONTH_NAMES_ES[date_obj.month - 1]} {date_obj.year}"

def format_date_to_ddmmyyyy(date_obj: date) -> str:
    return date_obj.strftime("%d/%m/%Y")

def is_weekend(date_obj: date) -> bool: # Saturday or Sunday
    return date_obj.weekday() >= 5

def is_holiday(date_obj: date, holidays_set: Set[date]) -> bool:
    """Checks if a date object is in a set of holiday date objects."""
    return date_obj in holidays_set

# --- Lógica de Feriados ---

def _get_fixed_holidays_from_db(db_client) -> Dict[str, str]:
    """Lee los feriados fijos de la DB. Esta función es la que realmente hace la llamada a la DB."""
    global_fixed_holidays: Dict[str, str] = {}
    try:
        docs = db_client.collection(HOLIDAYS_COLLECTION).stream()
        for doc in docs:
            data = doc.to_dict()
            if 'day' in data and 'month' in data:
                global_fixed_holidays[f"{data['day']:02d}/{data['month']:02d}"] = data.get('name', '')
        return global_fixed_holidays
    except Exception as e:
        print(f"Error al cargar feriados fijos desde Firestore: {e}")
        return {} # Devolver vacío en caso de error

def get_all_holidays_for_year(year: int) -> List[Dict[str, str]]:
    """
    Obtiene todos los feriados para un año, usando un caché en memoria para
    evitar lecturas repetidas de Firestore.
    """
    global _global_fixed_holidays_cache
    
    # 1. Usar caché de año completo si existe
    if year in yearly_holidays_cache:
        return yearly_holidays_cache[year]

    # 2. Cargar feriados fijos desde la DB si no están en caché
    if _global_fixed_holidays_cache is None:
        print("Cargando feriados fijos desde Firestore (primera vez)...")
        db_client = get_db()
        _global_fixed_holidays_cache = _get_fixed_holidays_from_db(db_client)

    # 3. Calcular feriados de Pascua y combinar
    easter_holidays = calcular_feriados_pascuas(year)
    all_holidays = {**_global_fixed_holidays_cache, **easter_holidays}
    
    # 4. Formatear, guardar en caché de año y devolver
    result = [{'date': f"{date_str}/{year}", 'name': name} for date_str, name in all_holidays.items()]
    yearly_holidays_cache[year] = result
    return result

# --- Lógica de Generación de Reporte Excel ---

def _create_full_report_sheet(wb, data, color_hex):
    """Crea la hoja principal del reporte con dashboard completo."""
    # --- Imports for openpyxl ---
    # These are now local to the reporting functions
    from openpyxl.styles import Font, PatternFill, Border, Side, Alignment
    from openpyxl.chart import PieChart, Reference
    from openpyxl.chart.label import DataLabelList
    from openpyxl.utils import get_column_letter
    from openpyxl.drawing.colors import ColorChoice # Correct import for chart colors
    # --- Estilos y Constantes Locales ---
    THIN_BORDER = Border(left=Side(style='thin'),
                         right=Side(style='thin'),
                         top=Side(style='thin'),
                         bottom=Side(style='thin'))
    WHITE_TEXT_COLOR = "FFFFFF"

    ws = wb.active
    ws.title = "Reporte Dashboard"

    # --- Estilos Comunes ---
    main_title_font = Font(bold=True, size=16, color=WHITE_TEXT_COLOR)
    section_title_font = Font(bold=True, size=12, color=WHITE_TEXT_COLOR)
    header_font = Font(bold=True, color=WHITE_TEXT_COLOR) # Para títulos de sección con fondo de color
    bold_font = Font(bold=True)
    italic_font = Font(italic=True, color="595959") # Gris sutil para el marcador de restauración
    table_header_font = Font(bold=True, color="404040") # Gris oscuro para encabezados de tabla

    currency_format = 'S/ #,##0.00'
    percentage_format = '0.00%'
    date_format = 'DD/MM/YYYY'

    main_color_fill = PatternFill(start_color=color_hex, end_color=color_hex, fill_type="solid")
    light_main_color_fill = PatternFill(start_color=_lighten_color(color_hex, factor=0.7), end_color=_lighten_color(color_hex, factor=0.7), fill_type="solid")
    light_gray_fill = PatternFill(start_color=HEADER_TOTAL_COLOR, end_color=HEADER_TOTAL_COLOR, fill_type="solid")

    # --- Título Principal ---
    ws.merge_cells('A1:D1')
    ws['A1'] = "DISTRIBUCION DE MONTOS POR FECHA"
    ws['A1'].font = main_title_font
    ws['A1'].fill = main_color_fill
    ws['A1'].alignment = Alignment(horizontal='center', vertical='center')
    ws.row_dimensions[1].height = 25 # Altura para el título

    current_row = 3 # Empezar en la fila 3 después del título y una fila vacía

    # --- Sección de Información General ---
    ws.merge_cells(f'A{current_row}:B{current_row}')
    ws[f'A{current_row}'] = "Información General"
    ws[f'A{current_row}'].font = section_title_font
    ws[f'A{current_row}'].fill = main_color_fill
    ws[f'A{current_row}'].alignment = Alignment(horizontal='center', vertical='center')
    current_row += 1

    info_data = [
        ("Cód. Cliente:", data.get('codigoCliente', '')), # Asumiendo que codigoCliente podría venir
        ("RUC:", data.get('ruc', '')),
        ("Cliente:", data.get('razonSocial', '')),
        ("Línea:", data.get('linea', '')),
        ("Cód. Pedido:", data.get('pedido', '')),
        ("Monto Total:", data.get('montoOriginal', 0)),
        ("Total Letras:", len(data.get('fechasOrdenadas', [])))
    ]
    for label, value in info_data:
        # FIX: Asegurar que el código de cliente se incluya en los datos del reporte
        if label == "Cód. Cliente:":
            value = data.get('codigoCliente', '')

        # Añadir el distintivo de reporte restaurado
        if data.get('isRestored'):
            info_data.insert(0, ("Origen:", "Restaurado desde respaldo"))

        ws[f'A{current_row}'] = label
        ws[f'B{current_row}'] = value
        ws[f'A{current_row}'].font = bold_font
        ws[f'A{current_row}'].border = THIN_BORDER
        ws[f'B{current_row}'].border = THIN_BORDER
        if label == "Monto Total:":
            ws[f'B{current_row}'].number_format = currency_format
        if label == "Origen:":
            ws[f'A{current_row}'].font = italic_font
            ws[f'B{current_row}'].font = italic_font
        current_row += 1
    
    current_row += 2 # Espacio después de la sección de información

    # --- Sección de Resumen Mensual (Tabla) ---
    ws.merge_cells(f'A{current_row}:C{current_row}')
    ws[f'A{current_row}'] = "Resumen Mensual"
    ws[f'A{current_row}'].font = section_title_font
    ws[f'A{current_row}'].fill = main_color_fill
    ws[f'A{current_row}'].alignment = Alignment(horizontal='center', vertical='center')
    current_row += 1

    resumen_mensual = data.get('resumenMensual', {})
    total_monto_original = data.get('montoOriginal', 0)

    summary_headers = ["Mes", "Monto (S/)", "Porcentaje"]
    for col_idx, header_text in enumerate(summary_headers, 1):
        cell = ws.cell(row=current_row, column=col_idx, value=header_text)
        cell.font = table_header_font
        cell.fill = light_main_color_fill
        cell.border = THIN_BORDER
        cell.alignment = Alignment(horizontal='center', vertical='center')
    summary_header_row = current_row
    current_row += 1

    # Ordenar meses para el resumen
    sorted_months = sorted(resumen_mensual.keys(), key=lambda x: datetime.strptime(x, "%Y-%m"))

    summary_data_start_row = current_row
    for mes_key in sorted_months:
        monto_mes = resumen_mensual[mes_key]
        porcentaje = (monto_mes / total_monto_original) if total_monto_original > 0 else 0
        
        ws.cell(row=current_row, column=1, value=format_month_year_es(datetime.strptime(mes_key, "%Y-%m"))).border = THIN_BORDER
        ws.cell(row=current_row, column=2, value=monto_mes).number_format = currency_format
        ws.cell(row=current_row, column=2).border = THIN_BORDER
        ws.cell(row=current_row, column=3, value=porcentaje).number_format = percentage_format
        ws.cell(row=current_row, column=3).border = THIN_BORDER
        current_row += 1
    summary_data_end_row = current_row - 1

    # Fila de Totales del Resumen
    ws.cell(row=current_row, column=1, value="Totales").font = bold_font
    ws.cell(row=current_row, column=1).border = THIN_BORDER
    ws.cell(row=current_row, column=1).fill = light_gray_fill
    
    # Fórmula para sumar montos
    if summary_data_start_row > summary_data_end_row: sum_formula_monto = 0
    elif summary_data_start_row == summary_data_end_row: sum_formula_monto = f'=B{summary_data_start_row}'
    else: sum_formula_monto = f'=SUM(B{summary_data_start_row}:B{summary_data_end_row})'
    ws.cell(row=current_row, column=2, value=sum_formula_monto).number_format = currency_format
    ws.cell(row=current_row, column=2).font = bold_font
    ws.cell(row=current_row, column=2).border = THIN_BORDER
    ws.cell(row=current_row, column=2).fill = light_gray_fill

    # Fórmula para el 100%
    ws.cell(row=current_row, column=3, value=1).number_format = percentage_format
    ws.cell(row=current_row, column=3).font = bold_font
    ws.cell(row=current_row, column=3).border = THIN_BORDER
    ws.cell(row=current_row, column=3).fill = light_gray_fill
    summary_total_row = current_row
    current_row += 2 # Espacio después de la tabla de resumen

    # --- Gráfico de Pastel (Donut Chart) ---
    if resumen_mensual:
        pie_chart = PieChart()
        pie_chart.title = "Distribución Porcentual Mensual"
        pie_chart.style = 10 # Estilo predefinido
        
        # Datos para el gráfico: Porcentajes y Categorías (Meses)
        data_ref = Reference(ws, min_col=3, min_row=summary_data_start_row, max_row=summary_data_end_row)
        labels_ref = Reference(ws, min_col=1, min_row=summary_data_start_row, max_row=summary_data_end_row)
        
        pie_chart.add_data(data_ref, titles_from_data=False)
        pie_chart.set_categories(labels_ref)
        
        # Hacerlo un Donut Chart (ajustando el agujero)
        #pie_chart.firstSliceAngle = 270 # Empezar arriba
        #pie_chart.holeSize = 50 # 50% de agujero para donut

        # Fondo del gráfico (gris claro, consistente con encabezados de tabla)
        #pie_chart.graphical_properties.solid_fill = ColorChoice(srgbClr="F2F2F2")

        # Aplicar colores a las rebanadas del pastel usando la paleta VIVID
        # NOTA: La API para estilizar puntos individuales del gráfico (rebanadas) ha cambiado
        # en openpyxl y está causando un AttributeError en el entorno de Cloud Functions.
        # El siguiente bucle se comenta para prevenir el error. El gráfico se generará
        # con los colores por defecto de Excel, lo cual es un fallback seguro.
        # for i, slice_data in enumerate(pie_chart.series[0].dpts):
        #     color = VIVID_PALETTE[i % len(VIVID_PALETTE)]
        #     slice_data.graphicalProperties.solidFill = ColorChoice(srgbClr=color)

        # Añadir etiquetas de datos (porcentaje)
        pie_chart.dLbls = DataLabelList()
        pie_chart.dLbls.showVal = False
        pie_chart.dLbls.showPercent = True
        pie_chart.dLbls.showCatName = True
        pie_chart.dLbls.showLeaderLines = True

        # Posicionar y dimensionar el gráfico para que ocupe el área E3:H16.
        # Un ancho de 12.5 cm encaja bien en 4 columnas de ancho 16.
        # Una altura de 7.5 cm encaja bien en 14 filas de altura estándar.
        pie_chart.width = 12.5
        pie_chart.height = 7.5
        ws.add_chart(pie_chart, "E3") # El ancla superior izquierda es E3

    current_row = summary_total_row + 2 # Espacio después del resumen y gráfico

    # --- Sección de Detalle por Mes (Horizontal) ---
    ws.merge_cells(f'A{current_row}:D{current_row}') # Fusionar para el título de la sección
    ws[f'A{current_row}'] = "Detalle por Mes"
    ws[f'A{current_row}'].font = section_title_font
    ws[f'A{current_row}'].fill = main_color_fill
    ws[f'A{current_row}'].alignment = Alignment(horizontal='center', vertical='center')
    current_row += 1

    montos_por_mes = defaultdict(list)
    for fecha_str, monto in data.get('montosAsignados', {}).items():
        fecha_obj = parse_date_str(fecha_str)
        montos_por_mes[fecha_obj.strftime("%Y-%m")].append((fecha_obj, monto))
    
    # Obtener la lista única de meses presentes y ordenarlos
    sorted_detail_months = sorted(montos_por_mes.keys(), key=lambda x: datetime.strptime(x, "%Y-%m"))

    # Construir encabezados multinivel para el detalle horizontal
    header_row_1 = current_row
    header_row_2 = current_row + 1
    current_col_idx = 1 # Columna A

    for mes_key in sorted_detail_months:
        mes_obj = datetime.strptime(mes_key, "%Y-%m")

        # --- Encabezado superior (sin merge) ---
        # Mes
        ws.cell(row=header_row_1, column=current_col_idx, value=format_month_year_es(mes_obj)).font = table_header_font
        ws.cell(row=header_row_1, column=current_col_idx).fill = light_main_color_fill
        ws.cell(row=header_row_1, column=current_col_idx).border = THIN_BORDER
        ws.cell(row=header_row_1, column=current_col_idx).alignment = Alignment(horizontal='center', vertical='center')

        # Porcentaje
        monto_mes_total = sum(m for _, m in montos_por_mes.get(mes_key, []))
        porcentaje = (monto_mes_total / total_monto_original) if total_monto_original else 0
        ws.cell(row=header_row_1, column=current_col_idx + 1, value=porcentaje).font = table_header_font
        ws.cell(row=header_row_1, column=current_col_idx + 1).number_format = percentage_format
        ws.cell(row=header_row_1, column=current_col_idx + 1).fill = light_main_color_fill
        ws.cell(row=header_row_1, column=current_col_idx + 1).border = THIN_BORDER
        ws.cell(row=header_row_1, column=current_col_idx + 1).alignment = Alignment(horizontal='center', vertical='center')

        # --- Segunda fila de encabezado ---
        ws.cell(row=header_row_2, column=current_col_idx, value="Fechas").font = table_header_font
        ws.cell(row=header_row_2, column=current_col_idx).fill = light_main_color_fill
        ws.cell(row=header_row_2, column=current_col_idx).border = THIN_BORDER
        ws.cell(row=header_row_2, column=current_col_idx).alignment = Alignment(horizontal='center', vertical='center')

        ws.cell(row=header_row_2, column=current_col_idx + 1, value="Monto (S/)").font = table_header_font
        ws.cell(row=header_row_2, column=current_col_idx + 1).fill = light_main_color_fill
        ws.cell(row=header_row_2, column=current_col_idx + 1).border = THIN_BORDER
        ws.cell(row=header_row_2, column=current_col_idx + 1).alignment = Alignment(horizontal='center', vertical='center')
        
        current_col_idx += 2 # Mover a la siguiente pareja de columnas
    
    current_row += 2 # Mover a la fila donde empiezan los datos de detalle

    # Llenar datos de detalle
    max_fechas_por_mes = max((len(v) for v in montos_por_mes.values()), default=0)
    
    for i in range(max_fechas_por_mes):
        current_col_idx = 1
        for mes_key in sorted_detail_months:
            fechas_mes = sorted(montos_por_mes[mes_key]) # Asegurar orden por fecha
            if i < len(fechas_mes):
                fecha_obj, monto = fechas_mes[i]
                ws.cell(row=current_row, column=current_col_idx, value=fecha_obj).number_format = date_format
                ws.cell(row=current_row, column=current_col_idx).border = THIN_BORDER
                ws.cell(row=current_row, column=current_col_idx + 1, value=monto).number_format = currency_format
                ws.cell(row=current_row, column=current_col_idx + 1).border = THIN_BORDER
            else:
                # Celdas vacías para mantener la alineación
                ws.cell(row=current_row, column=current_col_idx, value="").border = THIN_BORDER
                ws.cell(row=current_row, column=current_col_idx + 1, value="").border = THIN_BORDER
            current_col_idx += 2
        current_row += 1

    # Fila de Totales para Detalle
    total_detail_row = current_row
    current_col_idx = 1
    for mes_key in sorted_detail_months:
        total_mes = sum(m for _, m in montos_por_mes[mes_key])
        ws.cell(row=total_detail_row, column=current_col_idx, value="Total Mes").font = bold_font
        ws.cell(row=total_detail_row, column=current_col_idx).border = THIN_BORDER
        ws.cell(row=total_detail_row, column=current_col_idx).fill = light_gray_fill
        
        # Fórmula para sumar montos de la columna
        first_data_row = header_row_2 + 1
        last_data_row = total_detail_row - 1
        sum_col_letter = get_column_letter(current_col_idx + 1)

        if first_data_row > last_data_row: sum_formula = 0
        elif first_data_row == last_data_row: sum_formula = f'={sum_col_letter}{first_data_row}'
        else: sum_formula = f'=SUM({sum_col_letter}{first_data_row}:{sum_col_letter}{last_data_row})'
        
        ws.cell(row=total_detail_row, column=current_col_idx + 1, value=sum_formula).number_format = currency_format
        ws.cell(row=total_detail_row, column=current_col_idx + 1).font = bold_font
        ws.cell(row=total_detail_row, column=current_col_idx + 1).border = THIN_BORDER
        ws.cell(row=total_detail_row, column=current_col_idx + 1).fill = light_gray_fill
        
        current_col_idx += 2

    # Ajustar ancho de columnas a un valor fijo para uniformidad.
    # Se itera desde la columna 1 hasta la máxima columna con datos para asegurar que todas se ajusten.
    for i in range(1, ws.max_column + 1):
        col_letter = get_column_letter(i)
        ws.column_dimensions[col_letter].width = 16

def _sanitize_filename(name: str) -> str:
    """Sanitiza un string para que sea un nombre de archivo válido."""
    if not name:
        return ""
    # Elimina caracteres inválidos para nombres de archivo en los principales SO
    sanitized = "".join(c for c in name if c.isalnum() or c in (' ', '_', '-')).strip()
    # Reemplaza espacios con guiones bajos para mayor compatibilidad
    return "_".join(sanitized.split())

# --- Endpoints de la API (sin cambios) ---

@api_blueprint.route('/getHolidays', methods=['GET'])
@limiter.limit("30 per minute") # Límite más suave para feriados
def get_holidays():
    year_str = request.args.get('year')
    if not year_str or not year_str.isdigit():
        raise ApiError("Parámetro 'year' es requerido y debe ser un número.", 400)

    try:
        holidays_list = get_all_holidays_for_year(int(year_str))
        return jsonify(holidays_list)
    except Exception as e:
        print(f"Error no controlado en get_holidays: {e}")
        raise ApiError("Ocurrió un error interno al obtener los feriados.", 500)

@api_blueprint.route('/consultar-ruc', methods=['GET'])
@limiter.limit("10 per minute") # Límite estricto para la consulta de RUC
def consultar_ruc():
    ruc_number = request.args.get('numero')
    if not ruc_number:
        raise ApiError("El parámetro 'numero' es requerido.", 400)
    
    # Lógica de caché (simplificada para brevedad)
    cached_doc = get_db().collection(RUC_CACHE_COLLECTION).document(ruc_number).get()
    if cached_doc.exists: # El documento existe, ahora verificamos su antigüedad
        cached_data = cached_doc.to_dict()
        timestamp = cached_data.get('timestamp')
        # Asegurarse de que el timestamp existe y es un datetime
        if timestamp and isinstance(timestamp, datetime):
            # Si el caché no ha expirado, lo devolvemos
            if (datetime.now(timestamp.tzinfo) - timestamp) < timedelta(days=RUC_CACHE_DAYS):
                print(f"Devolviendo RUC {ruc_number} desde caché.")
                return jsonify(cached_data)
    
    try:
        api_token = os.environ.get("SUNAT_API_TOKEN")
        if not api_token:
            raise ApiError("Token de API no configurado en el servidor.", 500)
        
        url = RUC_API_URL.format(ruc_number)
        headers = {"Authorization": f"Bearer {api_token}"}
        response = requests.get(url, headers=headers)
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
            get_db().collection(RUC_CACHE_COLLECTION).document(ruc_number).set(data_to_cache)
            return jsonify(data_to_cache)
        else:
            return jsonify({"message": "RUC no encontrado."}), 404
    except requests.exceptions.RequestException as e:
        print(f"Error de conexión con API de RUC: {e}")
        raise ApiError("No se pudo conectar con el servicio de consulta RUC.", 503) # 503 Service Unavailable

def _perform_calculation(monto_total: float, fechas_str: List[str]) -> Dict[str, Any]:
    """Lógica pura para calcular la distribución de montos. No depende de Flask."""
    # Las fechas ya vienen validadas desde el frontend, no es necesario volver a chequear feriados.
    fechas_dt = sorted([parse_date_str(f) for f in fechas_str])

    num_fechas = len(fechas_dt)
    if num_fechas == 0:
        raise ApiError("La lista de fechas no puede estar vacía.", 400)

    # --- Algoritmo de distribución robusto para evitar errores de punto flotante ---
    monto_total_en_centavos = int(round(monto_total * 100))
    monto_base_centavos = monto_total_en_centavos // num_fechas
    centavos_restantes = monto_total_en_centavos % num_fechas

    montos_calculados = []
    for _ in range(num_fechas):
        monto_actual_centavos = monto_base_centavos
        if centavos_restantes > 0:
            monto_actual_centavos += 1
            centavos_restantes -= 1
        montos_calculados.append(monto_actual_centavos / 100.0)

    montos_asignados = defaultdict(float)
    resumen_mensual = defaultdict(float)

    for i, current_date in enumerate(fechas_dt):
        monto_a_asignar = montos_calculados[i]
        date_str = format_date_to_ddmmyyyy(current_date)
        month_key = current_date.strftime("%Y-%m")
        
        montos_asignados[date_str] += monto_a_asignar
        resumen_mensual[month_key] += monto_a_asignar

    return {"montosAsignados": dict(montos_asignados), "resumenMensual": dict(resumen_mensual)}

@api_blueprint.route('/calculate', methods=['POST'])
def calculate_distribution():
    try:
        data = request.get_json()
        monto_total = data.get('montoTotal')
        fechas_str = data.get('fechasValidas')

        if not all([isinstance(monto_total, (int, float)), monto_total > 0, fechas_str]):
            raise ApiError("Parámetros inválidos o faltantes para el cálculo.", 400)
        
        result = _perform_calculation(monto_total, fechas_str)
        return jsonify(result)
    except Exception as e:
        print(f"Error detallado en calculate_distribution: {e}")
        raise ApiError("Error interno en el servidor durante el cálculo.", 500)

@api_blueprint.route('/generate-excel', methods=['POST'])
def generate_excel_report():
    """Genera el reporte Excel desde los datos enviados."""
    try:
        data = request.get_json()
        if not data or not all(k in data for k in ['montoOriginal', 'montosAsignados', 'resumenMensual']):
            raise ApiError("Faltan datos necesarios para generar el reporte.", 400)

        linea = data.get("linea", "otros").lower()
        color_hex = COLOR_PALETTE.get(linea, DEFAULT_COLOR)

        try:
            import openpyxl
        except ImportError:
            print("CRITICAL: El módulo 'openpyxl' no se encontró.")
            raise ApiError("Error de configuración del servidor: dependencia 'openpyxl' no encontrada.", 500)

        wb = openpyxl.Workbook()
        _create_full_report_sheet(wb, data, color_hex)

        excel_file = BytesIO()
        wb.save(excel_file)
        excel_file.seek(0)
        
        sanitized_cliente = _sanitize_filename(data.get('razonSocial', ''))
        sanitized_linea = _sanitize_filename(data.get('linea', ''))
        current_date_str = datetime.now().strftime("%d_%m_%y")
        
        filename = f"reporte_{sanitized_cliente}_{sanitized_linea}_{current_date_str}.xlsx"
        if not sanitized_cliente and not sanitized_linea:
            filename = f"reporte_generado_{current_date_str}.xlsx"

        return Response(
            excel_file.getvalue(),
            mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            headers={'Content-Disposition': f'attachment; filename="{filename}"'}
        )
    except Exception as e:
        import traceback
        print(f"Error en generate_excel_report: {e}")
        traceback.print_exc()
        raise ApiError("Error interno al generar el reporte Excel.", 500)

@api_blueprint.route('/generate-json', methods=['POST'])
def generate_json_report():
    """Genera el reporte/respaldo JSON desde los datos enviados."""
    try:
        data = request.get_json()
        if not data or not all(k in data for k in ['montoOriginal', 'montosAsignados', 'resumenMensual', 'razonSocial', 'linea', 'pedido']):
            raise ApiError("Faltan datos necesarios para generar el reporte JSON.", 400)

        json_data = {
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

        json_content = json.dumps(json_data, indent=4, ensure_ascii=False).encode('utf-8')

        sanitized_cliente = _sanitize_filename(data.get('razonSocial', ''))
        sanitized_linea = _sanitize_filename(data.get('linea', ''))
        current_date_str = datetime.now().strftime("%d_%m_%y")
        
        filename = f"respaldo_{sanitized_cliente}_{sanitized_linea}_{current_date_str}.json"
        if not sanitized_cliente and not sanitized_linea:
            filename = f"respaldo_generado_{current_date_str}.json"

        return Response(
            json_content,
            mimetype='application/json',
            headers={'Content-Disposition': f'attachment; filename="{filename}"'}
        )
    except Exception as e:
        print(f"Error en generate_json_report: {e}")
        raise ApiError("Error interno al generar el reporte JSON.", 500)

# --- Registro y Punto de Entrada ---
app.register_blueprint(api_blueprint, url_prefix='/api')

@https_fn.on_request()
def api(req: https_fn.Request):
    with app.request_context(req.environ):
        return app.full_dispatch_request()
