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
          console.log('getCurrentUserRole: No user logged in');
          return of(null);
        }
        console.log('getCurrentUserRole: user.id', user.id);
        return from(
          this.supabase
            .from('users')
            .select('role_id, email, auth_user_id')
            .eq('auth_user_id', user.id)
            .single()
        ).pipe(
          map(result => {
            console.log('getCurrentUserRole: result', result);
            return result.data?.role_id === 1 ? 'admin' : 'user';
          })
        );
      })
    );
  }

  inviteUserByEmail(email: string): Promise<any> {
    // Solo la administradora debe poder llamar a esto
    return this.supabase.auth.admin.inviteUserByEmail(email);
  }

  async getAllUsers(): Promise<any> {
    // Solo la administradora debe poder llamar a esto
    return await this.supabase.from('users').select('*');
  }
}
