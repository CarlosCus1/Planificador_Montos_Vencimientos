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

  constructor() { }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['results'] && this.results) {
      this.createChart();
    }
  }

  createChart(): void {
    if (this.chart) {
      this.chart.destroy();
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
