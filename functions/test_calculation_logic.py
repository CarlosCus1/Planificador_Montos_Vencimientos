import os
import sys
import json
import time

# Añadir el directorio raíz del proyecto al path para permitir importaciones
project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
sys.path.insert(0, project_root)

# Importar la función de lógica pura y la clase de error
from functions.main import _perform_calculation, ApiError

def test_calculation():
    """
    Simula una llamada a la lógica de cálculo para probar su rendimiento y corrección.
    """
    print("--- Iniciando prueba de lógica de cálculo ---")

    # 1. Simular el payload que enviaría el frontend
    sample_payload = {
        "montoTotal": 5000.00,
        "fechasValidas": [
            "15/08/2024",
            "16/08/2024",
            "19/08/2024",
            "20/08/2024",
            "21/08/2024"
        ]
    }
    print(f"Payload de prueba: {json.dumps(sample_payload, indent=2)}")

    # 2. Llamar directamente a la función de lógica pura y medir el tiempo
    try:
        start_time = time.time()
        result = _perform_calculation(
            monto_total=sample_payload["montoTotal"],
            fechas_str=sample_payload["fechasValidas"]
        )
        duration = (time.time() - start_time) * 1000  # en milisegundos

        print(f"\n--- ¡Cálculo exitoso! (Duración: {duration:.2f} ms) ---")
        print("Resultado:")
        print(json.dumps(result, indent=2))
    except ApiError as e:
        print(f"\n--- ERROR durante el cálculo: {e.message} (Código: {e.status_code}) ---")

if __name__ == "__main__":
    test_calculation()