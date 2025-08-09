import { ThemeManager } from './themeManager.js';
import { DateUtils } from './dateUtils.js';
import { UIUtils } from './uiUtils.js';
import { RUCManager } from './rucManager.js';
import { GraficoManager } from './graficoManager.js';
import { FormValidator } from './formValidator.js';
import { FileManager } from './fileManager.js';
import { calcular, generarReporte, generarReporteJson } from './api.js';
import { MAX_FECHAS, MAX_AMOUNT, LABELS } from './config.js';

// FIX: Definir la constante de meses en español para que esté disponible en el frontend.
const MONTH_NAMES_ES = [
    "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", 
    "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
];

class PlanificadorApp {
    constructor() {
        this.state = {
            montoOriginal: 0,
            selectedDates: new Set(),
            fechasOrdenadas: [],
            montosAsignados: {},
            resumenMensual: {},
            cliente: '',
            ruc: '',
            descCliente: '',
            linea: '',
            pedido: '',
            codigoCliente: ''
        };
        
        this.feriadosCargados = new Map(); // Para almacenar los feriados cargados y usarlos en handleDayCellMount
        
        this.components = {
            calendario: null,
            grafico: null,
            rucManager: null
        };
        
        this.init = this.init.bind(this);
        this.calcular = this.calcular.bind(this);
    }

    /**
     * Actualiza el estado de la aplicación de forma inmutable.
     */
    updateState(newState) {
        this.state = { ...this.state, ...newState };
    }

    async init() {
        try {
            this.initComponents();
            this.setupEventListeners();
            UIUtils.actualizarAnioFooter();
            this._updateProgressIndicator(0); // Inicializa el indicador en la primera página
        } catch (error) {
            console.error('Error inicializando aplicación:', error);
            UIUtils.mostrarToast('Error al iniciar la aplicación', 'error');
        }
    }

    initComponents() {
        this.initCalendar();

        this.components.grafico = new GraficoManager();
        this.components.rucManager = new RUCManager();
        
        // Inicializar elementos del DOM
        this.elements = {
            pages: document.querySelectorAll('.page'),
            montoInput: document.getElementById('monto'),
            rucInput: document.getElementById('ruc'),
            descClienteInput: document.getElementById('desc-cliente'), // Ya estaba
            lineaInput: document.getElementById('linea'),
            pedidoInput: document.getElementById('pedido'),
            codigoClienteInput: document.getElementById('codigo-cliente'),
            btnSiguiente: document.getElementById('btn-siguiente'),
            btnAtras: document.getElementById('btn-atras'),
            btnCalcular: document.getElementById('btn-calcular'),
            btnDescargarReportes: document.getElementById('btn-descargar-reportes'), // Nuevo botón para ambas descargas
            btnActualizarCalculos: document.getElementById('btn-actualizar-calculos'),
            btnDeselectAll: document.getElementById('btn-deselect-all'),
            btnCargarYDescargar: document.getElementById('btn-cargar-y-descargar'), // Nuevo botón para flujo directo
            btnCargarRespaldo: document.getElementById('btn-cargar-respaldo'), // Nuevo botón para carga de respaldo con opciones
            themeToggle: document.getElementById('theme-toggle'),
        };
    }

    initCalendar() {
        const calendarEl = document.getElementById('calendario-container');
        this.components.calendario = new FullCalendar.Calendar(calendarEl, {
            locale: 'es',
            initialView: 'dayGridMonth',
            height: 'auto', // Permite que el calendario ajuste su altura automáticamente
            fixedWeekCount: true, // ÓPTIMO: Siempre muestra 6 semanas para una altura consistente
            headerToolbar: {
                left: 'prev,today,next',
                center: 'title',
                right: '' // Los botones ahora están agrupados a la izquierda
            },
            buttonText: { 
                today: 'Hoy' // El HTML se inyectará en el callback viewDidMount
            },
            eventSources: [
                {
                    events: this.fetchCalendarEvents.bind(this),
                    // OPTIONAL: Añadir colores o propiedades por defecto a todos los eventos de esta fuente
                    color: 'transparent', 
                    textColor: 'var(--text-color)'
                }
            ],
            dateClick: this.handleDateClick.bind(this),
            dayCellDidMount: this.handleDayCellMount.bind(this),
            viewDidMount: function(view) {
                // Esta función se ejecuta después de que el calendario se renderiza.
                // Es el lugar perfecto para modificar el botón 'Hoy' de forma segura.
                const todayButton = view.el.querySelector('.fc-today-button');
                if (todayButton && !todayButton.querySelector('svg')) {
                    // Inyectamos el HTML solo si el botón existe y no tiene ya un icono.
                    todayButton.innerHTML = `
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" width="16" height="16" style="margin-right: 6px; vertical-align: text-bottom;"><path fill-rule="evenodd" d="M5.75 2a.75.75 0 01.75.75V4h7V2.75a.75.75 0 011.5 0V4h.25A2.75 2.75 0 0118 6.75v8.5A2.75 2.75 0 0115.25 18H4.75A2.75 2.75 0 012 15.25v-8.5A2.75 2.75 0 014.75 4H5V2.75A.75.75 0 015.75 2zM4.5 8.25a.75.75 0 000 1.5h11a.75.75 0 000-1.5h-11z" clip-rule="evenodd" /></svg>
                        Hoy
                    `;
                }
            }
        });
        this.components.calendario.render();
    }

