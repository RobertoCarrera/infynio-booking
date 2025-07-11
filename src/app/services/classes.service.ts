import { Injectable } from '@angular/core';
import { Observable, from } from 'rxjs';
import { map } from 'rxjs/operators';
import { SupabaseClient, createClient } from '@supabase/supabase-js';
import { environment } from '../../environments/environment';

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
  private supabase: SupabaseClient;

  constructor() {
    // Inicializa el cliente de Supabase directamente
    this.supabase = createClient(environment.supabaseUrl, environment.supabaseKey);
    console.log('ClassesService: Supabase inicializado');
  }

  // Resto de métodos igual
  getAll(page = 1, limit = 10): Observable<Clase[]> {
    const fromIndex = (page - 1) * limit;
    return from(
      this.supabase
        .from('class_sessions')
        .select('*')
        .range(fromIndex, fromIndex + limit - 1)
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return (data || []) as Clase[];
      })
    );
  }

  getById(id: string): Observable<Clase | null> {
    return from(
      this.supabase
        .from('class_sessions')
        .select('*')
        .eq('id', id)
        .single()
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return data as Clase;
      })
    );
  }

  search(filters: any): Observable<Clase[]> {
    // Puedes adaptar los filtros según tus necesidades
    let query = this.supabase.from('class_sessions').select('*');
    if (filters) {
      Object.keys(filters).forEach(key => {
        if (filters[key] !== undefined && filters[key] !== null) {
          query = query.eq(key, filters[key]);
        }
      });
    }
    return from(query).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return (data || []) as Clase[];
      })
    );
  }

  create(clase: Partial<Clase>): Observable<Clase> {
    return from(
      this.supabase
        .from('class_sessions')
        .insert([clase])
        .select()
        .single()
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return data as Clase;
      })
    );
  }

  update(id: string, clase: Partial<Clase>): Observable<Clase> {
    return from(
      this.supabase
        .from('class_sessions')
        .update(clase)
        .eq('id', id)
        .select()
        .single()
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return data as Clase;
      })
    );
  }

  delete(id: string): Observable<any> {
    return from(
      this.supabase
        .from('class_sessions')
        .delete()
        .eq('id', id)
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return data;
      })
    );
  }
}
