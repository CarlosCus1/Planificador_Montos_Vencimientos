import { Component, OnInit, Output, EventEmitter } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ApiService } from '../api.service';
import { debounceTime, distinctUntilChanged, switchMap, catchError, tap } from 'rxjs/operators';
import { of } from 'rxjs';

@Component({
  selector: 'app-client-form',
  templateUrl: './client-form.component.html',
  styleUrls: ['./client-form.component.css']
})
export class ClientFormComponent implements OnInit {
  @Output() formSubmit = new EventEmitter<any>();
  clientForm: FormGroup;
  isRucLoading = false;
  rucError: string | null = null;

  constructor(private fb: FormBuilder, private apiService: ApiService) { }

  ngOnInit(): void {
    this.clientForm = this.fb.group({
      monto: [null, [Validators.required, Validators.min(0)]],
      ruc: ['', [Validators.required, Validators.pattern(/^\d{11}$/)]],
      razonSocial: [{ value: '', disabled: true }, Validators.required],
      codigoCliente: [''],
      linea: ['viniball', Validators.required],
      pedido: ['', Validators.required]
    });

    this.onRucChanges();
  }

  onRucChanges(): void {
    this.clientForm.get('ruc').valueChanges.pipe(
      debounceTime(500),
      distinctUntilChanged(),
      switchMap(ruc => {
        if (this.clientForm.get('ruc').valid) {
          this.isRucLoading = true;
          this.rucError = null;
          this.clientForm.get('razonSocial').disable();
          return this.apiService.consultarRuc(ruc).pipe(
            catchError(err => {
              this.rucError = 'Error al consultar RUC. Por favor, ingrese la Razón Social manualmente.';
              this.clientForm.get('razonSocial').enable();
              return of(null); // Return a null observable to continue the stream
            })
          );
        }
        return of(null); // If RUC is not valid, do nothing
      })
    ).subscribe(data => {
      this.isRucLoading = false;
      if (data && data.razonSocial) {
        this.clientForm.get('razonSocial').setValue(data.razonSocial);
        this.clientForm.get('razonSocial').disable(); // Keep it disabled after fetching
      }
    });
  }


  onSubmit() {
    if (this.clientForm.valid) {
      this.formSubmit.emit(this.clientForm.getRawValue());
    } else {
      console.log('Form is invalid');
      // Optionally, mark all fields as touched to show validation errors
      this.clientForm.markAllAsTouched();
    }
  }
}