    async fetchCalendarEvents(fetchInfo, successCallback, failureCallback) {
        // Esta función ahora es llamada por la fuente de eventos.
        // La lógica interna es la misma, pero ya no necesitamos forzar el re-renderizado.
        try {
            const year = fetchInfo.start.getFullYear();
            const feriados = await DateUtils.obtenerFeriados(year);
            
            // Poblar nuestro caché interno para que lo use `dayCellDidMount` en futuras renderizaciones
            this.feriadosCargados.clear();
            feriados.forEach(feriado => {
                this.feriadosCargados.set(feriado.date, feriado.name);
            });

            // FIX: Aplicar estilos manualmente a las celdas ya renderizadas.
            // Esto soluciona la condición de carrera donde las celdas se dibujan
            // antes de que la llamada asíncrona a la API de feriados termine.
            this.feriadosCargados.forEach((name, dateStr) => {
                const [day, month, year] = dateStr.split('/');
                const dateIso = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
                const cell = document.querySelector(`.fc-day[data-date='${dateIso}']`);
                if (cell && !cell.classList.contains('fc-holiday')) {
                    cell.classList.add('fc-holiday');
                    cell.setAttribute('title', name);
                }
            });

            const events = feriados.map(feriado => {
                const [day, month, year] = feriado.date.split('/');
                return {
                    start: `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`,
                    display: 'background',
                    classNames: ['fc-holiday-event'], // Usar una clase diferente para no confundir con el estilo de la celda
                    title: feriado.name
                };
            });

            successCallback(events);
        } catch (error) {
            console.error('Error al cargar eventos del calendario:', error);
            UIUtils.mostrarToast('No se pudieron cargar los feriados.', 'error');
            failureCallback(error);
        }
    }

    handleDateClick(arg) {
        const dateStr = DateUtils.formatearFecha(arg.date);
        const isHoliday = this.feriadosCargados.has(dateStr);
        const isSunday = arg.date.getDay() === 0;

        // La lógica de validación (días pasados, domingos, feriados) se hace aquí directamente
        if (arg.dayEl.classList.contains('fc-day-past') || isSunday || isHoliday) {
            UIUtils.mostrarToast('No se pueden seleccionar domingos, feriados o días pasados.', 'info');
            return;
        }

        if (this.state.selectedDates.has(dateStr)) {
            this.state.selectedDates.delete(dateStr);
            arg.dayEl.classList.remove('fc-day-selected');
        } else {
            if (this.state.selectedDates.size >= MAX_FECHAS) {
                UIUtils.mostrarToast(`Máximo ${MAX_FECHAS} fechas permitidas`, 'error');
                return;
            }
            this.state.selectedDates.add(dateStr);
            arg.dayEl.classList.add('fc-day-selected');
        }

        this.actualizarListaFechas(Array.from(this.state.selectedDates));
    }

    handleDayCellMount(arg) {
        const dateStr = DateUtils.formatearFecha(arg.date);
        const isSelected = this.state.selectedDates.has(dateStr);

        // Aplicar clase si la fecha está seleccionada
        if (isSelected) {
            arg.el.classList.add('fc-day-selected');
        } else {
            arg.el.classList.remove('fc-day-selected');
        }

        // Añadir clase y tooltip para feriados
        if (this.feriadosCargados.has(dateStr)) {
            arg.el.classList.add('fc-holiday');
            arg.el.setAttribute('title', this.feriadosCargados.get(dateStr));
        }
    }

    setupEventListeners() {
        const { btnSiguiente, btnAtras, btnCalcular, themeToggle, btnDescargarReportes, btnCargarYDescargar, btnActualizarCalculos, btnDeselectAll, montoInput, rucInput, descClienteInput } = this.elements;
        
        btnSiguiente?.addEventListener('click', () => this._goToDatosClientePage());
        btnAtras?.addEventListener('click', () => this.goToPage(0));
        btnCalcular?.addEventListener('click', this.calcular);
        
        // Listener para el nuevo botón de deseleccionar todo
        btnDeselectAll?.addEventListener('click', () => this._deselectAllDates());

        // Listener para el botón de actualizar/reiniciar cálculos
        btnActualizarCalculos?.addEventListener('click', () => this._reiniciarCalculos());

        // Nuevo listener para el botón de descarga simultánea
        btnDescargarReportes?.addEventListener('click', () => this.generarAmbosReportes());
        // Nuevo listener para el flujo de restauración directa
        btnCargarYDescargar?.addEventListener('click', () => this.cargarYDescargarExcel());
        // Nuevo listener para el botón de carga de respaldo con opciones
        btnCargarRespaldo?.addEventListener('click', () => this.mostrarOpcionesRespaldo());

        // Listener para el botón de reiniciar
        document.getElementById('btn-reiniciar')?.addEventListener('click', () => {
            this._limpiarResultados(); // Limpia solo los resultados
            this.goToPage(1); // Vuelve a la página de datos del cliente
        });

        themeToggle?.addEventListener('click', () => ThemeManager.toggleTheme());

        // Validación en tiempo real para campos de formulario
        montoInput?.addEventListener('input', () => this._validateField('monto', montoInput.value));
        montoInput?.addEventListener('blur', () => this._validateField('monto', montoInput.value));
        rucInput?.addEventListener('input', () => this._validateField('ruc', rucInput.value));
        rucInput?.addEventListener('blur', () => this._validateField('ruc', rucInput.value));
        descClienteInput?.addEventListener('input', () => this._validateField('desc-cliente', descClienteInput.value));
        descClienteInput?.addEventListener('blur', () => this._validateField('desc-cliente', descClienteInput.value));
    }

