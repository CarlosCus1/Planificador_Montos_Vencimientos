"""Utility functions for date manipulation and string sanitization."""
from datetime import datetime, date

MONTH_NAMES_ES = [
    "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", 
    "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
]

def parse_date_str(date_str: str) -> date:
    """Parses a date string in DD/MM/YYYY format to a date object."""
    return datetime.strptime(date_str, '%d/%m/%Y').date()

def format_month_year_es(date_obj: date) -> str:
    """Formatea una fecha a 'Mes Año' en español, ej: 'Enero 2023'."""
    return f"{MONTH_NAMES_ES[date_obj.month - 1]} {date_obj.year}"

def format_date_to_ddmmyyyy(date_obj: date) -> str:
    """Formats a date object to DD/MM/YYYY string format."""
    return date_obj.strftime("%d/%m/%Y")

def _sanitize_filename(name: str) -> str:
    """Sanitizes a string to be a valid filename."""
    if not name:
        return ""
    sanitized = "".join(c for c in name if c.isalnum() or c in (' ', '_', '-')).strip()
    return "_".join(sanitized.split())

def _lighten_color(hex_color, factor=0.5):
    """Aclara un color hexadecimal mezclándolo con blanco."""
    hex_color = hex_color.lstrip('#')
    rgb = tuple(int(hex_color[i:i+2], 16) for i in (0, 2, 4))
    
    new_rgb = [int(val + (255 - val) * factor) for val in rgb]
    
    return f'{new_rgb[0]:02X}{new_rgb[1]:02X}{new_rgb[2]:02X}'
