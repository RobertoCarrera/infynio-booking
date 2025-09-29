import { Injectable } from '@angular/core';
import { Observable, from } from 'rxjs';
import { map } from 'rxjs/operators';
import { DatabaseService } from './database.service';
import { User } from '../models/user';
import { SupabaseService } from './supabase.service';

@Injectable({ providedIn: 'root' })
export class UsersService {

  constructor(private databaseService: DatabaseService, private supabaseService: SupabaseService) {
  }

  // Operaciones básicas usando DatabaseService
  getAll(page = 1, limit = 10): Observable<User[]> {
    return this.databaseService.getAll<User>('users', page, limit);
  }

  getById(id: string): Observable<User | null> {
    return this.databaseService.getById<User>('users', id);
  }

  search(filters: any): Observable<User[]> {
    return this.databaseService.search<User>('users', filters);
  }

  create(user: Partial<User>): Observable<User> {
    return this.databaseService.create<User>('users', user);
  }

  update(id: string, user: Partial<User>): Observable<User> {
    return this.databaseService.update<User>('users', id, user);
  }

  delete(id: string): Observable<any> {
    return this.databaseService.delete('users', id);
  }

  // Método específico de usuarios - manejo especial de errores
  getByAuthUserId(auth_user_id: string): Observable<User | null> {
    return this.databaseService.querySingle<User>(
      (supabase) => supabase
        .from('users')
        .select('*')
        .eq('auth_user_id', auth_user_id)
        .single()
    );
  }

  /**
   * Server-side search of onboarded users via RPC search_onboarded_users.
   * Returns only users that satisfy onboarding requirements.
   */
  searchOnboarded(text: string, limit = 40, offset = 0): Observable<User[]> {
    const payload: any = {
      p_text: text && text.trim() ? text.trim() : null,
      p_limit: limit,
      p_offset: offset
    };
    return from(
      this.supabaseService.supabase.rpc('search_onboarded_users', payload)
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return (data || []) as User[];
      })
    );
  }
}
