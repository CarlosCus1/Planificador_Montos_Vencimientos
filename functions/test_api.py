
import pytest
import json
from unittest.mock import patch, MagicMock

# Importar la app de Flask y la lógica de cálculo de feriados desde main
# Es importante asegurarse de que el path permita esta importación
from functions.main import app, calcular_feriados_pascuas

# Datos de feriados fijos simulados, basados en el JSON proporcionado
MOCK_FIXED_HOLIDAYS_DATA = {
    "01/01": "Año Nuevo",
    "01/05": "Día del Trabajo",
    "29/06": "San Pedro y San Pablo",
    "23/07": "Día de la Fuerza Aérea",
    "28/07": "Fiestas Patrias",
    "29/07": "Fiestas Patrias",
    "06/08": "Batalla de Junín",
    "30/08": "Santa Rosa de Lima",
    "08/10": "Combate de Angamos",
    "01/11": "Todos los Santos",
    "08/12": "Inmaculada Concepción",
    "09/12": "Batalla de Ayacucho",
    "25/12": "Navidad"
}

@pytest.fixture
def client():
    """Configura un cliente de prueba para la aplicación Flask."""
    app.config['TESTING'] = True
    with app.test_client() as client:
        yield client

def _create_mock_firestore_docs_from_dict(data: dict):
    """
    Convierte un diccionario de feriados (como el JSON) en una lista de
    documentos mock de Firestore.
    """
    mock_docs = []
    for date_str, name in data.items():
        day, month = map(int, date_str.split('/'))
        mock_doc = MagicMock()
        mock_doc.to_dict.return_value = {'day': day, 'month': month, 'name': name}
        mock_docs.append(mock_doc)
    return mock_docs

@patch('functions.main.firestore.client')
def test_get_holidays_success(mock_firestore_client, client):
    """
    Prueba que el endpoint /api/getHolidays funcione correctamente.
    - Simula la respuesta de Firestore.
    - Llama al endpoint.
    - Verifica que la respuesta sea correcta y completa.
    """
    # 1. Configurar el mock de Firestore
    # Crear documentos mock a partir de nuestros datos
    mock_docs = _create_mock_firestore_docs_from_dict(MOCK_FIXED_HOLIDAYS_DATA)
    
    # Configurar la cadena de llamadas para que devuelva los mocks
    mock_firestore_client.return_value.collection.return_value.stream.return_value = mock_docs

    # 2. Realizar la llamada a la API
    test_year = 2024
    response = client.get(f'/api/getHolidays?year={test_year}')

    # 3. Verificar la respuesta
    assert response.status_code == 200
    
    response_data = response.get_json()
    assert isinstance(response_data, list)

    # 4. Verificar contenido
    # Convertir la respuesta en un diccionario para búsquedas fáciles
    response_holidays = {item['date']: item['name'] for item in response_data}

    # Verificar un feriado fijo
    assert response_holidays.get(f'01/01/{test_year}') == 'Año Nuevo'
    # Verificar otro feriado fijo
    assert response_holidays.get(f'25/12/{test_year}') == 'Navidad'

    # Verificar feriados de Pascua para 2024 (Jueves y Viernes Santo)
    # Jueves Santo 2024: 28 de Marzo
    # Viernes Santo 2024: 29 de Marzo
    assert f'28/03/{test_year}' in response_holidays
    assert f'29/03/{test_year}' in response_holidays
    
    # Verificar el número total de feriados (fijos + pascua)
    # 13 fijos + 2 de pascua = 15
    assert len(response_data) == 15

def test_get_holidays_missing_year(client):
    """
    Prueba que el endpoint devuelva un error 400 si falta el parámetro 'year'.
    """
    response = client.get('/api/getHolidays')
    assert response.status_code == 400
    
    response_data = response.get_json()
    assert 'message' in response_data
    assert "Parámetro 'year' es requerido" in response_data['message']

