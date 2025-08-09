/**
 * Utilidades para la interfaz de usuario
 */
export class UIUtils {
    /**
     * Limpia una cadena de texto para ser usada en un nombre de archivo,
     * eliminando o reemplazando caracteres no seguros o especiales.
     * @param {string} str - La cadena a normalizar.
     * @returns {string} La cadena normalizada.
     */
    static normalizeStringForFilename(str) {
        if (typeof str !== 'string' || !str) return '';

        let cleanStr = str.toString();

        // Reemplazar espacios con guiones bajos
        cleanStr = cleanStr.replace(/\s+/g, '_');

        // Normalizar caracteres acentuados y eliminar diacríticos (ej. "é" -> "e")
        cleanStr = cleanStr.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

        // Eliminar caracteres especiales que son problemáticos en nombres de archivo
        cleanStr = cleanStr.replace(/[^a-zA-Z0-9_.-]/g, ''); // Permitir guiones y puntos

        // Eliminar guiones bajos o guiones al inicio o final si los hubiera por los reemplazos anteriores
        cleanStr = cleanStr.replace(/^_+|_+$/g, '');
        cleanStr = cleanStr.replace(/^-+|-+$/g, '');
        cleanStr = cleanStr.replace(/^\.+|\.+$/g, ''); // Eliminar puntos al inicio/final

        return cleanStr;
    }

    /**
     * Muestra un mensaje toast
     * @param {string} mensaje - Texto a mostrar
     * @param {string} tipo - Tipo de toast (success, error, info)
     * @param {number} duracion - Duración en milisegundos (opcional)
     */
    static mostrarToast(mensaje, tipo = 'info', duracion = 5000) {
        const container = document.getElementById('toast-container');
        if (!container) return;
        
        const toast = document.createElement('div');
        toast.className = `toast ${tipo}`;
        toast.setAttribute('aria-live', 'polite');
        
        const messageSpan = document.createElement('span');
        messageSpan.textContent = mensaje;
        toast.appendChild(messageSpan);

        const closeButton = document.createElement('button');
        closeButton.className = 'toast-close-btn';
        closeButton.textContent = 'X';
        closeButton.setAttribute('aria-label', 'Cerrar notificación');
        toast.appendChild(closeButton);

        closeButton.addEventListener('click', () => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(20px)';
            setTimeout(() => toast.remove(), 300);
        });
        
        container.appendChild(toast);
        
        // Animación de entrada
        setTimeout(() => {
            toast.style.opacity = '1';
            toast.style.transform = 'translateY(0)';
        }, 10);
        
        // Eliminar después de la duración
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(20px)';
            setTimeout(() => toast.remove(), 300);
        }, duracion);
    }

    /**
     * Muestra u oculta el indicador de carga
     * @param {boolean} mostrar - True para mostrar, false para ocultar
     * @param {string} mensaje - Mensaje a mostrar (opcional)
     */
    static mostrarLoading(mostrar, mensaje = 'Cargando...') {
        const overlay = document.getElementById('loading-overlay');
        const mensajeEl = document.getElementById('loading-message');
        
        if (overlay) {
            overlay.style.display = mostrar ? 'flex' : 'none';
        }
        
        if (mensajeEl) {
            mensajeEl.textContent = mensaje;
        }
    }

    /**
     * Sanitiza una entrada para prevenir XSS
     * @param {string} input - Texto a sanitizar
     * @param {number} maxLength - Longitud máxima
     * @returns {string} Texto sanitizado
     */
    static sanitizeInput(input, maxLength = 100) {
        if (typeof input !== 'string') return '';
        
        // Eliminar etiquetas HTML y limitar longitud
        return input.replace(/<[^>]*>/g, '').substring(0, maxLength);
    }

    /**
     * Descarga un archivo desde un blob
     * @param {Blob} blob - Contenido del archivo
     * @param {string} filename - Nombre del archivo
     */
    static downloadFile(blob, filename) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.style.display = 'none';
        
        document.body.appendChild(a);
        a.click();
        
        setTimeout(() => {
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }, 100);
    }

    /**
     * Actualiza el año actual en el footer
     */
    static actualizarAnioFooter() {
        const yearElement = document.getElementById('current-year');
        if (yearElement) {
            yearElement.textContent = new Date().getFullYear();
        }
    }
}
