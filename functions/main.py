"""Main application file for the Flask API."""
import json
import traceback
from datetime import datetime
from io import BytesIO

from flask import Flask, request, jsonify, Blueprint, Response
from flask_cors import CORS
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from firebase_functions import https_fn

import services
from services import ApiError, COLOR_PALETTE, DEFAULT_COLOR, _sanitize_filename
from utils import parse_date_str

import openpyxl

# --- Configuración de la Aplicación Flask ---
app = Flask(__name__)
CORS(app)

# --- Configuración de Rate Limiter ---
limiter = Limiter(
    get_remote_address,
    app=app,
    default_limits=[
        "200 per day",
        "50 per hour"
    ],
    storage_uri="memory://",  # 'memory://' es suficiente para Cloud Functions (cada instancia tiene su propio límite)
)

api_blueprint = Blueprint('api', __name__)

# --- Manejadores de Errores ---
@app.errorhandler(ApiError)
def handle_api_error(error):
    """Maneja errores controlados de la API."""
    response = jsonify(error.to_dict())
    response.status_code = error.status_code
    return response

@app.errorhandler(Exception)
def handle_exception(e):
    """Maneja errores inesperados y no controlados."""
    traceback.print_exc()
    response = jsonify({'message': 'Ocurrió un error interno en el servidor.'})
    response.status_code = 500
    return response

@api_blueprint.route('/getHolidays', methods=['GET'])
@limiter.limit("30 per minute") # Límite más suave para feriados
def get_holidays():
    """API endpoint to get holidays for a given year."""
    year_str = request.args.get('year')
    if not year_str or not year_str.isdigit():
        raise ApiError("Parámetro 'year' es requerido y debe ser un número.", 400)
    
    holidays_list = services.get_holidays_for_year(int(year_str))
    return jsonify(holidays_list)

@api_blueprint.route('/consultar-ruc', methods=['GET'])
@limiter.limit("10 per minute") # Límite estricto para la consulta de RUC
def consultar_ruc():
    """API endpoint to consult RUC data."""
    ruc_number = request.args.get('numero')
    if not ruc_number:
        raise ApiError("El parámetro 'numero' es requerido.", 400)
    
    ruc_data = services.get_ruc_data(ruc_number)
    return jsonify(ruc_data)

@api_blueprint.route('/calculate', methods=['POST'])
def calculate_distribution():
    """API endpoint to calculate distribution."""
    try:
        data = request.get_json()
        monto_total = data.get('montoTotal')
        fechas_str = data.get('fechasValidas')

        if not all([
            isinstance(monto_total, (int, float)),
            monto_total > 0,
            fechas_str
        ]):
            raise ApiError("Parámetros inválidos o faltantes para el cálculo.", 400)
        
        result = services.perform_calculation(monto_total, fechas_str)
        return jsonify(result)
    except Exception as e:
        print(f"Error detallado en calculate_distribution: {e}")
        raise ApiError("Error interno en el servidor durante el cálculo.", 500) from e

@api_blueprint.route('/generate-excel', methods=['POST'])
def generate_excel_report():
    """Genera el reporte Excel desde los datos enviados."""
    try:
        data = request.get_json()
        if not data or not all(k in data for k in [
            'montoOriginal', 'montosAsignados', 'resumenMensual'
        ]):
            raise ApiError("Faltan datos necesarios para generar el reporte.", 400)

        # La lógica de negocio se delega completamente al servicio.
        # Esto corrige el bug que llamaba a una función inexistente y centraliza la lógica.
        excel_file_io, filename = services.generate_excel_service(data)

        return Response(
            excel_file_io.getvalue(),
            mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            headers={
                'Content-Disposition': f'attachment; filename="{filename}"'
            }
        )
    except Exception as e:
        print(f"Error en generate_excel_report: {e}")
        traceback.print_exc()
        raise ApiError("Error interno al generar el reporte Excel.", 500) from e

@api_blueprint.route('/generate-json', methods=['POST'])
def generate_json_report():
    """Genera el reporte/respaldo JSON desde los datos enviados."""
    try:
        data = request.get_json()
        if not data or not all(k in data for k in [
            'montoOriginal', 'montosAsignados', 'resumenMensual',
            'razonSocial', 'linea', 'pedido'
        ]):
            raise ApiError("Faltan datos necesarios para generar el reporte JSON.", 400)

        # La lógica de negocio se delega completamente al servicio.
        json_content_bytes, filename = services.generate_json_service(data)

        return Response(
            json_content_bytes,
            mimetype='application/json',
            headers={
                'Content-Disposition': f'attachment; filename="{filename}"'
            }
        )
    except Exception as e:
        print(f"Error en generate_json_report: {e}")
        raise ApiError("Error interno al generar el reporte JSON.", 500) from e

# --- Registro y Punto de Entrada ---
app.register_blueprint(api_blueprint, url_prefix='/api')

@https_fn.on_request()
def api(req: https_fn.Request):
    """Main entry point for Firebase Functions HTTP requests."""
    with app.request_context(req.environ):
        return app.full_dispatch_request()