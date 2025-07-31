import { Injectable } from '@angular/core';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { User as LocalUser } from '../models/user';
import { environment } from '../../environments/environment';
import { from, Observable, of } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';

@Injectable({ providedIn: 'root' })
export class SupabaseService {
  public supabase: SupabaseClient;

  constructor() {
    this.supabase = createClient(environment.supabaseUrl, environment.supabaseKey, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
        // Reducir problemas de lock en desarrollo
        storageKey: 'sb-auth-token',
        storage: window.localStorage,
        flowType: 'pkce'
      },
      // Configuración para desarrollo
      global: {
        headers: {
          'X-Client-Info': 'mars-studio-angular'
        }
      }
    });

    // Log para debugging en desarrollo
    if (!environment.production) {
      console.log('🔧 Supabase client initialized for development');
    }
  }



  async updateUser(user: Partial<LocalUser> & { id: number }): Promise<any> {
    const { id, ...fields } = user;
    const { data, error } = await this.supabase
      .from('users')
      .update(fields)
      .eq('id', id)
      .select()
      .single();
    if (error) {
      throw error;
    }
    return data;
  }

  getCurrentUser(): Observable<import('@supabase/supabase-js').User | null> {
    return from(this.supabase.auth.getUser()).pipe(
      map(result => result.data.user)
    );
  }

  getCurrentUserRole(): Observable<string | null> {
    return this.getCurrentUser().pipe(
      switchMap(user => {
        if (!user) {
          console.log('🔍 No authenticated user found');
          return of(null);
        }
        console.log('🔍 Checking role for user:', user.id);
        return from(
          this.supabase
            .from('users')
            .select('role_id, email, auth_user_id, id')
            .eq('auth_user_id', user.id)
            .single()
        ).pipe(
          map(result => {
            if (result.error) {
              console.error('❌ Error fetching user role:', result.error);
              return 'user'; // Default to 'user' role on error, never 'admin'
            }
            console.log('✅ User role data:', result.data);
            const roleId = result.data?.role_id;
            if (roleId === 1) {
              console.log('✅ User is admin (role_id: 1)');
              return 'admin';
            } else {
              console.log('✅ User is regular user (role_id:', roleId, ')');
              return 'user';
            }
          })
        );
      })
    );
  }

  async inviteUserByEmail(email: string): Promise<any> {
    console.log('🔄 Inviting user via Edge Function:', email);
    try {
      const { data: { session } } = await this.supabase.auth.getSession();
      if (!session) {
        throw new Error('No hay sesión activa');
      }
      const { data, error } = await this.supabase.functions.invoke('invite-user', {
        body: { email },
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });
      if (error) {
        if (error.status === 429 || error.message?.includes('email rate limit exceeded')) {
          throw new Error('El usuario ya fue invitado recientemente. Por favor, espera unos minutos antes de intentar nuevamente o pide al usuario que revise su email (incluyendo spam/correo no deseado).');
        }
        throw error;
      }
      if (data && data.error) {
        throw new Error(data.error);
      }
      return {
        data: data.data,
        message: data.message || `Invitación enviada exitosamente a ${email}.`
      };
    } catch (error: any) {
      let errorMessage = error.message;
      if (error.context && error.context.body) {
        try {
          const errorBody = JSON.parse(error.context.body);
          errorMessage = errorBody.error || errorMessage;
        } catch (parseError) {
          console.log('Could not parse error body:', error.context.body);
        }
      }
      throw new Error(`Error al enviar invitación: ${errorMessage}`);
    }
  }

  async createUserDirectly(email: string): Promise<any> {
    try {
      const authUserId = crypto.randomUUID();
      const { data, error } = await this.supabase
        .from('users')
        .insert([
          {
            auth_user_id: authUserId,
            email: email,
            role_id: 2, // Usuario normal
            name: email.split('@')[0], // Usar la parte antes del @ como nombre temporal
          }
        ])
        .select()
        .single();
      if (error) {
        throw error;
      }
      return {
        data,
        message: `Usuario ${email} agregado al sistema. Deberá registrarse normalmente para acceder.`
      };
    } catch (error: any) {
      throw new Error(`Error al crear usuario: ${error.message}`);
    }
  }

  async getAllUsers(): Promise<any> {
    return await this.supabase.from('users').select('*');
  }

  async deleteUser(userId: number): Promise<any> {
    try {
      console.log('🔄 Deleting user with ID:', userId);
      const { data: userData, error: fetchError } = await this.supabase
        .from('users')
        .select('auth_user_id, email')
        .eq('id', userId)
        .single();
      if (fetchError) {
        throw fetchError;
      }
      const { error: deleteUserError } = await this.supabase
        .from('users')
        .delete()
        .eq('id', userId);
      if (deleteUserError) {
        throw deleteUserError;
      }
      try {
        if (userData.auth_user_id) {
          const { data: session } = await this.supabase.auth.getSession();
          if (session.session) {
            const { data, error } = await this.supabase.functions.invoke('delete-user', {
              body: { auth_user_id: userData.auth_user_id },
              headers: {
                Authorization: `Bearer ${session.session.access_token}`,
              },
            });
            if (error) {
              console.warn('⚠️ Could not delete from auth system via Edge Function:', error);
            } else {
              console.log('✅ User deleted from auth system via Edge Function');
            }
          }
        }
      } catch (authError: any) {
        console.warn('⚠️ Could not delete from auth system (user deleted from app only):', authError);
      }
      return {
        success: true,
        message: `Usuario ${userData.email} eliminado correctamente del sistema.`
      };
    } catch (error: any) {
      throw new Error(`Error al eliminar usuario: ${error.message}`);
    }
  }

  /**
   * Obtiene las sesiones de clase con información de class_types para el calendario
   */
  async getClassSessionsWithTypes(): Promise<any[]> {
    const response = await this.supabase.functions.invoke('get-class-sessions');
    if (response.error) throw response.error;
    return response.data ?? [];
  }
}