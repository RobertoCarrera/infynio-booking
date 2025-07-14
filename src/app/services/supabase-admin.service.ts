import { Injectable } from '@angular/core';
import { createClient, SupabaseClient, User } from '@supabase/supabase-js';
import { environment } from '../../environments/environment';
import { from, Observable, of } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';

@Injectable({ providedIn: 'root' })
export class SupabaseService {
  private supabase: SupabaseClient;

  constructor() {
    this.supabase = createClient(environment.supabaseUrl, environment.supabaseKey);
  }

  getCurrentUser(): Observable<User | null> {
    return from(this.supabase.auth.getUser()).pipe(
      map(result => result.data.user)
    );
  }

  getCurrentUserRole(): Observable<string | null> {
    return this.getCurrentUser().pipe(
      switchMap(user => {
        if (!user) {
          return of(null);
        }
        return from(
          this.supabase
            .from('users')
            .select('role_id, email, auth_user_id')
            .eq('auth_user_id', user.id)
            .single()
        ).pipe(
          map(result => {
            return result.data?.role_id === 1 ? 'admin' : 'user';
          })
        );
      })
    );
  }

  inviteUserByEmail(email: string): Promise<any> {
    return this.supabase.auth.admin.inviteUserByEmail(email);
  }

  async getAllUsers(): Promise<any> {
    return await this.supabase.from('users').select('*');
  }
}
