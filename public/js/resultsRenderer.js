import { DateUtils } from './dateUtils.js';

/**
 * Gestiona el renderizado de toda la sección de resultados.
 */
export class ResultsRenderer {
    constructor(graficoManager) {
        this.graficoManager = graficoManager;
        this.elements = {
            tablaResumenThead: document.querySelector('#tabla-resumen thead'),
            tablaResumenBody: document.querySelector('#tabla-resumen tbody'),
            detalleContainer: document.getElementById('tabla-detalle-horizontal'),
            totalesContainer: document.getElementById('totales-comparativos')
        };
    }

    /**
     * Renderiza toda la sección de resultados.
     * @param {object} state - El estado completo de la aplicación.
     */
    render(state) {
        this.graficoManager.actualizarGrafico(state.resumenMensual, state.montoOriginal, state.linea);
        this._renderResumenTable(state);
        this._renderDetalleTable(state);
        this._renderComparisonTotals(state);
    }

    _renderResumenTable(state) {
        const { tablaResumenThead, tablaResumenBody } = this.elements;
        if (!tablaResumenThead || !tablaResumenBody) return;

        tablaResumenThead.innerHTML = `
            <tr>
                <th>Mes</th>
                <th>Monto (S/)</th>
                <th>% del Total</th>
            </tr>
        `;

        const totalMonto = state.montoOriginal;
        const sortedMonths = Object.keys(state.resumenMensual).sort((a, b) => new Date(a.split('-')[0], a.split('-')[1] - 1) - new Date(b.split('-')[0], b.split('-')[1] - 1));

        let bodyHtml = '';
        sortedMonths.forEach(mes => {
            const montoMes = state.resumenMensual[mes] || 0;
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

    _renderDetalleTable(state) {
        const { detalleContainer } = this.elements;
        if (!detalleContainer) return;

        detalleContainer.innerHTML = '';

        const montosPorMes = {};
        for (const fechaStr in state.montosAsignados) {
            const monthKey = DateUtils.obtenerMesAnio(fechaStr);
            if (!montosPorMes[monthKey]) {
                montosPorMes[monthKey] = [];
            }
            montosPorMes[monthKey].push({
                date: fechaStr,
                amount: state.montosAsignados[fechaStr]
            });
        }

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
            
            const monthDisplay = DateUtils.formatearMesAnioDisplay(monthKey);
            const yearShort = monthKey.substring(2, 4);
            monthHeaderDiv.textContent = 
                `${monthDisplay.split(' ')[0]} ${yearShort}, S/ ${monthTotal.toFixed(2)}`;
            monthGroupDiv.appendChild(monthHeaderDiv);

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
    }

        _renderComparisonTotals(state) {
        const { totalesContainer } = this.elements;
        if (!totalesContainer) return;

        totalesContainer.innerHTML = `
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

        const montoOriginalDisplay = totalesContainer.querySelector('#monto-original-display');
        const sumaMontosDetalladosDisplay = totalesContainer.querySelector('#suma-montos-detallados-display');
        const estadoTotales = totalesContainer.querySelector('#estado-totales');

        const montoOriginal = state.montoOriginal;
        const sumaMontosDetallados = Object.values(state.montosAsignados).reduce((sum, monto) => sum + monto, 0);

        montoOriginalDisplay.textContent = `S/ ${montoOriginal.toFixed(2)}`;
        sumaMontosDetalladosDisplay.textContent = `S/ ${sumaMontosDetallados.toFixed(2)}`;

        const tolerance = 0.01;
        if (Math.abs(montoOriginal - sumaMontosDetallados) < tolerance) {
            estadoTotales.textContent = 'Coincide';
            estadoTotales.className = 'status-ok';
        } else {
            const diferencia = sumaMontosDetallados - montoOriginal;
            estadoTotales.textContent = `No Coincide (Diferencia: S/ ${diferencia.toFixed(2)})`;
            estadoTotales.className = 'status-error';
        }
    }

    clear() {
        this.elements.tablaResumenThead.innerHTML = '';
        this.elements.tablaResumenBody.innerHTML = '';
        this.elements.detalleContainer.innerHTML = '';
        this.elements.totalesContainer.innerHTML = '';
        this.graficoManager.clearChart();
    }
}