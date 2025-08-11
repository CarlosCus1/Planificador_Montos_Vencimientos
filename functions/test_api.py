"""Tests for the API endpoints."""
import json
from unittest.mock import patch

import pytest

# Importar la app de Flask
from main import app

# Datos de feriados fijos simulados, basados en el JSON proporcionado
MOCK_HOLIDAYS_DATA = [
    {'date': '01/01/2024', 'name': 'Año Nuevo'},
    {'date': '01/05/2024', 'name': 'Día del Trabajo'},
    {'date': '29/06/2024', 'name': 'San Pedro y San Pablo'},
    {'date': '23/07/2024', 'name': 'Día de la Fuerza Aérea'},
    {'date': '28/07/2024', 'name': 'Fiestas Patrias'},
    {'date': '29/07/2024', 'name': 'Fiestas Patrias'},
    {'date': '06/08/2024', 'name': 'Batalla de Junín'},
    {'date': '30/08/2024', 'name': 'Santa Rosa de Lima'},
    {'date': '08/10/2024', 'name': 'Combate de Angamos'},
    {'date': '01/11/2024', 'name': 'Todos los Santos'},
    {'date': '08/12/2024', 'name': 'Inmaculada Concepción'},
    {'date': '09/12/2024', 'name': 'Batalla de Ayacucho'},
    {'date': '25/12/2024', 'name': 'Navidad'},
    {'date': '28/03/2024', 'name': 'Jueves Santo'},
    {'date': '29/03/2024', 'name': 'Viernes Santo'}
]


@pytest.fixture
def client():
    """Configura un cliente de prueba para la aplicación Flask."""
    app.config['TESTING'] = True
    with app.test_client() as client:
        yield client


@patch('services.get_holidays_for_year')
def test_get_holidays_success(mock_get_holidays_for_year, client):
    """
    Prueba que el endpoint /api/getHolidays funcione correctamente.
    - Simula la respuesta de services.get_holidays_for_year.
    - Llama al endpoint.
    - Verifica que la respuesta sea correcta y completa.
    """
    # 1. Configurar el mock del servicio
    mock_get_holidays_for_year.return_value = MOCK_HOLIDAYS_DATA

    # 2. Realizar la llamada a la API
    test_year = 2024
    response = client.get(f'/api/getHolidays?year={test_year}')

    # 3. Verificar la respuesta
    assert response.status_code == 200
    
    response_data = response.get_json()
    assert isinstance(response_data, list)

    # 4. Verificar contenido
    assert response_data == MOCK_HOLIDAYS_DATA
    
    # Verificar que el servicio fue llamado con el año correcto
    mock_get_holidays_for_year.assert_called_once_with(test_year)


def test_get_holidays_missing_year(client):
    """
    Prueba que el endpoint devuelva un error 400 si falta el parámetro 'year'.
    """
    response = client.get('/api/getHolidays')
    assert response.status_code == 400
    
    response_data = response.get_json()
    assert 'message' in response_data
    assert "Parámetro 'year' es requerido" in response_data['message']