/**
 * Gestor de búsqueda de RUC
 */
import { consultarRuc } from './api.js';

export class RUCManager {
    constructor() {
        this.rucInput = document.getElementById('ruc');
        this.rucError = document.getElementById('error-ruc');
        this.rucLoading = document.getElementById('ruc-loading');
        this.rucResult = document.getElementById('ruc-result');
        this.razonSocialManualMessage = document.getElementById('manual-razon-social-message');
        this.descClienteInput = document.getElementById('desc-cliente');
        this.lastRUC = '';
        
        this.setupEventListeners();
    }

    /**
     * Configura los event listeners
     */
    setupEventListeners() {
        this.rucInput.addEventListener('input', this.handleInput.bind(this));
        this.rucInput.addEventListener('blur', this.handleBlur.bind(this));
        this.rucInput.addEventListener('keydown', this.handleKeyDown.bind(this)); // Nuevo listener para Enter
    }

    /**
     * Maneja el evento input del RUC
     * @param {Event} event - Evento de input
     */
    handleInput(event) {
        const ruc = event.target.value.replace(/\D/g, '');
        event.target.value = ruc;
        
        // Limpiar errores si el RUC no tiene 11 dígitos
        if (ruc.length !== 11) {
            this.ocultarError();
            this.rucResult.hidden = true;
            this.rucResult.innerHTML = '';
            // No resetear lastRUC aquí para permitir re-búsqueda si el usuario corrige
        }
    }

    /**
     * Maneja el evento blur del RUC (cuando el campo pierde el foco)
     */
    handleBlur() {
        this._triggerRucSearch();
    }

    /**
     * Maneja el evento keydown del RUC (para detectar la tecla Enter)
     * @param {KeyboardEvent} event - Evento de teclado
     */
    handleKeyDown(event) {
        if (event.key === 'Enter') {
            event.preventDefault(); // Prevenir el envío del formulario
            this._triggerRucSearch();
        }
    }

    /**
     * Dispara la búsqueda de RUC si el número tiene 11 dígitos y ha cambiado.
     */
    _triggerRucSearch() {
        const ruc = this.rucInput.value.trim();

        if (ruc.length === 11) {
            if (ruc !== this.lastRUC) {
                this.buscarRUC(ruc);
                this.lastRUC = ruc;
            } else if (this.rucResult.innerHTML !== '') {
                // If RUC hasn't changed, but user tries to search again, show current result
                this.rucResult.hidden = false;
            }
        } else if (ruc.length > 0) {
            this.mostrarError('El RUC debe tener 11 dígitos');
        } else {
            this.reset(); // If field is empty, reset
        }
    }

    /**
     * Realiza la búsqueda del RUC
     * @param {string} ruc - Número de RUC
     */
    async buscarRUC(ruc) {
        this.mostrarCargando();
        this.ocultarError();
        this.razonSocialManualMessage.hidden = true; // Ocultar mensaje manual al iniciar búsqueda
        
        try {
            const resultado = await consultarRuc(ruc);
            this.mostrarResultado(resultado);
        } catch (error) {
            console.error('Error buscando RUC:', error);
            this.mostrarError(error.message || 'No se pudo consultar el RUC.');
            if (error.data && error.data.allowManual) {
                this.habilitarRazonSocialManual();
            } else {
                this.habilitarRazonSocialManual('Error al consultar RUC. Puede ingresar la razón social manualmente.');
            }
        } finally {
            this.ocultarCargando();
        }
    }

    /**
     * Muestra el indicador de carga
     */
    mostrarCargando() {
        this.rucLoading.hidden = false;
        this.rucLoading.querySelector('span').textContent = 'Buscando RUC...'; // Mensaje más específico
        this.rucInput.disabled = true;
    }

    mostrarValidando() {
        this.rucLoading.hidden = false;
        this.rucLoading.querySelector('span').textContent = 'Validando RUC...';
    }

    /**
     * Oculta el indicador de carga
     */
    ocultarCargando() {
        this.rucLoading.hidden = true;
        this.rucInput.disabled = false;
    }

    /**
     * Muestra un mensaje de error
     * @param {string} mensaje - Mensaje a mostrar
     */
    mostrarError(mensaje) {
        this.rucError.textContent = mensaje;
        this.rucError.hidden = false;
        this.rucInput.classList.add('error');
    }

    /**
     * Oculta el mensaje de error
     */
    ocultarError() {
        this.rucError.hidden = true;
        this.rucInput.classList.remove('error');
    }

    /**
     * Muestra el resultado de la búsqueda
     * @param {object} data - Datos del RUC
     */
    mostrarResultado(data) {
        const estado = data.estado || 'OTRO';
        const condicion = data.condicion || 'OTRO';

        // Mapear los estados a clases CSS para los badges
        const estadoClass = estado.toLowerCase().includes('activo') ? 'activo' : 'inactivo';
        const condicionClass = condicion.toLowerCase().includes('habido') ? 'habido' : 'inactivo';

        this.rucResult.innerHTML = `
            <div class="ruc-result-item">
                <strong>Razón Social:</strong>
                <span>${data.razonSocial || 'No disponible'}</span>
            </div>
            <div class="ruc-result-item">
                <strong>Estado:</strong>
                <span class="ruc-result-status ${estadoClass}">${estado}</span>
            </div>
            <div class="ruc-result-item">
                <strong>Condición:</strong>
                <span class="ruc-result-status ${condicionClass}">${condicion}</span>
            </div>
        `;
        this.rucResult.hidden = false;
        
        // Autocompletar razón social si está disponible
        if (data.razonSocial) {
            this.descClienteInput.value = data.razonSocial;
            this.razonSocialManualMessage.hidden = true; // Ocultar mensaje manual
        } else {
            this.razonSocialManualMessage.textContent = 'Razón social no encontrada. Puede ingresarla manualmente.';
            this.razonSocialManualMessage.hidden = false;
            this.descClienteInput.focus();
        }
    }

    /**
     * Resetea el estado del componente de RUC a su estado inicial.
     */
    reset() {
        this.lastRUC = '';
        this.rucInput.value = '';
        this.rucResult.hidden = true;
        this.rucResult.innerHTML = '';
        this.descClienteInput.value = ''; // Limpiar el campo
        this.descClienteInput.readOnly = false; // Permitir siempre la entrada manual
        this.razonSocialManualMessage.textContent = 'Puede ingresar la razón social manualmente.';
        this.razonSocialManualMessage.hidden = false;
        this.ocultarError();
    }

    /**
     * Habilita la entrada manual de la razón social
     */
    habilitarRazonSocialManual(message = 'Puede ingresar la razón social manualmente.') {
        this.descClienteInput.readOnly = false;
        this.descClienteInput.value = ''; // Limpiar el campo para entrada manual
        this.razonSocialManualMessage.textContent = message;
        this.razonSocialManualMessage.hidden = false;
    }
}
