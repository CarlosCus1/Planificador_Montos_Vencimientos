import { COLOR_PALETTES } from './config.js';

export class GraficoManager {
    constructor() {
        this.chart = null;
        this.ctx = document.getElementById('grafico-resumen')?.getContext('2d');
        if (!this.ctx) {
            console.error('No se encontró el canvas para el gráfico.');
        }
    }

    _getPalette(linea) {
        const key = (linea || 'otros').toLowerCase();
        return COLOR_PALETTES[key] || COLOR_PALETTES.otros;
    }

    actualizarGrafico(resumenMensual, montoTotalGeneral, linea) {
        if (!this.ctx || !resumenMensual) return;

        const labels = Object.keys(resumenMensual).sort();
        const data = labels.map(label => resumenMensual[label]);
        const palette = this._getPalette(linea);

        if (this.chart) {
            this.chart.destroy();
        }

        this.chart = new Chart(this.ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: `Monto por Mes (S/)`,
                    data: data,
                    backgroundColor: palette.background,
                    borderColor: palette.border,
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            callback: function(value) {
                                return 'S/ ' + value.toLocaleString('es-PE');
                            }
                        },
                        title: {
                            display: true,
                            text: 'Monto (S/)'
                        }
                    },
                    x: {
                        title: {
                            display: true,
                            text: 'Mes'
                        }
                    }
                },
                plugins: {
                    legend: {
                        display: false
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                let label = context.dataset.label || '';
                                if (label) {
                                    label += ': ';
                                }
                                if (context.parsed.y !== null) {
                                    const montoMes = context.parsed.y;
                                    const porcentaje = montoTotalGeneral > 0 ? ((montoMes / montoTotalGeneral) * 100).toFixed(2) : 0;
                                    label += `S/ ${montoMes.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (${porcentaje}%)`;
                                }
                                return label;
                            }
                        }
                    }
                }
            }
        });
    }

    clearChart() {
        if (this.chart) {
            this.chart.destroy();
            this.chart = null; // Clear the reference
        }
        // Optionally, clear the canvas if needed, though destroy usually handles it
        if (this.ctx) {
            this.ctx.clearRect(0, 0, this.ctx.canvas.width, this.ctx.canvas.height);
        }
    }
}