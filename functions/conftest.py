"""Pytest configuration file."""
import sys
import os

# Añadir el directorio 'functions' a la ruta de Python para que las importaciones funcionen.
# Esto permite que los tests encuentren módulos como 'shared' directamente.
sys.path.insert(0, os.path.abspath(os.path.dirname(__file__)))
