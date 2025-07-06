import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';
import { Observable, map } from 'rxjs';

export interface Payment {
  id: string;
  amount: number;
  date: string;
  method?: string;
  // Agrega más campos según la API
}

function capitalize(str: string) {
  return str ? str.charAt(0).toUpperCase() + str.slice(1) : '';
}

@Injectable({ providedIn: 'root' })
export class PaymentsService {
  private instance = '48534_mars_studio';
  private base = environment.apiBaseUrl;

  constructor(private http: HttpClient) {}

  getAll(page = 1, limit = 10): Observable<Payment[]> {
    return this.http.get<any>(`${this.base}/read/payments`, {
      params: { Instance: this.instance, page, limit }
    }).pipe(
      map(data => {
        const paymentsRaw = Array.isArray(data) ? data : (data.data || []);
        return paymentsRaw.map((payment: Payment) => ({
          ...payment,
          method: capitalize(payment.method ?? '')
        }));
      })
    );
  }

  getById(id: string): Observable<Payment> {
    return this.http.get<any>(`${this.base}/read/payments/${id}`, {
      params: { Instance: this.instance }
    }).pipe(
      map(data => {
        const payment = data.data || data;
        return {
          ...payment,
          method: capitalize(payment.method ?? '')
        };
      })
    );
  }

  search(body: any): Observable<Payment[]> {
    return this.http.post<any>(`${this.base}/search/payments`, body, {
      params: { Instance: this.instance }
    }).pipe(
      map(data => {
        const paymentsRaw = Array.isArray(data) ? data : (data.data || []);
        return paymentsRaw.map((payment: Payment) => ({
          ...payment,
          method: capitalize(payment.method ?? '')
        }));
      })
    );
  }

  create(payment: Partial<Payment>): Observable<Payment> {
    return this.http.post<any>(`${this.base}/create/payments`, payment, {
      params: { Instance: this.instance }
    }).pipe(
      map(data => {
        const p = data.data || data;
        return {
          ...p,
          method: capitalize(p.method ?? '')
        };
      })
    );
  }

  update(id: string, payment: Partial<Payment>): Observable<Payment> {
    return this.http.put<any>(`${this.base}/update/payments/${id}`, payment, {
      params: { Instance: this.instance }
    }).pipe(
      map(data => {
        const p = data.data || data;
        return {
          ...p,
          method: capitalize(p.method ?? '')
        };
      })
    );
  }

  delete(id: string): Observable<any> {
    return this.http.delete(`${this.base}/delete/payments/${id}`, {
      params: { Instance: this.instance }
    });
  }
}
