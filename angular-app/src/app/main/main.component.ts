import { Component } from '@angular/core';
import { ApiService } from '../api.service';

@Component({
  selector: 'app-main',
  templateUrl: './main.component.html',
  styleUrls: ['./main.component.css']
})
export class MainComponent {
  title = 'planificador-v2';
  calculationResults: any = null;

  constructor(private apiService: ApiService) {}

  handleFormSubmit(formData: any) {
    const payload = {
      montoTotal: formData.monto,
      fechasValidas: ['2024-12-01', '2024-12-15'], // Placeholder
      razonSocial: formData.razonSocial
    };

    this.apiService.calculate(payload).subscribe({
      next: (results) => {
        this.calculationResults = results;
      },
      error: (err) => {
        console.error('Calculation failed', err);
      }
    });
  }
}