    /**
     * Valida la selección de fechas y navega a la página de datos del cliente.
     * Este es el paso de validación entre la página 1 y la 2.
     */
    _goToDatosClientePage() {
        const fechas = Array.from(this.state.selectedDates);
        if (fechas.length === 0) {
            UIUtils.mostrarToast('Debe seleccionar al menos una fecha para continuar.', 'error');
            return;
        }
        // Si la validación es exitosa, pasamos a la siguiente página.
        this.goToPage(1);
    }

    _validateField(fieldId, value) {
        // Obtener los valores actuales de todos los campos relevantes para una validación completa
        const currentMonto = parseFloat(this.elements.montoInput.value);
        const currentRuc = this.elements.rucInput.value.trim();
        const currentRazonSocial = this.elements.descClienteInput.value.trim();
        const currentFechas = Array.from(this.state.selectedDates);

        let validationData = {
            monto: currentMonto,
            fechas: currentFechas,
            ruc: currentRuc,
            razonSocial: currentRazonSocial
        };

        // Actualizar el valor específico del campo que se está validando
        switch (fieldId) {
            case 'monto':
                validationData.monto = parseFloat(value);
                break;
            case 'ruc':
                validationData.ruc = value.trim();
                break;
            case 'desc-cliente':
                validationData.razonSocial = value.trim();
                break;
        }

        const { fieldErrors } = FormValidator.validate(validationData);
        const errorForField = fieldErrors.find(err => err.field === fieldId);

        const input = document.getElementById(fieldId);
        if (input) {
            // Limpiar errores previos para este campo
            input.classList.remove('error');
            const label = document.querySelector(`label[for="${input.id}"]`);
            if (label) label.classList.remove('error-label');
            const errorMessage = document.getElementById(`error-${input.id}`);
            if (errorMessage) errorMessage.textContent = '';

            // Aplicar nuevo error si existe
            if (errorForField) {
                input.classList.add('error');
                if (label) label.classList.add('error-label');
                if (errorMessage) errorMessage.textContent = errorForField.message;
            }
        }
    }

    _getAndValidateFormData() {
        const { montoInput, rucInput, lineaInput, pedidoInput, descClienteInput, codigoClienteInput } = this.elements;
        const monto = parseFloat(montoInput.value);
        const ruc = rucInput.value.trim();
        const linea = lineaInput.value;
        const pedido = pedidoInput.value.trim();
        const fechas = Array.from(this.state.selectedDates);
        const razonSocial = descClienteInput.value.trim();
        const codigoCliente = codigoClienteInput.value.trim();

        const { fieldErrors, generalErrors, isValid } = FormValidator.validate({
            monto,
            fechas,
            ruc,
            razonSocial
        });

        return {
            fieldErrors,
            generalErrors,
            isValid,
            payload: { montoTotal: monto, fechasValidas: fechas, razonSocial },
            uiData: { linea, pedido, ruc, codigoCliente }
        };
    }

    _clearFormErrors() {
        const formElements = [this.elements.montoInput, this.elements.rucInput, this.elements.descClienteInput];
        formElements.forEach(input => {
            input.classList.remove('error');
            const label = document.querySelector(`label[for="${input.id}"]`);
            if (label) label.classList.remove('error-label');
            const errorMessage = document.getElementById(`error-${input.id}`);
            if (errorMessage) errorMessage.textContent = '';
        });
    }

    _applyFormErrors(fieldErrors) {
        fieldErrors.forEach(err => {
            const input = document.getElementById(err.field);
            if (input) {
                input.classList.add('error');
                const label = document.querySelector(`label[for="${input.id}"]`);
                if (label) label.classList.add('error-label');
                const errorMessage = document.getElementById(`error-${input.id}`);
                if (errorMessage) errorMessage.textContent = err.message;
            }
        });
    }

    async calcular() {
        this._clearFormErrors(); // Limpiar errores anteriores

        const { fieldErrors, generalErrors, isValid, payload, uiData } = this._getAndValidateFormData();

        if (!isValid) {
            this._applyFormErrors(fieldErrors);
            if (generalErrors.length > 0) {
                UIUtils.mostrarToast(generalErrors.join(' | '), 'error');
            }
            return;
        }
        
        try {
            UIUtils.mostrarLoading(true, 'Calculando distribución...');
            const resultado = await calcular(payload);
            
            this.updateState({
                montoOriginal: payload.montoTotal,
                fechasOrdenadas: payload.fechasValidas,
                montosAsignados: resultado.montosAsignados,
                resumenMensual: resultado.resumenMensual,
                linea: uiData.linea,
                pedido: uiData.pedido,
                ruc: uiData.ruc,
                codigoCliente: uiData.codigoCliente,
                descCliente: payload.razonSocial
            });
            
            this.mostrarResultados(uiData.linea);
            this.goToPage(2);
        } catch (error) {
            console.error('Error en cálculo:', error);
            let errorMessage = error.message || 'Error al realizar el cálculo';
            if (error.statusCode === 504) {
                errorMessage = 'El servidor tardó demasiado (Timeout). Reinicia los emuladores y vuelve a intentarlo.';
            }
            UIUtils.mostrarToast(errorMessage, 'error');
        } finally {
            UIUtils.mostrarLoading(false);
        }
    }

