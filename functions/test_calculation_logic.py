"""Tests for the calculation logic in services.py."""
import pytest
from services import perform_calculation, ApiError

def test_perform_calculation_success():
    """Tests that the calculation is performed correctly with valid data."""
    monto_total = 5000.00
    fechas_str = [
        "15/08/2024",
        "16/08/2024",
        "19/08/2024",
        "20/08/2024",
        "21/08/2024"
    ]

    result = perform_calculation(monto_total, fechas_str)

    assert "montosAsignados" in result
    assert "resumenMensual" in result

    assert len(result["montosAsignados"]) == 5
    assert round(sum(result["montosAsignados"].values()), 2) == monto_total

    # Check monthly summary
    assert "2024-08" in result["resumenMensual"]
    assert round(result["resumenMensual"]["2024-08"], 2) == monto_total

def test_perform_calculation_empty_dates():
    """Tests that an ApiError is raised when the list of dates is empty."""
    with pytest.raises(ApiError) as excinfo:
        perform_calculation(5000.00, [])
    
    assert excinfo.value.status_code == 400
    assert "The list of dates cannot be empty" in excinfo.value.message