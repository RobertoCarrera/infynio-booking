import { Injectable } from '@angular/core';
import { Observable, from } from 'rxjs';
import { map } from 'rxjs/operators';
import { SupabaseService } from './supabase.service';

@Injectable({ providedIn: 'root' })
export class DatabaseService {

  constructor(private supabaseService: SupabaseService) {}

  // Operaciones genéricas CRUD
  getAll<T>(table: string, page = 1, limit = 10): Observable<T[]> {
    const fromIndex = (page - 1) * limit;
    return from(
      this.supabaseService.supabase
        .from(table)
        .select('*')
        .range(fromIndex, fromIndex + limit - 1)
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return (data || []) as T[];
      })
    );
  }

  getById<T>(table: string, id: string): Observable<T | null> {
    return from(
      this.supabaseService.supabase
        .from(table)
        .select('*')
        .eq('id', id)
        .single()
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return data as T;
      })
    );
  }

  search<T>(table: string, filters: any): Observable<T[]> {
    let query = this.supabaseService.supabase.from(table).select('*');
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
        return (data || []) as T[];
      })
    );
  }

  create<T>(table: string, item: Partial<T>): Observable<T> {
    return from(
      this.supabaseService.supabase
        .from(table)
        .insert([item])
        .select()
        .single()
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return data as T;
      })
    );
  }

  update<T>(table: string, id: string, item: Partial<T>): Observable<T> {
    return from(
      this.supabaseService.supabase
        .from(table)
        .update(item)
        .eq('id', id)
        .select()
        .single()
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return data as T;
      })
    );
  }

  delete(table: string, id: string): Observable<any> {
    return from(
      this.supabaseService.supabase
        .from(table)
        .delete()
        .eq('id', id)
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return data;
      })
    );
  }

  // Método genérico para queries personalizadas que devuelven un solo resultado
  querySingle<T>(callback: (supabase: any) => Promise<{data: any, error: any}>): Observable<T | null> {
    return from(callback(this.supabaseService.supabase)).pipe(
      map(({ data, error }: {data: any, error: any}) => {
        if (error) {
          // Si es error de "no encontrado", devolver null en lugar de error
          if (error.code === 'PGRST116') {
            return null;
          }
          throw error;
        }
        return data as T;
      })
    );
  }

  // Método genérico para queries personalizadas
  query<T>(callback: (supabase: any) => Promise<{data: any, error: any}>): Observable<T[]> {
    return from(callback(this.supabaseService.supabase)).pipe(
      map(({ data, error }: {data: any, error: any}) => {
        if (error) throw error;
        return (data || []) as T[];
      })
    );
  }
}
