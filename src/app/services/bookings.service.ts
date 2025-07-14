import { Injectable } from '@angular/core';
import { Observable, from } from 'rxjs';
import { map } from 'rxjs/operators';
import { SupabaseClient, createClient } from '@supabase/supabase-js';
import { environment } from '../../environments/environment';

export interface Booking {
  id: string;
}

@Injectable({ providedIn: 'root' })
export class BookingsService {
  private supabase: SupabaseClient;

  constructor() {
    this.supabase = createClient(environment.supabaseUrl, environment.supabaseKey);
  }

  getAll(page = 1, limit = 10): Observable<Booking[]> {
    const fromIndex = (page - 1) * limit;
    return from(
      this.supabase
        .from('bookings')
        .select('*')
        .range(fromIndex, fromIndex + limit - 1)
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return (data || []) as Booking[];
      })
    );
  }

  getById(id: string): Observable<Booking | null> {
    return from(
      this.supabase
        .from('bookings')
        .select('*')
        .eq('id', id)
        .single()
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return data as Booking;
      })
    );
  }

  search(filters: any): Observable<Booking[]> {
    let query = this.supabase.from('bookings').select('*');
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
        return (data || []) as Booking[];
      })
    );
  }

  create(booking: Partial<Booking>): Observable<Booking> {
    return from(
      this.supabase
        .from('bookings')
        .insert([booking])
        .select()
        .single()
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return data as Booking;
      })
    );
  }

  update(id: string, booking: Partial<Booking>): Observable<Booking> {
    return from(
      this.supabase
        .from('bookings')
        .update(booking)
        .eq('id', id)
        .select()
        .single()
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return data as Booking;
      })
    );
  }

  delete(id: string): Observable<any> {
    return from(
      this.supabase
        .from('bookings')
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
