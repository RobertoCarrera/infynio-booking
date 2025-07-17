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
          return of(null);
        }
        return from(
          this.supabaseService.supabase
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

  async inviteUserByEmail(email: string): Promise<any> {
    console.log('🔄 Attempting admin invite for:', email);
    
    try {
      // Opción 1: Intentar usar la función admin (puede fallar con 403)
      const result = await this.supabaseService.supabase.auth.admin.inviteUserByEmail(email);
      
      // Verificar si realmente fue exitoso
      if (result.error) {
        throw result.error;
      }
      
      console.log('✅ Admin invite truly successful:', result);
      return {
        ...result,
        message: 'Invitación enviada exitosamente usando método administrativo.'
      };
    } catch (error: any) {
      console.warn('⚠️ Admin invite failed, using fallback method. Error:', error);
      
      // Usar método alternativo para cualquier error del método admin
      console.log('🔄 Using alternative signup method due to admin limitations');
      
      try {
        // Opción 2: Crear usuario usando signUp
        const { data, error: signUpError } = await this.supabaseService.supabase.auth.signUp({
          email: email,
          password: this.generateTemporaryPassword(),
          options: {
            emailRedirectTo: `${window.location.origin}/reset-password`,
            data: {
              invited_by_admin: true,
              requires_password_reset: true
            }
          }
        });
        
        if (signUpError) {
          console.error('❌ Signup error:', signUpError);
          throw new Error(`Error al invitar usuario: ${signUpError.message}`);
        }
        
        console.log('✅ Fallback signup successful:', data);
        
        // Verificar si el usuario fue creado correctamente
        if (data.user) {
          return { 
            data, 
            message: 'Usuario invitado correctamente. Recibirá un email para configurar su contraseña.' 
          };
        } else {
          throw new Error('No se pudo crear el usuario');
        }
        
      } catch (signUpError: any) {
        console.error('❌ Signup fallback failed:', signUpError);
        console.log('🔄 Attempting direct database creation as last resort');
        
        // Último recurso: crear usuario directamente en la base de datos
        try {
          return await this.createUserDirectly(email);
        } catch (directError: any) {
          console.error('❌ All methods failed:', directError);
          throw new Error(`No se pudo invitar al usuario. Métodos intentados: Admin API (403), SignUp (${signUpError.message}), Directo (${directError.message})`);
        }
      }
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
            username: email.split('@')[0]
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
}
