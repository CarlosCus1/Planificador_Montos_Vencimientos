import { ThemeManager } from './themeManager.js';
import { DateUtils } from './dateUtils.js';
import { UIUtils } from './uiUtils.js';
import { RUCManager } from './rucManager.js';
import { GraficoManager } from './graficoManager.js';
import { FormValidator } from './formValidator.js';
import { FileManager } from './fileManager.js';
import { NavigationManager } from './navigationManager.js';
import { StateManager } from './stateManager.js';
import { ResultsRenderer } from './resultsRenderer.js';
import { calcular, generarReporte, generarReporteJson } from './api.js';
import { MAX_FECHAS, MAX_AMOUNT, LABELS } from './config.js';


class PlanificadorApp {
    constructor() {
        const initialState = {
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
            codigoCliente: '',
            isDataDirty: false
        };

        this.stateManager = new StateManager(initialState);
        
        this.feriadosCargados = new Map();
        
        this.components = {
            calendario: null,
            grafico: null,
            rucManager: null,
            navigation: null
            // stateManager is a direct property
        };
        
        this.init = this.init.bind(this);
        this.calcular = this.calcular.bind(this);
        this.handleDateClick = this.handleDateClick.bind(this);
        this.actualizarListaFechas = this.actualizarListaFechas.bind(this);
        this.mostrarOpcionesRespaldo = this.mostrarOpcionesRespaldo.bind(this);
    }

    async init() {
        try {
            this.initComponents(); // Initialize components first to ensure this.elements is available

            const state = this.stateManager.getState();
            if (state) {
                // Update UI elements based on loaded state
                this.elements.montoInput.value = state.montoOriginal || '';
                this.elements.rucInput.value = state.ruc || '';
                this.elements.descClienteInput.value = state.descCliente || '';
                this.elements.lineaInput.value = state.linea || 'otros';
                this.elements.pedidoInput.value = state.pedido || '';
                this.elements.codigoClienteInput.value = state.codigoCliente || '';

                // Re-render calendar and selected dates list
                this.actualizarListaFechas(Array.from(state.selectedDates));
                if (Object.keys(state.montosAsignados).length > 0) {
                    this.mostrarResults(); // Assuming this method exists and renders results
                }
                this.toggleRecalculateButton(state.isDataDirty);
            }

            this.setupEventListeners();
            this._updateActionButtonsState(); // Comprobar el estado inicial de los botones
        } catch (error) {
            console.error('Error inicializando aplicación:', error);
            UIUtils.mostrarToast('Error al iniciar la aplicación', 'error');
        }
    }

    initComponents() {
        this.initCalendar();

        this.components.grafico = new GraficoManager();
        this.components.rucManager = new RUCManager();
        this.components.resultsRenderer = new ResultsRenderer(this.components.grafico);

        const pages = document.querySelectorAll('.page');
        const progressSteps = document.querySelectorAll('.progress-indicator .step');
        this.components.navigation = new NavigationManager(pages, progressSteps);
        
        this.elements = {
            pages: pages,
            montoInput: document.getElementById('monto'),
            rucInput: document.getElementById('ruc'),
            descClienteInput: document.getElementById('desc-cliente'),
            lineaInput: document.getElementById('linea'),
            pedidoInput: document.getElementById('pedido'),
            codigoClienteInput: document.getElementById('codigo-cliente'),
            btnCalcular: document.getElementById('btn-calcular'),
            btnDescargarReportes: document.getElementById('btn-descargar-reportes'),
            btnActualizarCalculos: document.getElementById('btn-actualizar-calculos'),
            btnCargarRespaldo: document.getElementById('btn-cargar-respaldo'),
            btnReiniciarTarea: document.getElementById('btn-reiniciar-tarea'), // ADDED
            themeToggle: document.getElementById('theme-toggle'),
            recalculateContainer: document.getElementById('recalculate-container'),
            btnRecalculate: document.getElementById('btn-recalculate')
        };
    }

    initCalendar() {
        const calendarEl = document.getElementById('calendario-container');
        this.components.calendario = new FullCalendar.Calendar(calendarEl, {
            locale: 'es',
            initialView: 'dayGridMonth',
            height: 'auto',
            fixedWeekCount: true,
            headerToolbar: {
                left: 'prev,today,next',
                center: 'title',
                right: ''
            },
            buttonText: { 
                today: 'Hoy'
            },
            eventSources: [
                {
                    events: this.fetchCalendarEvents.bind(this)
                }
            ],
            dateClick: this.handleDateClick.bind(this),
                        dayCellDidMount: this.handleDayCellMount.bind(this) 
        });
        this.components.calendario.render();
    }