    mostrarResultados(linea) {
        this.components.grafico.actualizarGrafico(
            this.state.resumenMensual,
            this.state.montoOriginal,
            linea
        );
        this._renderResumenTable();
        this._renderDetalleTable(); // This will now render the horizontal detail
        this._renderComparisonTotals();
    }

    _renderResumenTable() {
        const tablaResumenThead = document.querySelector('#tabla-resumen thead');
        const tablaResumenBody = document.querySelector('#tabla-resumen tbody');
        if (!tablaResumenThead || !tablaResumenBody) return;

        tablaResumenThead.innerHTML = '';
        tablaResumenBody.innerHTML = '';

        const totalMonto = this.state.montoOriginal;
        const sortedMonths = Object.keys(this.state.resumenMensual).sort((a, b) => new Date(a.split('-')[0], a.split('-')[1] - 1) - new Date(b.split('-')[0], b.split('-')[1] - 1));

        // Build Header
        const headerHtml = `
            <tr>
                <th>Mes</th>
                <th>Monto (S/)</th>
                <th>% del Total</th>
            </tr>
        `;
        tablaResumenThead.innerHTML = headerHtml;

        // Build Body
        let bodyHtml = '';
        sortedMonths.forEach(mes => {
            const montoMes = this.state.resumenMensual[mes] || 0;
            const porcentaje = totalMonto > 0 ? ((montoMes / totalMonto) * 100).toFixed(2) : 0;
            bodyHtml += `
                <tr>
                    <td>${DateUtils.formatearMesAnioDisplay(mes)}</td>
                    <td>${montoMes.toFixed(2)}</td>
                    <td>${porcentaje}%</td>
                </tr>
            `;
        });
        tablaResumenBody.innerHTML = bodyHtml;
    }

    _renderDetalleTable() {
        const detalleContainer = document.getElementById('tabla-detalle-horizontal');
        if (!detalleContainer) return;

        detalleContainer.innerHTML = ''; // Clear previous content

        const montosPorMes = {};
        // Group montosAsignados by month
        for (const fechaStr in this.state.montosAsignados) {
            const monthKey = DateUtils.obtenerMesAnio(fechaStr); // YYYY-MM
            if (!montosPorMes[monthKey]) {
                montosPorMes[monthKey] = [];
            }
            montosPorMes[monthKey].push({
                date: fechaStr,
                amount: this.state.montosAsignados[fechaStr]
            });
        }

        // Sort months
        const sortedMonthKeys = Object.keys(montosPorMes).sort((a, b) => {
            const [yearA, monthA] = a.split('-').map(Number);
            const [yearB, monthB] = b.split('-').map(Number);
            return new Date(yearA, monthA - 1) - new Date(yearB, monthB - 1);
        });

        sortedMonthKeys.forEach(monthKey => {
            const monthGroupDiv = document.createElement('div');
            monthGroupDiv.className = 'month-group';

            const monthTotal = montosPorMes[monthKey].reduce((sum, item) => sum + item.amount, 0);
            const monthHeaderDiv = document.createElement('div');
            monthHeaderDiv.className = 'month-header';
            // Format: Mes YY, S/ {Total Mes}
            const monthDisplay = DateUtils.formatearMesAnioDisplay(monthKey).replace(' ', ' '); // "Enero 2025"
            const yearShort = monthKey.substring(2, 4); // "25"
            monthHeaderDiv.textContent = `${monthDisplay.split(' ')[0]} ${yearShort}, S/ ${monthTotal.toFixed(2)}`;
            monthGroupDiv.appendChild(monthHeaderDiv);

            // Sort dates within the month
            const sortedDatesInMonth = montosPorMes[monthKey].sort((a, b) => DateUtils.parsearFecha(a.date) - DateUtils.parsearFecha(b.date));

            sortedDatesInMonth.forEach(item => {
                const detailItemDiv = document.createElement('div');
                detailItemDiv.className = 'detail-item';
                detailItemDiv.innerHTML = `
                    <span>${item.date}</span>
                    <input type="text" inputmode="decimal" pattern="[0-9]+([.][0-9]{1,2})?" value="${item.amount.toFixed(2)}" data-fecha="${item.date}">
                `;
                monthGroupDiv.appendChild(detailItemDiv);
            });

            const monthTotalDiv = document.createElement('div');
            monthTotalDiv.className = 'month-total';
            monthTotalDiv.textContent = `Total Mes: S/ ${monthTotal.toFixed(2)}`;
            monthGroupDiv.appendChild(monthTotalDiv);

            detalleContainer.appendChild(monthGroupDiv);
        });

        this._setupEditableTableListeners(); // Re-attach listeners to new inputs
    }

    _setupEditableTableListeners() {
        // Remove old listeners to prevent duplicates
        const oldInputs = document.querySelectorAll('#tabla-detalle-horizontal input[type="text"]');
        oldInputs.forEach(input => {
            input.removeEventListener('input', this._handleAmountInput);
            input.removeEventListener('blur', this._handleAmountBlur);
            input.removeEventListener('keydown', this._handleAmountKeydown);
        });

        // Attach new listeners
        const newInputs = document.querySelectorAll('#tabla-detalle-horizontal input[type="text"]');
        newInputs.forEach(input => {
            input.addEventListener('input', this._handleAmountInput.bind(this));
            input.addEventListener('blur', this._handleAmountBlur.bind(this));
            input.addEventListener('keydown', this._handleAmountKeydown.bind(this));
        });
    }

