import { Injectable } from '@angular/core';
import { Observable, from } from 'rxjs';
import { map } from 'rxjs/operators';
import { SupabaseClient, createClient } from '@supabase/supabase-js';
import { environment } from '../../environments/environment';

export interface Payment {
  id: string;
  amount: number;
  date: string;
  method?: string;
}

@Injectable({ providedIn: 'root' })
export class PaymentsService {
  private supabase: SupabaseClient;

  constructor() {
    this.supabase = createClient(environment.supabaseUrl, environment.supabaseKey);
  }

  getAll(page = 1, limit = 10): Observable<Payment[]> {
    const fromIndex = (page - 1) * limit;
    return from(
      this.supabase
        .from('payments')
        .select('*')
        .range(fromIndex, fromIndex + limit - 1)
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return (data || []) as Payment[];
      })
    );
  }

  getById(id: string): Observable<Payment | null> {
    return from(
      this.supabase
        .from('payments')
        .select('*')
        .eq('id', id)
        .single()
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return data as Payment;
      })
    );
  }

  search(filters: any): Observable<Payment[]> {
    let query = this.supabase.from('payments').select('*');
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
        return (data || []) as Payment[];
      })
    );
  }

  create(payment: Partial<Payment>): Observable<Payment> {
    return from(
      this.supabase
        .from('payments')
        .insert([payment])
        .select()
        .single()
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return data as Payment;
      })
    );
  }

  update(id: string, payment: Partial<Payment>): Observable<Payment> {
    return from(
      this.supabase
        .from('payments')
        .update(payment)
        .eq('id', id)
        .select()
        .single()
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return data as Payment;
      })
    );
  }

  delete(id: string): Observable<any> {
    return from(
      this.supabase
        .from('payments')
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
