import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';
import { Observable, map } from 'rxjs';
import { ClientProfile } from '../components/profile/profile.component';

function capitalize(str: string) {
  return str ? str.charAt(0).toUpperCase() + str.slice(1) : '';
}

@Injectable({ providedIn: 'root' })
export class UsersService {
  private instance = '48534_mars_studio';
  private base = environment.apiBaseUrl;

  constructor(private http: HttpClient) {}

  getAll(page = 1, limit = 10): Observable<ClientProfile[]> {
    return this.http.get<any>(`${this.base}/read/users`, {
      params: { Instance: this.instance, page, limit }
    }).pipe(
      map(data => {
        const usersRaw = Array.isArray(data) ? data : (data.data || []);
        return usersRaw.map((user: any) => ({
          ...user,
          nombre: capitalize(user.nombre),
          apellidos: capitalize(user.apellidos),
          email: user.email,
          telefono: user.telefono,
          bonosRestantes: user.bonosRestantes
        }));
      })
    );
  }

  getById(id: string): Observable<ClientProfile> {
    return this.http.get<any>(`${this.base}/read/users/${id}`, {
      params: { Instance: this.instance }
    }).pipe(
      map(data => {
        const user = data.data || data;
        return {
          ...user,
          nombre: capitalize(user.nombre),
          apellidos: capitalize(user.apellidos),
          email: user.email,
          telefono: user.telefono,
          bonosRestantes: user.bonosRestantes
        };
      })
    );
  }
}
