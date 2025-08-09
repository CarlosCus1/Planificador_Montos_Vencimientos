/**
 * Configuración global de la aplicación
 */
export const MAX_FECHAS = 160;
export const MAX_AMOUNT = 10000000;
export const MAX_CLIENT_DESC_LENGTH = 100;
export const MAX_PEDIDO_LENGTH = 50;

export const COLOR_PALETTES = {
    viniball: { // Paleta de Rojos
        background: 'rgba(255, 99, 132, 0.2)',
        border: 'rgba(255, 99, 132, 1)'
    },
    vinifan: { // Paleta de Azules
        background: 'rgba(54, 162, 235, 0.2)',
        border: 'rgba(54, 162, 235, 1)'
    },
    otros: { // Paleta de Verdes
        background: 'rgba(75, 192, 192, 0.2)',
        border: 'rgba(75, 192, 192, 1)'
    }
};

export const LABELS = {
    error_invalid_amount: `Monto máximo permitido: S/${MAX_AMOUNT.toLocaleString()}`,
    error_no_dates: 'Seleccione al menos una fecha',
    error_ruc: 'El RUC debe tener 11 dígitos numéricos',
    error_razon_social_empty: 'La razón social no puede estar vacía',
    loading_ruc: 'Buscando información del RUC...'
};