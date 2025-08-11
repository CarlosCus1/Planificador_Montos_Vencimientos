"""Tests for the services layer."""
import json
from unittest.mock import patch, MagicMock

import pytest

# Importar las funciones y clases a probar desde el módulo de servicios
from services import get_ruc_data, perform_calculation, ApiError, generate_json_service

# --- Pruebas para el Servicio de Consulta de RUC ---

@patch('services.firestore_manager.get_ruc_from_cache')
def test_get_ruc_data_from_cache(mock_get_from_cache):
    """
    Prueba que si el RUC está en caché, se devuelve directamente
    sin llamar a la API externa, optimizando el rendimiento.
    """
    # 1. Configurar el mock del caché para que devuelva datos simulados
    cached_data = {'ruc': '20123456789', 'razonSocial': 'EMPRESA CACHEADA S.A.C.'}
    mock_get_from_cache.return_value = cached_data

    # 2. Llamar a la función del servicio
    result = get_ruc_data('20123456789')

    # 3. Verificar que se llamó al caché y que el resultado es el esperado
    mock_get_from_cache.assert_called_once_with('20123456789')
    assert result == cached_data

@patch(
    'services.firestore_manager.get_ruc_from_cache', return_value=None
)
@patch('services.requests.get')
@patch('services.firestore_manager.get_db')
@patch.dict('os.environ', {'SUNAT_API_TOKEN': 'fake_token'})
def test_get_ruc_data_from_api_and_caches_it(mock_get_db, mock_requests_get, mock_get_from_cache):
    """
    Prueba que si el RUC no está en caché, se llama a la API externa
    y el nuevo resultado se guarda en el caché para futuras consultas.
    """
    # 1. Configurar mocks para la API externa y Firestore
    api_response_mock = MagicMock()
    api_response_mock.status_code = 200
    api_response_mock.json.return_value = {'ruc': '20987654321', 'razonSocial': 'EMPRESA NUEVA S.A.'}
    mock_requests_get.return_value = api_response_mock

    mock_doc = MagicMock()
    mock_get_db.return_value.collection.return_value.document.return_value = mock_doc

    # 2. Llamar a la función del servicio
    result = get_ruc_data('20987654321')

    # 3. Verificar que se consultó el caché, se llamó a la API y se intentó guardar el resultado
    mock_get_from_cache.assert_called_once_with('20987654321')
    mock_requests_get.assert_called_once()
    mock_doc.set.assert_called_once()
    assert result['razonSocial'] == 'EMPRESA NUEVA S.A.'

# --- Pruebas para el Servicio de Cálculo ---

def test_perform_calculation_single_date():
    """Prueba el cálculo con una sola fecha para verificar el caso base."""
    result = perform_calculation(150.50, ["10/10/2025"])
    assert result["montosAsignados"]["10/10/2025"] == 150.50
    assert sum(result["montosAsignados"].values()) == 150.50

def test_perform_calculation_no_dates():
    """Prueba que la función de cálculo falle si no se proporcionan fechas."""
    with pytest.raises(ApiError) as excinfo:
        perform_calculation(100, [])
    assert "The list of dates cannot be empty" in str(excinfo.value)

# --- Pruebas para el Servicio de Generación de JSON ---

def test_generate_json_service():
    """
    Prueba que el servicio de respaldo JSON genere el contenido y el nombre de archivo correctos.
    """
    # 1. Datos de entrada simulados
    test_data = {
        "razonSocial": "Mi Empresa S.A.C.",
        "pedido": "PED-001",
        "montoOriginal": 1000
    }

    # 2. Llamar al servicio
    json_content, filename = generate_json_service(test_data)

    # 3. Verificar el nombre del archivo y el contenido
    assert "respaldo_PED-001-Mi_Empresa_SAC" in filename
    assert filename.endswith(".json")
    
    decoded_content = json.loads(json_content.decode('utf-8'))
    assert decoded_content["montoOriginal"] == 1000
    assert decoded_content["razonSocial"] == "Mi Empresa S.A.C."
