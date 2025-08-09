import { fetchHolidays, fetchGlobalFixedHolidays } from './api.js';

const feriadosCache = new Map();

/**
 * Utilidades para el manejo de fechas
 */
export class DateUtils {
    static MONTH_NAMES_ES_SHORT = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
        "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
    ];

    /**
     * Obtiene la lista de feriados peruanos para un año dado.
     * Primero intenta obtenerlos del caché, si no, los pide a la API.
     * @param {number} year - El año para el cual obtener los feriados.
     * @returns {Promise<string[]>} - Una promesa que resuelve a un array de fechas en formato "DD/MM/YYYY".
     */
    static async obtenerFeriados(year) {
        const cacheKey = `feriados-${year}`;
        
        if (feriadosCache.has(year)) {
            return feriadosCache.get(year);
        }

        const cachedData = sessionStorage.getItem(cacheKey);
        if (cachedData) {
            const feriados = JSON.parse(cachedData);
            feriadosCache.set(year, feriados);
            return feriados;
        }

        try {
            const feriadosArray = await fetchHolidays(year);
            // Almacenar el array de objetos {date: "DD/MM/YYYY", name: "Nombre"}
            feriadosCache.set(year, feriadosArray);
            sessionStorage.setItem(cacheKey, JSON.stringify(feriadosArray));
            return feriadosArray;
        } catch (error) {
            console.error(`Error al obtener los feriados para el año ${year}:`, error);
            throw error; // Relanzar para que el llamador maneje el estado de error.
        }
    }

    /**
     * Formatea un objeto Date a "DD/MM/YYYY"
     * @param {Date} date - La fecha a formatear
     * @returns {string}
     */
    static formatearFecha(date) {
        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const year = date.getFullYear();
        return `${day}/${month}/${year}`;
    }

    /**
     * Convierte un string "DD/MM/YYYY" a un objeto Date
     * @param {string} dateStr - La fecha en formato string
     * @returns {Date}
     */
    static parsearFecha(dateStr) {
        const [day, month, year] = dateStr.split('/');
        return new Date(year, month - 1, day);
    }

    /**
     * Verifica si una fecha es anterior al día de hoy
     * @param {Date} date - La fecha a verificar
     * @returns {boolean}
     */
    static esPasado(date) {
        const hoy = new Date();
        hoy.setHours(0, 0, 0, 0);
        return date < hoy;
    }

    /**
     * Verifica si una fecha es domingo
     * @param {Date} date - La fecha a verificar
     * @returns {boolean}
     */
    static esDomingo(date) {
        return date.getDay() === 0;
    }

    /**
     * Verifica si una fecha está en la lista de feriados
     * @param {string} dateStr - La fecha en formato "DD/MM/YYYY"
     * @param {string[]} feriados - Array de feriados
     * @returns {boolean}
     */
    static esFeriado(dateStr, feriadosSet) {
        return feriadosSet.has(dateStr);
    }

    /**
     * Calcula la diferencia de días entre una fecha y hoy.
     * @param {string} dateStr - La fecha en formato "DD/MM/YYYY"
     * @returns {number} Número de días de diferencia.
     */
    static diasDesdeHoy(dateStr) {
        const hoy = new Date();
        hoy.setHours(0, 0, 0, 0);
        const fecha = this.parsearFecha(dateStr);
        const diffTime = fecha - hoy;
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        return diffDays;
    }

    static obtenerMesAnio(dateStr) {
        // This function must return YYYY-MM to be consistent with the backend
        const date = this.parsearFecha(dateStr);
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        return `${year}-${month}`;
    }

    /**
     * Formats a "YYYY-MM" string to "Month YYYY" for display.
     * @param {string} mesAnioStr - The date string in "YYYY-MM" format.
     * @returns {string}
     */
    static formatearMesAnioDisplay(mesAnioStr) {
        const [year, month] = mesAnioStr.split('-');
        const date = new Date(year, month - 1);
        const monthNames = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
            "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
        ];
        return `${monthNames[date.getMonth()]} ${date.getFullYear()}`;
    }

    /**
     * Formats a Date object to "YYYY-MM-DD" for use in filenames.
     * @param {Date} date - The date to format.
     * @returns {string}
     */
    static formatearParaFilename(date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    /**
     * Formats a Date object to "MM_YY" for use in filenames.
     * @param {Date} date - The date to format.
     * @returns {string}
     */
    static formatearMesAnioParaFilename(date) {
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const year = String(date.getFullYear()).slice(-2); // Get last two digits of the year
        return `${month}_${year}`;
    }
}