    _handleAmountInput(event) {
        const input = event.target;
        const originalValue = input.value;
        const originalCursor = input.selectionStart;

        // 1. Sanitize: Remove non-numeric/non-dot characters
        let sanitized = originalValue.replace(/[^0-9.]/g, '');

        // 2. Sanitize: Ensure only one decimal point
        const parts = sanitized.split('.');
        if (parts.length > 2) {
            sanitized = parts[0] + '.' + parts.slice(1).join('');
        }

        // 3. Only update the DOM if the value was actually changed.
        // This is the key to preventing the cursor jump on valid input.
        if (sanitized !== originalValue) {
            // Calculate how many characters were removed before the cursor
            const originalPrefix = originalValue.substring(0, originalCursor);
            const sanitizedPrefix = originalPrefix.replace(/[^0-9.]/g, '');
            const removedCharsCount = originalPrefix.length - sanitizedPrefix.length;

            input.value = sanitized;
            
            // Restore the cursor position, accounting for removed characters
            input.setSelectionRange(originalCursor - removedCharsCount, originalCursor - removedCharsCount);
        }
    }

    _handleAmountBlur(event) {
        const target = event.target;
        const fecha = target.dataset.fecha;
        let nuevoMonto = parseFloat(target.value);

        if (isNaN(nuevoMonto) || nuevoMonto < 0) {
            UIUtils.mostrarToast('Monto inválido. Debe ser un número positivo.', 'error');
            target.value = (this.state.montosAsignados[fecha] || 0).toFixed(2); // Revert to previous value
            return;
        }

        nuevoMonto = parseFloat(nuevoMonto.toFixed(2));
        target.value = nuevoMonto.toFixed(2);

        this.state.montosAsignados[fecha] = nuevoMonto;
        this._recalculateSummaryAndGraph();
    }

    _handleAmountKeydown(event) {
        if (event.key === 'Enter') {
            event.preventDefault();
            event.target.blur();
        }
    }

    _recalculateSummaryAndGraph() {
        // Recalcular resumen mensual basado en los montos asignados actualizados
        const newResumenMensual = {};
        for (const fecha in this.state.montosAsignados) {
            const monto = this.state.montosAsignados[fecha];
            const mes = DateUtils.obtenerMesAnio(fecha); // Asumiendo que DateUtils tiene esta función
            newResumenMensual[mes] = (newResumenMensual[mes] || 0) + monto;
        }
        this.state.resumenMensual = newResumenMensual;

        // Actualizar gráfico y tabla de resumen
        this.components.grafico.actualizarGrafico(
            this.state.resumenMensual,
            this.state.montoOriginal,
            this.state.linea
        );
        this._renderResumenTable();
        this._renderComparisonTotals();
        this._updateMonthTotalsInDetailTable(); // Update totals in the horizontal detail table
    }

    /**
     * Reinicia los cálculos a la distribución automática original,
     * descartando cualquier cambio manual.
     */
    async _reiniciarCalculos() {
        if (!this.state.montoOriginal || this.state.fechasOrdenadas.length === 0) {
            UIUtils.mostrarToast('No hay datos para reiniciar el cálculo.', 'info');
            return;
        }

        const payload = {
            montoTotal: this.state.montoOriginal,
            fechasValidas: this.state.fechasOrdenadas
        };

        try {
            UIUtils.mostrarLoading(true, 'Restaurando cálculo original...');
            const resultado = await calcular(payload);
            
            this.updateState({
                montosAsignados: resultado.montosAsignados,
                resumenMensual: resultado.resumenMensual,
            });
            
            this.mostrarResultados(this.state.linea);
            UIUtils.mostrarToast('Cálculos restaurados a la distribución original.', 'success');
        } catch (error) {
            console.error('Error al reiniciar el cálculo:', error);
            UIUtils.mostrarToast(error.message || 'Error al restaurar el cálculo.', 'error');
        } finally {
            UIUtils.mostrarLoading(false);
        }
    }

    _updateMonthTotalsInDetailTable() {
        const monthGroups = document.querySelectorAll('.month-group');
        monthGroups.forEach(group => {
            const monthHeader = group.querySelector('.month-header');
            const monthTotalDiv = group.querySelector('.month-total');
            
            // Extract month key from header text (e.g., "Enero 25, S/ 123.45" -> "Enero 25")
            const headerText = monthHeader.textContent;
            const monthYearPart = headerText.substring(0, headerText.indexOf(',')).trim(); // "Enero 25"
            
            // Reconstruct YYYY-MM key from monthYearPart
            const [monthName, yearShort] = monthYearPart.split(' ');
            const monthIndex = MONTH_NAMES_ES.indexOf(monthName); // FIX: Usar la constante local
            const yearFull = `20${yearShort}`;
            const monthKey = `${yearFull}-${String(monthIndex + 1).padStart(2, '0')}`;

            const currentMonthTotal = this.state.resumenMensual[monthKey] || 0;
            
            // Update month header text
            monthHeader.textContent = `${monthName} ${yearShort}, S/ ${currentMonthTotal.toFixed(2)}`;
            
            // Update month total div text
            monthTotalDiv.textContent = `Total Mes: S/ ${currentMonthTotal.toFixed(2)}`;
        });
    }

