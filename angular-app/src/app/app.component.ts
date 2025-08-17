import { Component } from '@angular/core';
import { ApiService } from './api.service';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})
export class AppComponent {
  title = 'planificador-v2';
  calculationResults: any = null;

  constructor(private apiService: ApiService) {}

  handleFormSubmit(formData: any) {
    // This is a simplified payload. The original app had more complex logic
    // for preparing the data, which can be added later.
    const payload = {
      montoTotal: formData.monto,
      fechasValidas: ['2024-12-01', '2024-12-15'], // Placeholder dates
      razonSocial: formData.razonSocial
    };

    this.apiService.calculate(payload).subscribe({
      next: (results) => {
        this.calculationResults = results;
        console.log('Calculation successful', results);
      },
      error: (err) => {
        console.error('Calculation failed', err);
        // Here we would show an error message to the user
      }
    });
  }
}
