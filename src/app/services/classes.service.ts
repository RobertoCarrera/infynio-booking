import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { DatabaseService } from './database.service';

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
}

@Injectable({ providedIn: 'root' })
export class ClassesService {

  constructor(private databaseService: DatabaseService) {
  }

  // Operaciones básicas usando DatabaseService
  getAll(page = 1, limit = 10): Observable<Clase[]> {
    return this.databaseService.getAll<Clase>('class_sessions', page, limit);
  }

  getById(id: string): Observable<Clase | null> {
    return this.databaseService.getById<Clase>('class_sessions', id);
  }

  search(filters: any): Observable<Clase[]> {
    return this.databaseService.search<Clase>('class_sessions', filters);
  }

  create(clase: Partial<Clase>): Observable<Clase> {
    return this.databaseService.create<Clase>('class_sessions', clase);
  }

  update(id: string, clase: Partial<Clase>): Observable<Clase> {
    return this.databaseService.update<Clase>('class_sessions', id, clase);
  }

  delete(id: string): Observable<any> {
    return this.databaseService.delete('class_sessions', id);
  }
}
