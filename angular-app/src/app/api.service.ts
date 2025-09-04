import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class ApiService {

  // The base URL will point to the same origin, as the Angular app
  // and the Firebase functions will be served from the same domain.
  private baseUrl = '/api';

  constructor(private http: HttpClient) { }

  getHolidays(year: number): Observable<any> {
    return this.http.get(`${this.baseUrl}/getHolidays`, { params: { year: year.toString() } });
  }

  consultarRuc(ruc: string): Observable<any> {
    return this.http.get(`${this.baseUrl}/consultar-ruc`, { params: { numero: ruc } });
  }

  calculate(payload: any): Observable<any> {
    return this.http.post(`${this.baseUrl}/calculate`, payload);
  }

  generateExcel(payload: any): Observable<Blob> {
    return this.http.post(`${this.baseUrl}/generate-excel`, payload, { responseType: 'blob' });
  }

  generateJson(payload: any): Observable<Blob> {
    return this.http.post(`${this.baseUrl}/generate-json`, payload, { responseType: 'blob' });
  }
}
