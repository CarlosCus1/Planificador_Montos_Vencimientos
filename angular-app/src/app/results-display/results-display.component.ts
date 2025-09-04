import { Component, Input, OnChanges, SimpleChanges, ViewChild, ElementRef } from '@angular/core';
import { Chart, registerables } from 'chart.js';
Chart.register(...registerables);

@Component({
  selector: 'app-results-display',
  templateUrl: './results-display.component.html',
  styleUrls: ['./results-display.component.css']
})
export class ResultsDisplayComponent implements OnChanges {
  @Input() results: any;
  @ViewChild('graficoResumen') private chartRef: ElementRef;

  private chart: Chart;
  adjustedMontos: { [key: string]: number } = {};
  adjustedTotal = 0;
  totalDifference = 0;

  constructor() { }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['results'] && this.results) {
      // When new results come in, reset adjustments
      this.adjustedMontos = { ...this.results.montosAsignados };
      this.calculateAdjustedTotal();
      this.createChart();
    }
  }

  // Expose Object.keys to the template
  objectKeys(obj: object): string[] {
    return Object.keys(obj);
  }

  calculateAdjustedTotal(): void {
    this.adjustedTotal = Object.values(this.adjustedMontos).reduce((sum, current) => sum + Number(current), 0);
    this.totalDifference = this.results.montoOriginal - this.adjustedTotal;
  }

  onMontoAdjusted(): void {
    this.calculateAdjustedTotal();
  }

  createChart(): void {
    if (this.chart) {
      this.chart.destroy();
    }

    if (!this.results || !this.chartRef) {
      return;
    }

    const labels = Object.keys(this.results.resumenMensual);
    const data = Object.values(this.results.resumenMensual).map((month: any) => month.monto);

    this.chart = new Chart(this.chartRef.nativeElement, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [{
          label: 'Resumen Mensual',
          data: data,
          backgroundColor: 'rgba(75, 192, 192, 0.2)',
          borderColor: 'rgba(75, 192, 192, 1)',
          borderWidth: 1
        }]
      },
      options: {
        scales: {
          y: {
            beginAtZero: true
          }
        }
      }
    });
  }
}
