from datetime import datetime, date, timedelta
from typing import Dict

def calcular_feriados_pascuas(year: int) -> Dict[str, str]:
    """Calcula Jueves y Viernes Santo para un año dado usando el algoritmo de Gauss."""
    a = year % 19
    b = year // 100
    c = year % 100
    d = b // 4
    e = b % 4
    f = (b + 8) // 25
    g = (b - f + 1) // 3
    h = (19 * a + b - d - g + 15) % 30
    i = c // 4
    k = c % 4
    l = (32 + 2 * e + 2 * i - h - k) % 7
    m = (a + 11 * h + 22 * l) // 451
    month = (h + l - 7 * m + 114) // 31
    day = ((h + l - 7 * m + 114) % 31) + 1
    domingo_pascua = datetime(year, month, day)
    jueves_santo = domingo_pascua - timedelta(days=3)
    viernes_santo = domingo_pascua - timedelta(days=2)
    return {
        jueves_santo.strftime('%d/%m'): "Jueves Santo",
        viernes_santo.strftime('%d/%m'): "Viernes Santo"
    }