    _renderComparisonTotals() {
        const container = document.getElementById('totales-comparativos');
        if (!container) return;

        // 1. Crear la estructura HTML dinámicamente para evitar errores tras la limpieza.
        container.innerHTML = `
            <div class="comparison-item">
                <span>Monto Original:</span>
                <strong id="monto-original-display">S/ 0.00</strong>
            </div>
            <div class="comparison-item">
                <span>Suma Detallada:</span>
                <strong id="suma-montos-detallados-display">S/ 0.00</strong>
            </div>
            <div class="comparison-status">
                <span id="estado-totales"></span>
            </div>
        `;

        // 2. Obtener referencias a los elementos recién creados.
        const montoOriginalDisplay = container.querySelector('#monto-original-display');
        const sumaMontosDetalladosDisplay = container.querySelector('#suma-montos-detallados-display');
        const estadoTotales = container.querySelector('#estado-totales');

        // 3. Calcular y actualizar los valores.
        const montoOriginal = this.state.montoOriginal;
        const sumaMontosDetallados = Object.values(this.state.montosAsignados).reduce((sum, monto) => sum + monto, 0);

        montoOriginalDisplay.textContent = `S/ ${montoOriginal.toFixed(2)}`;
        sumaMontosDetalladosDisplay.textContent = `S/ ${sumaMontosDetallados.toFixed(2)}`;

        const tolerance = 0.01; // Pequeña tolerancia para errores de redondeo
        if (Math.abs(montoOriginal - sumaMontosDetallados) < tolerance) {
            estadoTotales.textContent = 'Coincide';
            estadoTotales.className = 'status-ok'; // Usar clases para estilo es mejor práctica
        } else {
            const diferencia = sumaMontosDetallados - montoOriginal;
            estadoTotales.textContent = `No Coincide (Diferencia: S/ ${diferencia.toFixed(2)})`;
            estadoTotales.className = 'status-error';
        }
    }

    /**
     * Nuevo flujo: Carga un respaldo JSON y genera el reporte Excel directamente,
     * sin cambiar el estado de la aplicación ni navegar a otras páginas.
     */
    async cargarYDescargarExcel() {
        try {
            const data = await FileManager.loadJson();

            // Validar que el archivo JSON tiene los datos mínimos para generar el reporte
            if (!data || !data.montoOriginal || !data.montosAsignados || !data.resumenMensual) {
                UIUtils.mostrarToast('El archivo de respaldo no es válido o está incompleto.', 'error');
                return;
            }

            UIUtils.mostrarLoading(true, 'Generando reporte desde respaldo...');

            // Añadir la bandera para que el backend sepa que es un reporte restaurado
            const payload = { ...data, isRestored: true };

            // Llamar a la API para generar solo el reporte Excel con los datos del archivo
            const excelBlob = await generarReporte(payload);

            // Generar nombre de archivo
            const fallbackDate = DateUtils.formatearParaFilename(new Date());
            const sanitizedCliente = UIUtils.normalizeStringForFilename(payload.razonSocial || '');
            const sanitizedLinea = UIUtils.normalizeStringForFilename(data.linea || '');
            const baseFilename = `${sanitizedCliente}_${sanitizedLinea}_${fallbackDate}`;
            const excelFilename = `reporte_${baseFilename}.xlsx`;

            UIUtils.downloadFile(excelBlob, excelFilename);
            UIUtils.mostrarToast('Reporte Excel restaurado y descargado correctamente.', 'success');

        } catch (error) {
            if (error.message !== 'No se seleccionó ningún archivo.') {
                console.error('Error en el flujo de carga y descarga:', error);
                UIUtils.mostrarToast(error.message || 'Error al restaurar el reporte.', 'error');
            }
        } finally {
            UIUtils.mostrarLoading(false);
        }
    }

    async generarAmbosReportes() {
        const estadoTotales = document.getElementById('estado-totales');
        if (estadoTotales && estadoTotales.textContent.includes('No Coincide')) {
            UIUtils.mostrarToast('La suma de los montos detallados no coincide con el monto original. Ajuste los montos para continuar.', 'error');
            return;
        }

        UIUtils.mostrarLoading(true, 'Generando reportes...');
        try {
            const reportData = {
                montoOriginal: this.state.montoOriginal,
                fechasOrdenadas: this.state.fechasOrdenadas,
                montosAsignados: this.state.montosAsignados,
                resumenMensual: this.state.resumenMensual,
                razonSocial: this.state.descCliente,
                ruc: this.state.ruc,
                linea: this.state.linea,
                pedido: this.state.pedido,
                codigoCliente: this.state.codigoCliente
            };

            // Generar nombre base para ambos archivos
            const formattedMonthYear = DateUtils.formatearMesAnioParaFilename(new Date()); // Assuming this function exists or will be created
            const sanitizedPedido = UIUtils.normalizeStringForFilename(this.state.pedido);
            const sanitizedCliente = UIUtils.normalizeStringForFilename(this.state.descCliente);
            
            // New base filename format: {pedido}-{cliente}-{mm_yy}
            const baseFilename = `${sanitizedPedido}-${sanitizedCliente}-${formattedMonthYear}`;

            // Generar Reporte XLSX
            const excelBlob = await generarReporte(reportData);
            const excelFilename = `reporte_${baseFilename}.xlsx`;
            UIUtils.downloadFile(excelBlob, excelFilename);
            UIUtils.mostrarToast('Reporte Excel generado correctamente', 'success');

            // Generar Reporte JSON
            const jsonBlob = await generarReporteJson(reportData);
            const jsonFilename = `respaldo_${baseFilename}.json`;
            UIUtils.downloadFile(jsonBlob, jsonFilename);
            UIUtils.mostrarToast('Respaldo JSON generado correctamente', 'success');

        } catch (error) {
            console.error('Error generando reportes:', error);
            UIUtils.mostrarToast(error.message || 'Error al generar uno o ambos reportes', 'error');
        } finally {
            UIUtils.mostrarLoading(false);
        }
    }
    