    async fetchCalendarEvents(fetchInfo, successCallback, failureCallback) {
        try {
            const year = fetchInfo.start.getFullYear();
            const feriados = await DateUtils.obtenerFeriados(year);
            
            this.feriadosCargados.clear();
            feriados.forEach(feriado => {
                this.feriadosCargados.set(feriado.date, feriado.name);
            });

            // Ya no es necesario crear "eventos" para los feriados,
            // ya que su estilo y tooltip se manejan en dayCellDidMount.
            // Esto simplifica y optimiza el renderizado.
            // Llamamos a refetch para asegurar que dayCellDidMount se ejecute.

            successCallback([]); // Devolvemos un array vacío de eventos.
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

        if (arg.dayEl.classList.contains('fc-day-past') || isSunday || isHoliday) {
            UIUtils.mostrarToast('No se pueden seleccionar domingos, feriados o días pasados.', 'info');
            return;
        }

        const currentSelectedDates = this.stateManager.getState().selectedDates;
        if (currentSelectedDates.has(dateStr)) {
            currentSelectedDates.delete(dateStr);
            arg.dayEl.classList.remove('fc-day-selected');
        } else {
            if (currentSelectedDates.size >= MAX_FECHAS) {
                UIUtils.mostrarToast(`Máximo ${MAX_FECHAS} fechas permitidas`, 'error');
                return;
            }
            currentSelectedDates.add(dateStr);
            arg.dayEl.classList.add('fc-day-selected');
        }
        // Update state and UI
        this.stateManager.updateState({ selectedDates: currentSelectedDates });
        this.handleFormChange(); // Mark as dirty
        this.actualizarListaFechas(Array.from(currentSelectedDates));        
    }

    handleDayCellMount(arg) {
        const dateStr = DateUtils.formatearFecha(arg.date);
        
        // Aplicar clase si la fecha está seleccionada
        if (this.stateManager.getState().selectedDates.has(dateStr)) {
            arg.el.classList.add('fc-day-selected');
        } else {
            arg.el.classList.remove('fc-day-selected');
        }

        // Aplicar clase y tooltip si la fecha es un feriado
        if (this.feriadosCargados.has(dateStr)) {
            arg.el.classList.add('fc-holiday');
            arg.el.setAttribute('title', this.feriadosCargados.get(dateStr));
        }
    }

    setupEventListeners() {
        const {
            btnCalcular, themeToggle, btnDescargarReportes, btnActualizarCalculos,
            montoInput, rucInput, descClienteInput, pedidoInput,
            btnCargarRespaldo, btnRecalculate,
            btnReiniciarTarea // ADDED
        } = this.elements;

        btnCalcular?.addEventListener('click', this.calcular);
        btnRecalculate?.addEventListener('click', this.recalcular.bind(this));
        btnActualizarCalculos?.addEventListener('click', () => this._reiniciarCalculos());
        btnDescargarReportes?.addEventListener('click', () => this.generarAmbosReportes());
        
        btnCargarRespaldo?.addEventListener('click', () => this.mostrarOpcionesRespaldo());
        // btnSiguienteFechas?.addEventListener('click', () => this.components.navigation.goToPage(1)); // REMOVED

        // Unificar la lógica de reinicio completo para ambos botones
        const hardResetHandler = () => {
            if (window.confirm('¿Estás seguro de que deseas empezar de nuevo? Se perderán todos los datos actuales.')) {
                localStorage.removeItem('planificadorAppData'); // Clear local storage
                window.location.reload();
            }
        };
        btnReiniciarTarea?.addEventListener('click', hardResetHandler);
        document.getElementById('btn-reiniciar')?.addEventListener('click', hardResetHandler);

        themeToggle?.addEventListener('click', () => ThemeManager.toggleTheme());

        montoInput?.addEventListener('input', () => this.handleFormChange());
        rucInput?.addEventListener('input', () => this.handleFormChange());
        descClienteInput?.addEventListener('input', () => this.handleFormChange());
        pedidoInput?.addEventListener('input', () => this.handleFormChange());
    }

    handleFormChange() {
        this.stateManager.updateState({ isDataDirty: true });
        this.toggleRecalculateButton(true);
        this._updateActionButtonsState();
    }

    toggleRecalculateButton(show) {
        if (this.elements.recalculateContainer) {
            this.elements.recalculateContainer.style.display = show ? 'block' : 'none';
        }
        if (this.elements.btnDescargarReportes) {
            this.elements.btnDescargarReportes.disabled = show;
        }
    }

    _updateActionButtonsState() {
        const { monto, fechas, razonSocial, pedido } = this._getValidationData();
        const { btnCalcular } = this.elements;

        if (!btnCalcular) return;

        const isMontoValid = monto > 0;
        const areFechasValid = fechas.length > 0;
        const isClienteValid = razonSocial.length > 0;
        const isPedidoValid = pedido.length > 0;

        const canCalculate = isMontoValid && areFechasValid && isClienteValid && isPedidoValid;

        btnCalcular.disabled = !canCalculate;

        if (!canCalculate) {
            const tooltips = [];
            if (!isMontoValid) tooltips.push('Ingrese un monto válido.');
            if (!areFechasValid) tooltips.push('Seleccione al menos una fecha.');
            if (!isClienteValid) tooltips.push('Ingrese la razón social del cliente.');
            if (!isPedidoValid) tooltips.push('Ingrese el código del pedido.');
            btnCalcular.title = tooltips.join(' ');
        } else {
            btnCalcular.title = 'Realizar el cálculo de distribución';
        }
    }

    _getValidationData() {
        const { montoInput, descClienteInput, pedidoInput } = this.elements;
        const fechas = Array.from(this.stateManager.getState().selectedDates);
        return { monto: parseFloat(montoInput.value) || 0, fechas, razonSocial: descClienteInput.value.trim(), pedido: pedidoInput.value.trim() };
    }

    _getAndValidateFormData() {
        const { montoInput, rucInput, lineaInput, pedidoInput, descClienteInput, codigoClienteInput } = this.elements;
        const monto = parseFloat(montoInput.value);
        const ruc = rucInput.value.trim();
        const linea = lineaInput.value;
        const pedido = pedidoInput.value.trim();
        const fechas = Array.from(this.stateManager.getState().selectedDates);
        const razonSocial = descClienteInput.value.trim();
        const codigoCliente = codigoClienteInput.value.trim();

        const { fieldErrors, generalErrors, isValid } = FormValidator.validate({
            monto,
            fechas,
            ruc,
            razonSocial,
            pedido
        });

        return {
            fieldErrors,
            generalErrors,
            isValid,
            payload: { montoTotal: monto, fechasValidas: fechas, razonSocial },
            uiData: { linea, pedido, ruc, codigoCliente }
        };
    }

    async calcular() {
        const { fieldErrors, generalErrors, isValid, payload, uiData } = this._getAndValidateFormData();

        if (!isValid) {
            UIUtils.mostrarToast(generalErrors.join(' | '), 'error');
            return;
        }
        
        try {
            UIUtils.mostrarLoading(true, 'Calculando distribución...');
            const resultado = await calcular(payload);
            
            this.stateManager.updateState({
                montoOriginal: payload.montoTotal,
                fechasOrdenadas: payload.fechasValidas,
                montosAsignados: resultado.montosAsignados,
                resumenMensual: resultado.resumenMensual,
                linea: uiData.linea,
                pedido: uiData.pedido,
                ruc: uiData.ruc,
                codigoCliente: uiData.codigoCliente,
                descCliente: payload.razonSocial,
                isDataDirty: false
            });
            
            this.mostrarResults();
            this.toggleRecalculateButton(false);
            this.components.navigation.goToPage(2);
        } catch (error) {
            console.error('Error en cálculo:', error);
            UIUtils.mostrarToast(error.message || 'Error al realizar el cálculo', 'error');
        } finally {
            UIUtils.mostrarLoading(false);
        }
    }

    async recalcular() {
        await this.calcular();
    }

    mostrarResults() {
        this.components.resultsRenderer.render(this.stateManager.getState());
    }

    _getReportDataPayload() {
        const state = this.stateManager.getState();
        return {
            montoOriginal: state.montoOriginal,
            fechasOrdenadas: state.fechasOrdenadas,
            montosAsignados: state.montosAsignados,
            resumenMensual: state.resumenMensual,
            razonSocial: state.descCliente,
            ruc: state.ruc,
            linea: state.linea,
            pedido: state.pedido,
            codigoCliente: state.codigoCliente
        };
    }

    _getBaseFilename() {
        const state = this.stateManager.getState();
        const formattedMonthYear = DateUtils.formatearMesAnioParaFilename(new Date());
        const sanitizedPedido = UIUtils.normalizeStringForFilename(state.pedido);
        const sanitizedCliente = UIUtils.normalizeStringForFilename(state.descCliente);
        return `${sanitizedPedido}-${sanitizedCliente}-${formattedMonthYear}`;
    }

    async _generateAndDownloadReport(apiFunction, reportData, filename, successMessage) {
        const blob = await apiFunction(reportData);
        UIUtils.downloadFile(blob, filename);
        UIUtils.mostrarToast(successMessage, 'success');
    }

    async generarAmbosReportes() {
        const state = this.stateManager.getState();
        if (state.isDataDirty) {
            UIUtils.mostrarToast('Hay cambios sin calcular. Por favor, actualice el cálculo antes de descargar los reportes.', 'warning');
            return;
        }
    
        UIUtils.mostrarLoading(true, 'Generando reportes...');
        try {
            const reportData = this._getReportDataPayload();
            const baseFilename = this._getBaseFilename();
    
            await this._generateAndDownloadReport(
                generarReporte,
                reportData,
                `reporte_${baseFilename}.xlsx`,
                'Reporte Excel generado correctamente'
            );
    
            await this._generateAndDownloadReport(
                generarReporteJson,
                reportData,
                `respaldo_${baseFilename}.json`,
                'Respaldo JSON generado correctamente'
            );
    
            this.stateManager.clearState(); // Clear local storage after successful report download
    
        } catch (error) {
            console.error('Error generando reportes:', error);
            UIUtils.mostrarToast(error.message || 'Error al generar uno o ambos reportes', 'error');
        } finally {
            UIUtils.mostrarLoading(false);
        }
    }

    actualizarListaFechas(fechas) {
        const listaFechasUl = document.getElementById('lista-fechas');
        const contadorFechasSpan = document.getElementById('contador-fechas');
        // const btnDeselectAll = document.getElementById('btn-deselect-all'); // REMOVED
        // const btnSiguienteFechas = this.elements.btnSiguienteFechas; // REMOVED

        listaFechasUl.innerHTML = ''; // Limpiar la lista existente
        fechas.sort((a, b) => DateUtils.parsearFecha(a) - DateUtils.parsearFecha(b)); // Ordenar fechas

        fechas.forEach(fecha => {
            const li = document.createElement('li');
            const diasRestantes = DateUtils.diasDesdeHoy(fecha);
            let textoDias = '';
            switch (diasRestantes) {
                case 0:
                    textoDias = ' (Hoy)';
                    break;
                case 1:
                    textoDias = ' (Mañana)';
                    break;
                case -1:
                    textoDias = ' (Ayer)';
                    break;
                default:
                    if (diasRestantes > 1) {
                        textoDias = ` (en ${diasRestantes} días)`;
                    } else {
                        textoDias = ` (hace ${Math.abs(diasRestantes)} días)`;
                    }
                    break;
            }
            li.textContent = `${fecha}${textoDias}`;
            listaFechasUl.appendChild(li);
        });

        contadorFechasSpan.textContent = `(${fechas.length})`;
        // Logic for btnDeselectAll and btnSiguienteFechas removed
        // The "Limpiar Selección" button was removed from HTML, so this logic is no longer needed.
        // The "Siguiente" button was removed from HTML, so this logic is no longer needed.
    }

    _deselectAllDates() {
        // Clear the state first
        this.stateManager.updateState({ selectedDates: new Set() });
        // Refetching events will trigger dayCellDidMount for all cells,
        // which will then remove the 'fc-day-selected' class based on the cleared state.
        this.components.calendario.refetchEvents(); 
        this.actualizarListaFechas([]);
        this._updateActionButtonsState();
        this.handleFormChange(); // Mark as dirty
    }

    _reiniciarCalculos() {
        this.stateManager.updateState({
            montoOriginal: 0,
            montosAsignados: {},
            resumenMensual: {},
            isDataDirty: true
        });
        this.toggleRecalculateButton(true);
        this.components.resultsRenderer.clear();
        UIUtils.mostrarToast('Cálculos reiniciados. Por favor, re-calcule.', 'info');
    }

    mostrarOpcionesRespaldo() {
        const modal = document.createElement('div');
        modal.classList.add('modal');
        modal.innerHTML = `
            <div class="modal-content">
                <h3>Cargar Respaldo</h3>
                <p>¿Cómo deseas cargar el respaldo?</p>
                <div class="modal-actions">
                    <button type="button" id="btn-load-edit" class="btn-primary">Cargar para Editar</button>
                    <button type="button" id="btn-generate-copy" class="btn-secondary">Generar Copia Exacta</button>
                    <button type="button" id="btn-cancel-load" class="btn-tertiary">Cancelar</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        modal.classList.add('active');

        const btnLoadEdit = modal.querySelector('#btn-load-edit');
        const btnGenerateCopy = modal.querySelector('#btn-generate-copy');
        const btnCancelLoad = modal.querySelector('#btn-cancel-load');

        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = '.json';
        fileInput.style.display = 'none';
        document.body.appendChild(fileInput); // Append to body to make it accessible

        btnLoadEdit.addEventListener('click', () => {
            fileInput.onchange = async (event) => {
                const file = event.target.files[0];
                if (file) {
                    try {
                        UIUtils.mostrarLoading(true, 'Cargando respaldo para edición...');
                        const loadedData = await FileManager.loadJsonFile(file);
                        this.cargarDatosDesdeRespaldo(loadedData);
                        UIUtils.mostrarToast('Respaldo cargado para edición exitosamente.', 'success');
                        modal.remove();
                    } catch (error) {
                        console.error('Error al cargar el archivo de respaldo para edición:', error);
                        UIUtils.mostrarToast('Error al cargar el archivo de respaldo para edición.', 'error');
                    } finally {
                        UIUtils.mostrarLoading(false);
                        fileInput.value = ''; // Clear file input
                    }
                }
            };
            fileInput.click();
        });

        btnGenerateCopy.addEventListener('click', () => {
            fileInput.onchange = async (event) => {
                const file = event.target.files[0];
                if (file) {
                    try {
                        UIUtils.mostrarLoading(true, 'Generando copia exacta...');
                        const loadedData = await FileManager.loadJsonFile(file);
                        await this._generateExactCopy(loadedData);
                        UIUtils.mostrarToast('Copia exacta generada exitosamente.', 'success');
                        modal.remove();
                    } catch (error) {
                        console.error('Error al generar copia exacta:', error);
                        UIUtils.mostrarToast('Error al generar copia exacta.', 'error');
                    } finally {
                        UIUtils.mostrarLoading(false);
                        fileInput.value = ''; // Clear file input
                    }
                }
            };
            fileInput.click();
        });

        btnCancelLoad.addEventListener('click', () => {
            modal.remove();
            fileInput.remove(); // Clean up the dynamically created file input
        });
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.remove();
                fileInput.remove(); // Clean up the dynamically created file input
            }
        });
    }

    async _generateExactCopy(data) {
        // This method will generate Excel and JSON reports directly from the loaded data
        // without populating the UI.
        const reportData = {
            montoOriginal: data.montoOriginal,
            fechasOrdenadas: data.fechasOrdenadas,
            montosAsignados: data.montosAsignados,
            resumenMensual: data.resumenMensual,
            razonSocial: data.razonSocial,
            ruc: data.ruc,
            linea: data.linea,
            pedido: data.pedido,
            codigoCliente: data.codigoCliente
        };

        const formattedMonthYear = DateUtils.formatearMesAnioParaFilename(new Date());
        const sanitizedPedido = UIUtils.normalizeStringForFilename(data.pedido || '');
        const sanitizedCliente = UIUtils.normalizeStringForFilename(data.razonSocial || '');
        const baseFilename = `${sanitizedPedido}-${sanitizedCliente}-${formattedMonthYear}`;

        const excelBlob = await generarReporte(reportData);
        const excelFilename = `reporte_${baseFilename}.xlsx`;
        UIUtils.downloadFile(excelBlob, excelFilename);

        const jsonBlob = await generarReporteJson(reportData);
        const jsonFilename = `respaldo_${baseFilename}.json`;
        UIUtils.downloadFile(jsonBlob, jsonFilename);
    }

    cargarDatosDesdeRespaldo(data) {
        // Capture current UI values for sensitive fields
        const currentRuc = this.elements.rucInput.value;
        const currentDescCliente = this.elements.descClienteInput.value;
        const currentLinea = this.elements.lineaInput.value;
        const currentPedido = this.elements.pedidoInput.value;

        // Prepare loaded values
        const loadedRuc = data.ruc || '';
        const loadedDescCliente = data.razonSocial || '';
        const loadedLinea = data.linea || 'otros';
        const loadedPedido = data.pedido || '';

        // Confirm RUC
        if (loadedRuc && loadedRuc !== currentRuc) {
            if (!window.confirm(`El RUC cargado (${loadedRuc}) es diferente al actual (${currentRuc}). ¿Deseas actualizarlo?`)) {
                data.ruc = currentRuc; // Keep current RUC if not confirmed
            }
        }

        // Confirm Razón Social
        if (loadedDescCliente && loadedDescCliente !== currentDescCliente) {
            if (!window.confirm(`La Razón Social cargada (${loadedDescCliente}) es diferente a la actual (${currentDescCliente}). ¿Deseas actualizarla?`)) {
                data.razonSocial = currentDescCliente; // Keep current Razón Social if not confirmed
            }
        }

        // Confirm Línea
        if (loadedLinea && loadedLinea !== currentLinea) {
            if (!window.confirm(`La Línea cargada (${loadedLinea}) es diferente a la actual (${currentLinea}). ¿Deseas actualizarla?`)) {
                data.linea = currentLinea; // Keep current Línea if not confirmed
            }
        }

        // Confirm Pedido
        if (loadedPedido && loadedPedido !== currentPedido) {
            if (!window.confirm(`El Código de Pedido cargado (${loadedPedido}) es diferente al actual (${currentPedido}). ¿Deseas actualizarlo?`)) {
                data.pedido = currentPedido; // Keep current Pedido if not confirmed
            }
        }

        // Actualizar el estado de la aplicación con los datos del respaldo (potentially modified by confirmations)
        this.stateManager.updateState({
            montoOriginal: data.montoOriginal || 0,
            selectedDates: new Set(data.fechasOrdenadas || []),
            fechasOrdenadas: data.fechasOrdenadas || [],
            montosAsignados: data.montosAsignados || {},
            resumenMensual: data.resumenMensual || {},
            ruc: data.ruc,
            descCliente: data.razonSocial,
            linea: data.linea,
            pedido: data.pedido,
            codigoCliente: data.codigoCliente || '',
            isDataDirty: true // Marcar como sucio para forzar recálculo si es necesario
        });

        const state = this.stateManager.getState();
        // Actualizar la UI con los datos cargados
        this.elements.montoInput.value = state.montoOriginal || '';
        this.elements.rucInput.value = state.ruc || '';
        this.elements.descClienteInput.value = state.descCliente || '';
        this.elements.lineaInput.value = state.linea || 'otros';
        this.elements.pedidoInput.value = state.pedido || '';
        this.elements.codigoClienteInput.value = state.codigoCliente || '';

        // Actualizar el calendario y la lista de fechas seleccionadas
        // Refetching events will trigger dayCellDidMount for all cells,
        // which will re-apply the 'fc-day-selected' class based on the new state.
        this.components.calendario.refetchEvents();
        this.actualizarListaFechas(Array.from(state.selectedDates));

        // Si hay datos de resultados, mostrarlos (aunque se marcará como dirty)
        if (Object.keys(data.montosAsignados).length > 0) {
            this.mostrarResults();
        }
        this.toggleRecalculateButton(true); // Mostrar botón de recálculo
        this.components.navigation.goToPage(1); // Ir a la página de datos del cliente
    }
}

window.addEventListener('unhandledrejection', event => {
    console.error('Unhandled Promise Rejection:', event.reason);
    UIUtils.mostrarToast(event.reason.message || 'Ocurrió un error inesperado', 'error');
});

document.addEventListener('DOMContentLoaded', () => {
    ThemeManager.applyInitialTheme();
    const app = new PlanificadorApp();
    app.init();
});