import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';
import { Observable, map } from 'rxjs';

export interface Booking {
  id: string;
  // Agrega más campos según la API
}

function capitalize(str: string) {
  return str ? str.charAt(0).toUpperCase() + str.slice(1) : '';
}

@Injectable({ providedIn: 'root' })
export class BookingsService {
  private instance = '48534_mars_studio';
  private base = environment.apiBaseUrl;

  constructor(private http: HttpClient) {}

  getAll(page = 1, limit = 10): Observable<Booking[]> {
    return this.http.get<any>(`${this.base}/read/bookings`, {
      params: { Instance: this.instance, page, limit }
    }).pipe(
      map(data => {
        const bookingsRaw = Array.isArray(data) ? data : (data.data || []);
        return bookingsRaw.map((booking: Booking) => ({
          ...booking,
          // Aplica capitalize a los campos string relevantes si los hay
        }));
      })
    );
  }

  getById(id: string): Observable<Booking> {
    return this.http.get<any>(`${this.base}/read/bookings/${id}`, {
      params: { Instance: this.instance }
    }).pipe(
      map(data => {
        const booking = data.data || data;
        return {
          ...booking,
          // Aplica capitalize a los campos string relevantes si los hay
        };
      })
    );
  }

  search(body: any): Observable<Booking[]> {
    return this.http.post<any>(`${this.base}/search/bookings`, body, {
      params: { Instance: this.instance }
    }).pipe(
      map(data => {
        const bookingsRaw = Array.isArray(data) ? data : (data.data || []);
        return bookingsRaw.map((booking: Booking) => ({
          ...booking,
          // Aplica capitalize a los campos string relevantes si los hay
        }));
      })
    );
  }

  create(booking: Partial<Booking>): Observable<Booking> {
    return this.http.post<any>(`${this.base}/create/bookings`, booking, {
      params: { Instance: this.instance }
    }).pipe(
      map(data => {
        const b = data.data || data;
        return {
          ...b,
          // Aplica capitalize a los campos string relevantes si los hay
        };
      })
    );
  }

  update(id: string, booking: Partial<Booking>): Observable<Booking> {
    return this.http.put<any>(`${this.base}/update/bookings/${id}`, booking, {
      params: { Instance: this.instance }
    }).pipe(
      map(data => {
        const b = data.data || data;
        return {
          ...b,
          // Aplica capitalize a los campos string relevantes si los hay
        };
      })
    );
  }

  delete(id: string): Observable<any> {
    return this.http.delete(`${this.base}/delete/bookings/${id}`, {
      params: { Instance: this.instance }
    });
  }
}
