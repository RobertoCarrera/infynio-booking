import { Injectable } from '@angular/core';
import { User } from '@supabase/supabase-js';
import { from, Observable, of } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';
import { SupabaseService } from './supabase.service';

@Injectable({ providedIn: 'root' })
export class SupabaseAdminService {

  constructor(private supabaseService: SupabaseService) {
  }

  getCurrentUser(): Observable<User | null> {
    return from(this.supabaseService.supabase.auth.getUser()).pipe(
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
          this.supabaseService.supabase
            .from('users')
            .select('role_id, email, auth_user_id, id')
            .eq('auth_user_id', user.id)
            .single()
        ).pipe(
          map(result => {
            if (result.error) {
              console.error('❌ Error fetching user role:', result.error);
              return null;
            }
            
            console.log('✅ User role data:', result.data);
            return result.data?.role_id === 1 ? 'admin' : 'user';
          })
        );
      })
    );
  }

  async inviteUserByEmail(email: string): Promise<any> {
    console.log('🔄 Inviting user via Edge Function:', email);
    
    try {
      // Obtener token del usuario actual
      const { data: { session } } = await this.supabaseService.supabase.auth.getSession();
      
      if (!session) {
        throw new Error('No hay sesión activa');
      }

      // Llamar a la Edge Function
      const { data, error } = await this.supabaseService.supabase.functions.invoke('invite-user', {
        body: { email },
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (error) {
        console.error('❌ Edge Function error details:', error);
        
        // Manejar error de rate limiting específicamente
        if (error.status === 429 || error.message?.includes('email rate limit exceeded')) {
          throw new Error('El usuario ya fue invitado recientemente. Por favor, espera unos minutos antes de intentar nuevamente o pide al usuario que revise su email (incluyendo spam/correo no deseado).');
        }
        
        throw error;
      }

      // Verificar si hay errores en la respuesta de la función
      if (data && data.error) {
        console.error('❌ Edge Function returned error:', data.error);
        throw new Error(data.error);
      }

      console.log('✅ User invited via Edge Function:', data);
      return {
        data: data.data,
        message: data.message || `Invitación enviada exitosamente a ${email}.`
      };
    } catch (error: any) {
      console.error('❌ Error inviting user via Edge Function:', error);
      
      // Intentar extraer más información del error
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

  // Método alternativo que crea usuario directamente en la base de datos
  async createUserDirectly(email: string): Promise<any> {
    try {
      console.log('🔄 Creating user directly in database:', email);
      
      // Generar un UUID para el auth_user_id
      const authUserId = crypto.randomUUID();
      
      // Insertar directamente en la tabla users
      const { data, error } = await this.supabaseService.supabase
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

      console.log('✅ User created directly:', data);
      return {
        data,
        message: `Usuario ${email} agregado al sistema. Deberá registrarse normalmente para acceder.`
      };
    } catch (error: any) {
      console.error('❌ Direct user creation failed:', error);
      throw new Error(`Error al crear usuario: ${error.message}`);
    }
  }

  private generateTemporaryPassword(): string {
    // Generar password temporal seguro
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
    let password = '';
    for (let i = 0; i < 16; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return password;
  }

  async getAllUsers(): Promise<any> {
    return await this.supabaseService.supabase.from('users').select('*');
  }

  async deleteUser(userId: number): Promise<any> {
    try {
      console.log('🔄 Deleting user with ID:', userId);
      
      // Primero obtenemos el usuario para tener su auth_user_id
      const { data: userData, error: fetchError } = await this.supabaseService.supabase
        .from('users')
        .select('auth_user_id, email')
        .eq('id', userId)
        .single();

      if (fetchError) {
        throw fetchError;
      }

      // Borrar de la tabla users primero
      const { error: deleteUserError } = await this.supabaseService.supabase
        .from('users')
        .delete()
        .eq('id', userId);

      if (deleteUserError) {
        throw deleteUserError;
      }

      // Intentar borrar también del sistema de autenticación usando Edge Function
      try {
        if (userData.auth_user_id) {
          console.log('🔄 Attempting to delete from auth system via Edge Function...');
          
          const { data: session } = await this.supabaseService.supabase.auth.getSession();
          
          if (session.session) {
            const { data, error } = await this.supabaseService.supabase.functions.invoke('delete-user', {
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

      console.log('✅ User deleted successfully');
      return {
        success: true,
        message: `Usuario ${userData.email} eliminado correctamente del sistema.`
      };
    } catch (error: any) {
      console.error('❌ Error deleting user:', error);
      throw new Error(`Error al eliminar usuario: ${error.message}`);
    }
  }
}
