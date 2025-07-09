import { Injectable } from '@angular/core';
import { Observable, from } from 'rxjs';
import { map } from 'rxjs/operators';
import { SupabaseClient, createClient } from '@supabase/supabase-js';
import { environment } from '../../environments/environment';
import { User } from '../models/user';

@Injectable({ providedIn: 'root' })
export class UsersService {
  private supabase: SupabaseClient;

  constructor() {
    this.supabase = createClient(environment.supabaseUrl, environment.supabaseKey);
  }

  getAll(page = 1, limit = 10): Observable<User[]> {
    const fromIndex = (page - 1) * limit;
    return from(
      this.supabase
        .from('users')
        .select('*')
        .range(fromIndex, fromIndex + limit - 1)
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return (data || []) as User[];
      })
    );
  }

  getById(id: string): Observable<User | null> {
    return from(
      this.supabase
        .from('users')
        .select('*')
        .eq('id', id)
        .single()
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return data as User;
      })
    );
  }

  search(filters: any): Observable<User[]> {
    let query = this.supabase.from('users').select('*');
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
        return (data || []) as User[];
      })
    );
  }

  create(user: Partial<User>): Observable<User> {
    return from(
      this.supabase
        .from('users')
        .insert([user])
        .select()
        .single()
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return data as User;
      })
    );
  }

  update(id: string, user: Partial<User>): Observable<User> {
    return from(
      this.supabase
        .from('users')
        .update(user)
        .eq('id', id)
        .select()
        .single()
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return data as User;
      })
    );
  }

  delete(id: string): Observable<any> {
    return from(
      this.supabase
        .from('users')
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
