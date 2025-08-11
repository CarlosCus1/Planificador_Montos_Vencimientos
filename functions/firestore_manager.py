"""Module for managing Firestore interactions and caching."""
from datetime import datetime, timedelta
from typing import Dict, List

import firebase_admin
from firebase_admin import firestore

from shared.date_utils import calcular_feriados_pascuas

HOLIDAYS_COLLECTION = 'holidays'
RUC_CACHE_COLLECTION = 'ruc_cache'
RUC_CACHE_DAYS = 7

DB_CLIENT = None

def get_db():
    """Obtiene una instancia del cliente de Firestore, inicializándola si es necesario."""
    global DB_CLIENT
    if DB_CLIENT is None:
        try:
            firebase_admin.get_app()
        except ValueError:
            firebase_admin.initialize_app()
        DB_CLIENT = firestore.client()
    return DB_CLIENT

yearly_holidays_cache = {}
GLOBAL_FIXED_HOLIDAYS_CACHE = None

def _get_fixed_holidays_from_db() -> Dict[str, str]:
    """Lee los feriados fijos de la DB."""
    db_client = get_db()
    global_fixed_holidays: Dict[str, str] = {}
    try:
        docs = db_client.collection(HOLIDAYS_COLLECTION).stream()
        for doc in docs:
            data = doc.to_dict()
            if 'day' in data and 'month' in data:
                global_fixed_holidays[f"{data['day']:02d}/{data['month']:02d}"] = \
                    data.get('name', '')
        return global_fixed_holidays
    except Exception as e:
        print(f"Error al cargar feriados fijos desde Firestore: {e}")
        raise ApiError("Failed to load fixed holidays from database.", 500) from e

def get_all_holidays_for_year(year: int) -> List[Dict[str, str]]:
    """Obtiene todos los feriados para un año, usando caché."""
    global GLOBAL_FIXED_HOLIDAYS_CACHE
    
    if year in yearly_holidays_cache:
        return yearly_holidays_cache[year]

    # El caché de feriados fijos (ej. "01/01" -> "Año Nuevo") se carga una sola vez
    # desde Firestore para evitar lecturas repetidas en la misma instancia de la función.
    if GLOBAL_FIXED_HOLIDAYS_CACHE is None:
        print("Cargando feriados fijos desde Firestore (primera vez)...")
        GLOBAL_FIXED_HOLIDAYS_CACHE = _get_fixed_holidays_from_db()

    # Los feriados de Pascua se calculan para el año específico, ya que varían.
    easter_holidays = calcular_feriados_pascuas(year)
    # Se combinan los feriados fijos (cíclicos) con los de Pascua (variables).
    all_holidays = {**GLOBAL_FIXED_HOLIDAYS_CACHE, **easter_holidays}
    
    # Se construye la lista final, aplicando el año solicitado a cada feriado.
    # Esto asegura que "01/01" se convierta en "01/01/2024", "01/01/2025", etc.
    result = [
        {'date': f"{date_str}/{year}", 'name': name}
        for date_str, name in all_holidays.items()
    ]
    yearly_holidays_cache[year] = result
    return result

def get_ruc_from_cache(ruc_number: str):
    """Retrieves RUC data from cache if available and not expired."""
    cached_doc = get_db().collection(RUC_CACHE_COLLECTION).document(ruc_number).get()
    if cached_doc.exists:
        cached_data = cached_doc.to_dict()
        timestamp = cached_data.get('timestamp')
        if (timestamp and isinstance(timestamp, datetime) and
                (datetime.now(timestamp.tzinfo) - timestamp) < timedelta(days=RUC_CACHE_DAYS)):
            return cached_data
    return None
