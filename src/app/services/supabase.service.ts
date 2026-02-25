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
        // Avoid Navigator lock contention in dev by bypassing cross-tab locking or using non-exclusive locks
        debug: false,
        storageKey: 'sb-auth-token',
        storage: window.localStorage,
        flowType: 'pkce',
        // Fix for "NavigatorLockAcquireTimeoutError"
        // Force the client to use a basic memory lock or disable the lock to prevent timeouts in development/some browsers
        // LockFunc signature: (name: string, acquireTimeout: number, fn: () => Promise<R>) => Promise<R>
        lock: (name: string, acquireTimeout: number, fn: () => Promise<any>) => { 
          return fn();
        }
      },
      // Configuración para desarrollo
      global: {
        headers: {
          'X-Client-Info': 'mars-studio-angular'
        },
        // Silence internal debug
        fetch: undefined
      }
    });
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
          return of(null);
        }
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
            const roleId = result.data?.role_id;
            if (roleId === 1) {
              return 'admin';
            } else {
              return 'user';
            }
          })
        );
      })
    );
  }

  async inviteUserByEmail(email: string): Promise<any> {
    try {
      const { data: { session } } = await this.supabase.auth.getSession();
      if (!session) {
        throw new Error('No hay sesión activa');
      }
      // Build redirectTo with onboarding flag so the app shows first-time form
  const origin = window.location.origin;
  const redirect = new URL('/auth-redirect.html', origin);
  // Señal de onboarding
  redirect.searchParams.set('type', 'invite');
      const { data, error } = await this.supabase.functions.invoke('invite-user', {
        body: { email, redirectTo: redirect.toString() },
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
        message: data.message || `Invitación enviada exitosamente a ${email}.`,
        status: data.status,
        recovery_link: data.recovery_link || undefined,
        note: data.note || undefined,
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

  async resendRecovery(email: string): Promise<{ message: string; recovery_link?: string }> {
    const origin = window.location.origin;
    const redirect = new URL('/auth-redirect.html', origin);
    redirect.searchParams.set('type', 'invite');
    try {
      // Prefer sending the email directly using Auth API (this actually sends the email)
      const { error } = await this.supabase.auth.resetPasswordForEmail(email, {
        redirectTo: redirect.toString(),
      });
      if (error) throw error;
      return { message: `Email de recuperación reenviado a ${email}` };
    } catch (primaryErr: any) {
      // Fallback: generate a link via Edge Function so the admin can copy it manually
      const { data: { session } } = await this.supabase.auth.getSession();
      if (!session) throw new Error(primaryErr?.message || 'No hay sesión activa');
      const { data, error } = await this.supabase.functions.invoke('invite-user', {
        body: { action: 'resend', email, redirectTo: redirect.toString() },
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (error) {
        const msg = this.extractFunctionsError(error);
        throw new Error(msg);
      }
      if (data?.error) throw new Error(data.error);
      return { message: data?.message || 'Enlace generado', recovery_link: data?.recovery_link };
    }
  }

  async resendInvite(email: string, kind: 'pending' | 'onboarding'): Promise<{ status: string; message: string; recovery_link?: string }> {
    const origin = window.location.origin;
    const redirect = new URL('/auth-redirect.html', origin);
    // Edge function will set the correct type based on kind
    const { data: { session } } = await this.supabase.auth.getSession();
    if (!session) throw new Error('No hay sesión activa');
    const { data, error } = await this.supabase.functions.invoke('invite-user', {
      body: { action: 'resend', email, kind, redirectTo: redirect.toString() },
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    if (error || data?.error) {
      const msg = this.extractFunctionsError(error || { message: data?.error });
      throw new Error(msg);
    }
    return { status: data?.status || 'ok', message: data?.message || 'Enviado', recovery_link: data?.recovery_link };
  }

  // Users who confirmed but haven't completed onboarding (missing required fields)
  async listUsersNeedingOnboarding(): Promise<Array<{ id: number; email: string; auth_user_id: string }>> {
    const { data, error } = await this.supabase
      .from('users')
      .select('id, email, auth_user_id, name, surname, telephone')
      .not('auth_user_id', 'is', null);
    if (error) throw error;
    const needs = (data || []).filter((u: any) => !u.name?.trim() || !u.surname?.trim() || !u.telephone?.trim())
      .map((u: any) => ({ id: u.id, email: u.email, auth_user_id: u.auth_user_id }));
    return needs;
  }

  async cancelInvitation(email: string, authUserId?: string): Promise<{ message: string }> {
    const { data: { session } } = await this.supabase.auth.getSession();
    if (!session) throw new Error('No hay sesión activa');
    const { data, error } = await this.supabase.functions.invoke('invite-user', {
      body: { action: 'cancel', email, auth_user_id: authUserId },
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    if (error) {
      const msg = this.extractFunctionsError(error);
      throw new Error(msg);
    }
    if (data?.error) throw new Error(data.error);
    return { message: data?.message || 'Invitación cancelada' };
  }

  async listPendingInvites(): Promise<Array<{ id: string; email: string; created_at?: string }>> {
    const { data: { session } } = await this.supabase.auth.getSession();
    if (!session) throw new Error('No hay sesión activa');
    const { data, error } = await this.supabase.functions.invoke('invite-user', {
      body: { action: 'list_pending' },
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    if (error) {
      const msg = this.extractFunctionsError(error);
      throw new Error(msg);
    }
    if (data?.error) throw new Error(data.error);
    return (data?.pending || []) as Array<{ id: string; email: string; created_at?: string }>;
  }

  // --- Invite re-request flow ---
  async requestNewInvite(email: string): Promise<{ status: string; message: string }> {
    const { data, error } = await this.supabase.functions.invoke('invite-request', {
      body: { action: 'request', email },
    });
    if (error || data?.error) {
      const msg = this.extractFunctionsError(error || { message: data?.error });
      throw new Error(msg || 'No se pudo registrar la solicitud');
    }
    return { status: data?.status || 'ok', message: data?.message || 'Solicitud registrada' };
  }

  async listInviteRequests(): Promise<Array<{ email: string; last_requested_at: string; request_count: number }>> {
    const { data: { session } } = await this.supabase.auth.getSession();
    if (!session) throw new Error('No hay sesión activa');
    const { data, error } = await this.supabase.functions.invoke('invite-request', {
      body: { action: 'list' },
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    if (error || data?.error) {
      const msg = this.extractFunctionsError(error || { message: data?.error });
      throw new Error(msg || 'No se pudo obtener solicitudes');
    }
    return (data?.requests || []) as Array<{ email: string; last_requested_at: string; request_count: number }>;
  }

  async clearInviteRequest(email: string): Promise<void> {
    const { data: { session } } = await this.supabase.auth.getSession();
    if (!session) throw new Error('No hay sesión activa');
    const { data, error } = await this.supabase.functions.invoke('invite-request', {
      body: { action: 'clear', email },
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    if (error || data?.error) {
      const msg = this.extractFunctionsError(error || { message: data?.error });
      throw new Error(msg || 'No se pudo limpiar la solicitud');
    }
  }

  private extractFunctionsError(error: any): string {
    try {
      const raw = error?.context?.body;
      if (raw) {
        const parsed = JSON.parse(raw);
        return parsed?.error || parsed?.message || error.message || 'Error en función';
      }
    } catch {}
    return error?.message || 'Error en función';
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
  // Obtener TODOS los usuarios (incluye activos e inactivos)
  return await this.supabase.from('users').select('*');
  }

  /**
   * Obtiene usuarios paginados.
   * - roleId: filtra por rol (por defecto 2 = usuario normal)
   * - offset/limit: ventana de resultados
   * - deactivatedOnly: si true, solo inactivos
   */
  async getUsersPaged(params: { roleId?: number; offset: number; limit: number; deactivatedOnly?: boolean }): Promise<{ data: any[]; error: any }> {
    const { roleId = 2, offset, limit, deactivatedOnly = false } = params;
    const { data, error } = await this.supabase.rpc('admin_get_users_paged', {
      p_role_id: roleId,
      p_deactivated_only: deactivatedOnly,
      p_offset: offset,
      p_limit: limit,
    });
    return { data: data || [], error };
  }

  async getValidUsers(): Promise<any> {
    // Solo obtener usuarios que tengan auth_user_id (usuarios válidos)
    return await this.supabase
      .from('users')
      .select('*')
      .not('auth_user_id', 'is', null);
  }

  async getOrphanedUsers(): Promise<any> {
    // Solo obtener usuarios huérfanos (sin auth_user_id)
    return await this.supabase
      .from('users')
      .select('*')
      .is('auth_user_id', null);
  }

  /**
   * Función para limpiar TODOS los usuarios huérfanos de una vez
   */
  async cleanAllOrphanedUsers(): Promise<any> {
    try {
      console.log('🧹 Starting mass cleanup of orphaned users...');
      
      // Obtener todos los usuarios huérfanos
      const { data: orphanedUsers, error: fetchError } = await this.getOrphanedUsers();
      
      if (fetchError) {
        throw fetchError;
      }

      if (!orphanedUsers || orphanedUsers.length === 0) {
        return {
          success: true,
          message: 'No hay usuarios huérfanos para limpiar.',
          deletedCount: 0
        };
      }

      console.log(`🗑️ Found ${orphanedUsers.length} orphaned users to delete`);
      
      const deletedUsers = [];
      const errors = [];

      // Eliminar cada usuario huérfano
      for (const user of orphanedUsers) {
        try {
          console.log(`🗑️ Deleting orphaned user: ${user.email || `ID: ${user.id}`}`);
          
          // Eliminar user_packages primero
          await this.supabase
            .from('user_packages')
            .delete()
            .eq('user_id', user.id);
          
          // Eliminar el usuario
          const { error: deleteError } = await this.supabase
            .from('users')
            .delete()
            .eq('id', user.id);
          
          if (deleteError) {
            errors.push(`Error deleting user ${user.email || user.id}: ${deleteError.message}`);
          } else {
            deletedUsers.push(user.email || `ID: ${user.id}`);
          }
        } catch (error: any) {
          errors.push(`Error deleting user ${user.email || user.id}: ${error.message}`);
        }
      }

      let message = `Limpieza completada. ${deletedUsers.length} usuarios huérfanos eliminados.`;
      if (errors.length > 0) {
        message += ` ${errors.length} errores encontrados.`;
        console.warn('⚠️ Errors during cleanup:', errors);
      }

      return {
        success: true,
        message,
        deletedCount: deletedUsers.length,
        deletedUsers,
        errors: errors.length > 0 ? errors : undefined
      };
    } catch (error: any) {
      console.error('❌ Error in cleanAllOrphanedUsers:', error);
      throw new Error(`Error en limpieza masiva: ${error.message}`);
    }
  }

  async deleteUser(userId: number): Promise<any> {
  // Deprecated: physical deletion disabled in favor of deactivation
  throw new Error('Eliminar usuarios está deshabilitado. Usa desactivar/activar con motivo.');
  }

  /**
   * Función para limpiar usuarios huérfanos (solo en public.users, sin auth_user_id)
   */
  async deleteOrphanedUser(userId: number): Promise<any> {
    try {
      console.log('🧹 Cleaning orphaned user with ID:', userId);
      
      // Obtener información del usuario
      const { data: userData, error: fetchError } = await this.supabase
        .from('users')
        .select('auth_user_id, email, name, surname')
        .eq('id', userId)
        .single();
        
      if (fetchError) {
        throw fetchError;
      }

      // Verificar que sea realmente un usuario huérfano
      if (userData.auth_user_id) {
        throw new Error('Este usuario tiene cuenta de autenticación. Usa deleteUser() en su lugar.');
      }

      // PASO 1: Eliminar TODOS los user_packages del usuario primero
      console.log('🗑️ Deleting user packages for orphaned user:', userId);
      const { error: packagesError } = await this.supabase
        .from('user_packages')
        .delete()
        .eq('user_id', userId);
      
      if (packagesError) {
        console.warn('⚠️ Error deleting user packages:', packagesError);
      } else {
        console.log('✅ User packages deleted successfully');
      }

      // PASO 2: Eliminar el usuario huérfano de public.users
      console.log('🗑️ Deleting orphaned user from public.users table');
      const { error: deleteError } = await this.supabase
        .from('users')
        .delete()
        .eq('id', userId);

      if (deleteError) {
        throw deleteError;
      }

      return {
        success: true,
        message: `Usuario huérfano ${userData.email || 'Usuario'} eliminado completamente (incluyendo paquetes).`
      };
    } catch (error: any) {
      console.error('❌ Error in deleteOrphanedUser:', error);
      throw new Error(`Error al eliminar usuario huérfano: ${error.message}`);
    }
  }

  // New: deactivation/reactivation flows
  async deactivateUser(userId: number, reason: string): Promise<{ success: boolean; message: string }> {
    const trimmed = (reason || '').trim();
    if (!trimmed) {
      throw new Error('Debes indicar un motivo para desactivar.');
    }
    const { data, error } = await this.supabase.rpc('admin_deactivate_user', {
      p_user_id: userId,
      p_reason: trimmed,
    });
    if (error || data?.success === false) {
      const msg = error?.message || data?.message || 'No se pudo desactivar al usuario';
      throw new Error(msg);
    }
    return { success: true, message: data?.message || 'Usuario desactivado' };
  }

  async reactivateUser(userId: number, reason: string): Promise<{ success: boolean; message: string }> {
    const trimmed = (reason || '').trim();
    if (!trimmed) {
      throw new Error('Debes indicar un motivo para reactivar.');
    }
    const { data, error } = await this.supabase.rpc('admin_reactivate_user', {
      p_user_id: userId,
      p_reason: trimmed,
    });
    if (error || data?.success === false) {
      const msg = error?.message || data?.message || 'No se pudo reactivar al usuario';
      throw new Error(msg);
    }
    return { success: true, message: data?.message || 'Usuario reactivado' };
  }

  async getDeactivatedUsers(): Promise<any> {
    return await this.supabase
      .from('users')
      .select('*')
      .eq('is_active', false)
      .order('deactivated_at', { ascending: false });
  }

  /**
   * Obtiene las sesiones de clase con información de class_types para el calendario
   */
  async getClassSessionsWithTypes(): Promise<any[]> {
    const response = await this.supabase.functions.invoke('get-class-sessions');
    if (response.error) throw response.error;
    return response.data ?? [];
  }

  /**
   * Método de utilidad para acceso directo desde consola
   */
  static exposeToWindow(service: SupabaseService) {
    (window as any).supabaseService = service;
  }
}