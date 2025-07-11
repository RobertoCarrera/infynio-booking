import { Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { BehaviorSubject, Observable, from, throwError } from 'rxjs';
import { catchError, map, tap } from 'rxjs/operators'; // Añadir 'map' aquí
import { SupabaseService } from './supabase.service';
import { AuthSession } from '@supabase/supabase-js'; // Importar para tipos

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private currentUserSubject = new BehaviorSubject<any>(null);
  public currentUser$ = this.currentUserSubject.asObservable();
  
  constructor(
    private router: Router,
    private supabaseService: SupabaseService
  ) {
    this.checkCurrentSession();
  }

  // Verifica si hay una sesión activa
  async checkCurrentSession() {
    try {
      const { data, error } = await this.supabaseService.client.auth.getSession();
      if (error) throw error;
      
      if (data.session) {
        this.currentUserSubject.next(data.session.user);
        console.log('Sesión existente encontrada');
      } else {
        this.currentUserSubject.next(null);
        console.log('No hay sesión activa');
      }
    } catch (error) {
      console.error('Error al verificar sesión:', error);
      this.currentUserSubject.next(null);
    }
  }

  // Método de login simplificado
  login(email: string, password: string): Observable<any> {
    console.log('Intentando login con email:', email);
    
    return from(this.supabaseService.client.auth.signInWithPassword({ email, password }))
      .pipe(
        tap(response => {
          console.log('Respuesta de login:', response);
          
          if (response.error) {
            throw response.error;
          }
          
          if (response.data?.user) {
            this.currentUserSubject.next(response.data.user);
            this.router.navigate(['/calendario']);
            console.log('Login exitoso, redirigiendo...');
          }
        }),
        catchError(error => {
          console.error('Error en login:', error);
          return throwError(() => error);
        })
      );
  }

  logout(): Observable<any> {
    return from(this.supabaseService.client.auth.signOut())
      .pipe(
        tap(() => {
          this.currentUserSubject.next(null);
          this.router.navigate(['/login']);
          console.log('Logout exitoso');
        }),
        catchError(error => {
          console.error('Error en logout:', error);
          return throwError(() => error);
        })
      );
  }

resetPassword(email: string, redirectUrl?: string): Observable<any> {
  // Si no se proporciona una URL de redirección, usamos una por defecto
  const actualRedirectUrl = redirectUrl || `${window.location.origin}/assets/auth-redirect.html`;
  console.log(`Enviando solicitud de recuperación para: ${email}`);
  console.log(`URL de redirección: ${actualRedirectUrl}`);
  
  return from(this.supabaseService.client.auth.resetPasswordForEmail(email, { redirectTo: actualRedirectUrl }))
    .pipe(
      tap(response => {
        console.log('Respuesta de solicitud de recuperación:', response);
      }),
      catchError(error => {
        console.error('Error en resetPassword:', error);
        return throwError(() => error);
      })
    );
}

  updatePassword(newPassword: string): Observable<any> {
    return from(this.supabaseService.client.auth.updateUser({ password: newPassword }))
      .pipe(
        tap(response => {
          console.log('Contraseña actualizada', response);
        }),
        catchError(error => {
          console.error('Error al actualizar contraseña:', error);
          return throwError(() => error);
        })
      );
  }

checkSessionStatus(): Observable<any> {
    return from(this.supabaseService.client.auth.getSession())
      .pipe(
        map((response: { data: { session: any } | null, error: any }) => {
          console.log('Respuesta getSession:', response);
          return response.data?.session || null;
        }),
        catchError(error => {
          console.error('Error al verificar sesión:', error);
          return throwError(() => error);
        })
      );
  }

setSession(accessToken: string, refreshToken: string = ''): Observable<any> {
  console.log('Intentando establecer sesión con token');
  return from(this.supabaseService.client.auth.setSession({ 
    access_token: accessToken, 
    refresh_token: refreshToken 
  }))
    .pipe(
      tap(response => {
        console.log('Respuesta de setSession:', response);
        if (response.data?.session) {
          this.currentUserSubject.next(response.data.session.user);
        }
      }),
      catchError(error => {
        console.error('Error en setSession:', error);
        return throwError(() => error);
      })
    );
}

verifyRecoveryToken(token: string): Observable<any> {
  console.log('Verificando token de recuperación');
  return from(this.supabaseService.client.auth.verifyOtp({ 
    token_hash: token,
    type: 'recovery'
  }))
    .pipe(
      tap(response => {
        console.log('Respuesta de verificación:', response);
        if (response.data?.session) {
          this.currentUserSubject.next(response.data.session.user);
        }
      }),
      catchError(error => {
        console.error('Error en verificación de token:', error);
        return throwError(() => error);
      })
    );
}
}