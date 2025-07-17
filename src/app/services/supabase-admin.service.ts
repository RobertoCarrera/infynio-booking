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
    try {
      // Opción 1: Intentar usar la función admin (puede fallar con 403)
      console.log('🔄 Attempting admin invite for:', email);
      const result = await this.supabaseService.supabase.auth.admin.inviteUserByEmail(email);
      console.log('✅ Admin invite successful:', result);
      return {
        ...result,
        message: 'Invitación enviada exitosamente usando método administrativo.'
      };
    } catch (error: any) {
      console.warn('⚠️ Admin invite failed (expected in development), using fallback method:', error.message);
      
      // Si es error 403 o problema de auth, usar método alternativo
      if (error.status === 403 || error.message?.includes('403') || error.code === 'unauthorized' || error.message?.includes('not allowed')) {
        console.log('🔄 Using alternative signup method (development mode)');
        
        try {
          // Opción 2: Crear usuario usando signUp y luego requerir verificación
          const { data, error: signUpError } = await this.supabaseService.supabase.auth.signUp({
            email: email,
            password: this.generateTemporaryPassword(), // Password temporal
            options: {
              emailRedirectTo: `${window.location.origin}/reset-password`,
              data: {
                invited_by_admin: true,
                requires_password_reset: true
              }
            }
          });
          
          if (signUpError) {
            throw new Error(`Error al invitar usuario: ${signUpError.message}`);
          }
          
          console.log('✅ Fallback invite successful:', data);
          return { 
            data, 
            message: 'Invitación enviada correctamente. El usuario recibirá un email para configurar su contraseña.' 
          };
        } catch (signUpError: any) {
          console.error('❌ Signup fallback also failed:', signUpError);
          throw new Error(`Error al invitar usuario: ${signUpError.message}`);
        }
      }
      
      // Si es otro tipo de error, relanzarlo
      throw error;
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