    // Función para limpiar solo los resultados (tablas y gráfico)
    _limpiarResultados() {
        // Limpiar contenido de las tablas de resultados en la UI
        document.querySelector('#tabla-resumen thead').innerHTML = ''; // Limpiar encabezado de resumen
        document.querySelector('#tabla-resumen tbody').innerHTML = '';
        document.querySelector('#tabla-detalle-horizontal').innerHTML = ''; // Limpiar el nuevo contenedor de detalle
        document.getElementById('totales-comparativos').innerHTML = ''; // Limpiar totales comparativos

        // Destruir el gráfico si existe
        if (this.components.grafico && this.components.grafico.chart) {
            this.components.grafico.chart.destroy();
            this.components.grafico.chart = null;
        }

        // Resetear el estado relevante para los resultados
        this.updateState({
            montoOriginal: 0,
            montosAsignados: {},
            resumenMensual: {},
            // Limpiar también los datos del cliente para un nuevo cálculo limpio
            cliente: '',
            ruc: '',
            descCliente: '',
            linea: 'viniball', // Resetear al valor por defecto
            pedido: '',
            codigoCliente: ''
        });

        UIUtils.mostrarToast('Resultados del cálculo limpiados.', 'info');
    }

    goToPage(index) {
        this.elements.pages.forEach((page, i) => {
            page.classList.toggle('active', i === index);
            page.setAttribute('aria-current', i === index ? 'page' : null);
        });
        
        this._updateProgressIndicator(index); // Llama a la nueva función

        // Enfocar primer elemento interactivo
        setTimeout(() => {
            const focusable = this.elements.pages[index].querySelector(
                'button, input, [tabindex]:not([tabindex="-1"])'
            );
            focusable?.focus();
        }, 100);
    }

    _updateProgressIndicator(currentPageIndex) {
        const steps = document.querySelectorAll('.progress-indicator .step');
        steps.forEach((step, i) => {
            step.classList.remove('active', 'completed');
            if (i === currentPageIndex) {
                step.classList.add('active');
            } else if (i < currentPageIndex) {
                step.classList.add('completed');
            }
        });
    }

    actualizarListaFechas(fechas) {
        const contador = document.getElementById('contador-fechas');
        const lista = document.getElementById('lista-fechas');
        
        if (contador) {
            contador.textContent = `(${fechas.length})`;
        }

        // Controlar la visibilidad del botón "Limpiar Selección"
        if (this.elements.btnDeselectAll) {
            this.elements.btnDeselectAll.hidden = fechas.length === 0;
        }
        
        if (lista) {
            lista.innerHTML = '';
            const fechasOrdenadas = fechas.sort((a, b) => DateUtils.parsearFecha(a) - DateUtils.parsearFecha(b));
            
            fechasOrdenadas.forEach(fecha => {
                const li = document.createElement('li');
                const dias = DateUtils.diasDesdeHoy(fecha);
                const textoDias = dias === 1 ? '1 día' : `${dias} días`;
                li.textContent = `${fecha} (${textoDias})`;
                lista.appendChild(li);
            });
        }
    }

    _deselectAllDates() {
        if (this.state.selectedDates.size === 0) {
            return; // No hacer nada si no hay fechas seleccionadas
        }

        // 1. Limpiar el estado
        this.state.selectedDates.clear();

        // 2. Actualizar la UI (lista y contador)
        this.actualizarListaFechas([]);

        // 3. Quitar la clase de selección de las celdas del calendario
        const selectedCells = document.querySelectorAll('.fc-day-selected');
        selectedCells.forEach(cell => cell.classList.remove('fc-day-selected'));

        UIUtils.mostrarToast('Todas las fechas han sido deseleccionadas.', 'info');
    }

