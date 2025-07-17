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
    console.log('🔄 Inviting user:', email);
    
    try {
      // Invitar usuario usando el método admin de Supabase
      const { data, error } = await this.supabaseService.supabase.auth.admin.inviteUserByEmail(email, {
        redirectTo: `${window.location.origin}/login`
      });
      
      if (error) {
        throw error;
      }
      
      console.log('✅ User invited successfully:', data);
      return {
        data,
        message: `Invitación enviada exitosamente a ${email}. El usuario recibirá un email para activar su cuenta.`
      };
    } catch (error: any) {
      console.error('❌ Error inviting user:', error);
      throw new Error(`Error al enviar invitación: ${error.message}`);
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
}
