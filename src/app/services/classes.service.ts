import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';
import { Observable, map } from 'rxjs';

export interface Clase {
  id: string;
  name: string;
  type: string;
  description?: string;
  capacity?: number;
  duration_minutes?: number;
  schedule_date?: string;
  schedule_time?: string;
  price: number;
  // Agrega más campos según la API
}

function capitalize(str: string) {
  return str ? str.charAt(0).toUpperCase() + str.slice(1) : '';
}

@Injectable({ providedIn: 'root' })
export class ClassesService {
  private instance = '48534_mars_studio';
  private base = environment.apiBaseUrl;

  constructor(private http: HttpClient) {}

  getAll(page = 1, limit = 10): Observable<Clase[]> {
    return this.http.get<any>(`${this.base}/read/classes`, {
      params: { Instance: this.instance, page, limit }
    }).pipe(
      map(data => {
        const clasesRaw = Array.isArray(data) ? data : (data.data || []);
        return clasesRaw.map((clase: Clase) => ({
          ...clase,
          name: capitalize(clase.name),
          type: capitalize(clase.type),
          description: capitalize(clase.description || clase.type)
        }));
      })
    );
  }

  getById(id: string): Observable<Clase> {
    return this.http.get<any>(`${this.base}/read/classes/${id}`, {
      params: { Instance: this.instance }
    }).pipe(
      map(data => {
        const clase = data.data || data;
        return {
          ...clase,
          name: capitalize(clase.name),
          type: capitalize(clase.type),
          description: capitalize(clase.description || clase.type)
        };
      })
    );
  }

  search(body: any): Observable<Clase[]> {
    return this.http.post<any>(`${this.base}/search/classes`, body, {
      params: { Instance: this.instance }
    }).pipe(
      map(data => {
        const clasesRaw = Array.isArray(data) ? data : (data.data || []);
        return clasesRaw.map((clase: Clase) => ({
          ...clase,
          name: capitalize(clase.name),
          type: capitalize(clase.type),
          description: capitalize(clase.description || clase.type)
        }));
      })
    );
  }

  create(clase: Partial<Clase>): Observable<Clase> {
    return this.http.post<any>(`${this.base}/create/classes`, clase, {
      params: { Instance: this.instance }
    }).pipe(
      map(data => {
        const c = data.data || data;
        return {
          ...c,
          name: capitalize(c.name),
          type: capitalize(c.type),
          description: capitalize(c.description || clase.type)
          
        };
      })
    );
  }

  update(id: string, clase: Partial<Clase>): Observable<Clase> {
    return this.http.put<any>(`${this.base}/update/classes/${id}`, clase, {
      params: { Instance: this.instance }
    }).pipe(
      map(data => {
        const c = data.data || data;
        return {
          ...c,
          name: capitalize(c.name),
          type: capitalize(c.type),
          description: capitalize(c.description || clase.type)
        };
      })
    );
  }

  delete(id: string): Observable<any> {
    return this.http.delete(`${this.base}/delete/classes/${id}`, {
      params: { Instance: this.instance }
    });
  }
}