    /**
     * Muestra un modal con opciones para cargar un respaldo:
     * - Recrear Reporte: Carga los datos y genera un nuevo reporte.
     * - Editar Reporte: Carga los datos y permite editarlos.
     */
    mostrarOpcionesRespaldo() {
        // Crear el modal si no existe
        let modal = document.getElementById('modal-opciones-respaldo');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'modal-opciones-respaldo';
            modal.className = 'modal';
            modal.innerHTML = `
                <div class="modal-content">
                    <h3>Cargar Respaldo</h3>
                    <p>Selecciona una opción para cargar el respaldo:</p>
                    <div class="modal-actions">
                        <button id="btn-recrear-reporte" class="btn-primary">Recrear Reporte</button>
                        <button id="btn-editar-reporte" class="btn-secondary">Editar Reporte</button>
                        <button id="btn-cancelar-respaldo" class="btn-tertiary">Cancelar</button>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);
        }

        // Mostrar el modal
        modal.style.display = 'block';

        // Agregar event listeners a los botones del modal
        const btnRecrear = document.getElementById('btn-recrear-reporte');
        const btnEditar = document.getElementById('btn-editar-reporte');
        const btnCancelar = document.getElementById('btn-cancelar-respaldo');

        const handleRecrear = () => {
            this.cargarRespaldo(false); // false = no modo edición
            modal.style.display = 'none';
            btnRecrear.removeEventListener('click', handleRecrear);
            btnEditar.removeEventListener('click', handleEditar);
            btnCancelar.removeEventListener('click', handleCancelar);
        };

        const handleEditar = () => {
            this.cargarRespaldo(true); // true = modo edición
            modal.style.display = 'none';
            btnRecrear.removeEventListener('click', handleRecrear);
            btnEditar.removeEventListener('click', handleEditar);
            btnCancelar.removeEventListener('click', handleCancelar);
        };

        const handleCancelar = () => {
            modal.style.display = 'none';
            btnRecrear.removeEventListener('click', handleRecrear);
            btnEditar.removeEventListener('click', handleEditar);
            btnCancelar.removeEventListener('click', handleCancelar);
        };

        btnRecrear.addEventListener('click', handleRecrear);
        btnEditar.addEventListener('click', handleEditar);
        btnCancelar.addEventListener('click', handleCancelar);
    }

    /**
     * Carga un respaldo JSON y actualiza la aplicación.
     * @param {boolean} modoEdicion - Si es true, permite editar los datos cargados.
     */
    async cargarRespaldo(modoEdicion) {
        try {
            const data = await FileManager.loadJson();

            // Validar que el archivo JSON tiene los datos mínimos
            if (!data || !data.montoOriginal || !data.montosAsignados || !data.resumenMensual) {
                UIUtils.mostrarToast('El archivo de respaldo no es válido o está incompleto.', 'error');
                return;
            }

            // Validar consistencia de datos
            if (!data.razonSocial || !data.linea || !data.pedido) {
                UIUtils.mostrarToast('El respaldo no contiene información del cliente necesaria.', 'error');
                return;
            }

            UIUtils.mostrarLoading(true, 'Cargando respaldo...');

            // Actualizar el estado de la aplicación con los datos del respaldo
            this.updateState({
                montoOriginal: data.montoOriginal,
                fechasOrdenadas: data.fechasOrdenadas || [],
                montosAsignados: data.montosAsignados,
                resumenMensual: data.resumenMensual,
                descCliente: data.razonSocial,
                ruc: data.ruc || '',
                linea: data.linea,
                pedido: data.pedido,
                codigoCliente: data.codigoCliente || ''
            });

            // Actualizar la UI con los datos cargados
            this.actualizarUIConRespaldo(modoEdicion);

            UIUtils.mostrarToast('Respaldo cargado correctamente.', 'success');

        } catch (error) {
            if (error.message !== 'No se seleccionó ningún archivo.') {
                console.error('Error al cargar el respaldo:', error);
                UIUtils.mostrarToast(error.message || 'Error al cargar el respaldo.', 'error');
            }
        } finally {
            UIUtils.mostrarLoading(false);
        }
    }

    /**
     * Actualiza la UI con los datos cargados del respaldo.
     * @param {boolean} modoEdicion - Si es true, permite editar los datos.
     */
    actualizarUIConRespaldo(modoEdicion) {
        // Actualizar campos del formulario
        if (this.elements.montoInput) this.elements.montoInput.value = this.state.montoOriginal.toFixed(2);
        if (this.elements.descClienteInput) this.elements.descClienteInput.value = this.state.descCliente;
        if (this.elements.lineaInput) this.elements.lineaInput.value = this.state.linea;
        if (this.elements.pedidoInput) this.elements.pedidoInput.value = this.state.pedido;
        if (this.elements.rucInput) this.elements.rucInput.value = this.state.ruc;
        if (this.elements.codigoClienteInput) this.elements.codigoClienteInput.value = this.state.codigoCliente;

        // Actualizar fechas seleccionadas en el calendario
        this.state.selectedDates.clear();
        this.state.fechasOrdenadas.forEach(fecha => {
            this.state.selectedDates.add(fecha);
            // Marcar las fechas en el calendario
            const dateIso = DateUtils.formatearFecha(DateUtils.parsearFecha(fecha));
            const cell = document.querySelector(`.fc-day[data-date='${dateIso}']`);
            if (cell) cell.classList.add('fc-day-selected');
        });
        this.actualizarListaFechas(this.state.fechasOrdenadas);

        // Navegar a la página de resultados
        this.goToPage(2);

        // Mostrar resultados
        this.mostrarResultados(this.state.linea);

        // Si no es modo edición, bloquear los campos editables
        if (!modoEdicion) {
            this.bloquearCamposEdicion();
        } else {
            UIUtils.mostrarToast('Puedes editar los montos en la tabla de detalle.', 'info');
        }
    }

    /**
     * Bloquea los campos editables en la tabla de detalle.
     */
    bloquearCamposEdicion() {
        const inputs = document.querySelectorAll('#tabla-detalle-horizontal input[type="text"]');
        inputs.forEach(input => {
            input.disabled = true;
            input.classList.add('disabled');
        });
    }
}

// Inicializar la aplicación cuando el DOM esté listo
window.addEventListener('unhandledrejection', event => {
    console.error('Unhandled Promise Rejection:', event.reason);
    UIUtils.mostrarToast(event.reason.message || 'Ocurrió un error inesperado', 'error');
});

document.addEventListener('DOMContentLoaded', () => {
    // Importar y aplicar el tema inicial para evitar parpadeos (FOUC)
    import('./themeManager.js').then(({ ThemeManager }) => {
        ThemeManager.applyInitialTheme();
    });
    const app = new PlanificadorApp();
    app.init();
});
