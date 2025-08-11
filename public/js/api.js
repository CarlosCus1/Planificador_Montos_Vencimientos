class ApiError extends Error {
    constructor(message, statusCode, data = null) {
        super(message);
        this.name = 'ApiError';
        this.statusCode = statusCode;
        this.data = data;
    }
}

/**
 * Realiza una petición a la API con reintentos
 * @param {string} url - Endpoint de la API
 * @param {object} options - Opciones de la petición
 * @param {number} retries - Número de reintentos
 * @returns {Promise<Response>} Respuesta de la API
 */
export async function fetchWithRetry(url, options = {}, retries = 3) {
    let lastError;
    
    const fetchOptions = { ...options };
    
    for (let i = 0; i < retries; i++) {
        try {
            const response = await fetch(url,
                {
                    ...fetchOptions,
                    credentials: 'include', // Enviar cookies (necesario para CSRF)
                    headers: {
                        'Content-Type': 'application/json',
                        ...(fetchOptions.headers || {})
                    }
                }
            );
            
            if (!response.ok) {
                try {
                    const errorData = await response.json();
                    throw new ApiError(errorData.message || `Error en el servidor: ${response.status}`, response.status, errorData);
                } catch (e) {
                    if (e instanceof ApiError) throw e;
                    throw new ApiError(`Error en la comunicación con el servidor: ${response.status}`, response.status);
                }
            }
            
            return response;
        } catch (error) {
            lastError = error;
            if (i < retries - 1) {
                await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
            }
        }
    }
    
    throw lastError;
}

/**
 * Obtiene los feriados para un año específico desde la función en la nube.
 * @param {number} year - El año para el cual se solicitan los feriados.
 * @returns {Promise<string[]>} - Una promesa que resuelve a un array de fechas en formato "DD/MM/YYYY".
 */
export async function fetchHolidays(year) {
    try {
        const response = await fetchWithRetry(`/api/getHolidays?year=${year}`);
        return await response.json();
    } catch (error) {
        console.error('Error al obtener los feriados:', error);
        throw error; // Relanzar el error para que el llamador pueda manejarlo.
    }
}

/**
 * Consulta el RUC usando una API externa.
 * @param {string} ruc - El RUC a consultar.
 * @returns {Promise<any>} - La respuesta de la API.
 */
export async function consultarRuc(numero) {
    const response = await fetchWithRetry(`/api/consultar-ruc?numero=${encodeURIComponent(numero)}`);
    return response.json();
}

/**
 * Realiza el cálculo de distribución
 * @param {object} data - Datos para el cálculo
 * @returns {Promise<object>} Resultados del cálculo
 */
export async function calcular(data) {
    const response = await fetchWithRetry('/api/calculate', {
        method: 'POST',
        body: JSON.stringify(data)
    });
    return response.json();
}

/**
 * Genera el reporte en formato Excel.
 * @param {object} data - Datos para el reporte.
 * @returns {Promise<Blob>} Un blob con el contenido del archivo .xlsx.
 */
export async function generarReporte(data) {
    const response = await fetchWithRetry('/api/generate-excel', {
        method: 'POST',
        body: JSON.stringify(data)
    });
    return response.blob();
}

export async function generarReporteJson(data) {
    const response = await fetchWithRetry('/api/generate-json', {
        method: 'POST',
        body: JSON.stringify(data)
    });
    return response.blob();
}
