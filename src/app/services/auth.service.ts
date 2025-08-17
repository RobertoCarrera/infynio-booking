import { Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { BehaviorSubject, Observable, from, throwError, of } from 'rxjs';
import { catchError, map, tap, switchMap } from 'rxjs/operators';
import { SupabaseService } from './supabase.service';
import { AuthSession } from '@supabase/supabase-js';

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
      const { data, error } = await this.supabaseService.supabase.auth.getSession();
      if (error) throw error;
      
      if (data.session) {
        this.currentUserSubject.next(data.session.user);
      } else {
        this.currentUserSubject.next(null);
      }
    } catch (error) {
      console.error('Error checking session:', error);
      this.currentUserSubject.next(null);
    }
  }

  // Método para refrescar el rol del usuario (útil después del login)
  refreshUserRole(): Observable<string | null> {
    return this.supabaseService.getCurrentUserRole();
  }

  // Método de login con redirección contextual
  login(email: string, password: string): Observable<any> {
    return from(this.supabaseService.supabase.auth.signInWithPassword({ email, password }))
      .pipe(
        switchMap(response => {
          if (response.error) {
            throw response.error;
          }
          
          if (response.data?.user) {
            this.currentUserSubject.next(response.data.user);
            
            // Obtener el rol del usuario y redirigir según corresponda
            return this.supabaseService.getCurrentUserRole().pipe(
              tap(role => {
                if (role === 'admin') {
                  this.router.navigate(['/admin']);
                } else {
                  this.router.navigate(['/calendario']);
                }
              }),
              map(() => response) // Devolver la respuesta original
            );
          }
          
          return of(response);
        }),
        catchError(error => {
          return throwError(() => error);
        })
      );
  }

  logout(): Observable<any> {
    return from(this.supabaseService.supabase.auth.signOut())
      .pipe(
        tap(() => {
          this.currentUserSubject.next(null);
          this.router.navigate(['/login']);
        }),
        catchError(error => {
          return throwError(() => error);
        })
      );
  }

resetPassword(email: string, redirectUrl?: string): Observable<any> {
  const actualRedirectUrl = redirectUrl || `${window.location.origin}/auth-redirect.html`;
  
  return from(this.supabaseService.supabase.auth.resetPasswordForEmail(email, { 
    redirectTo: actualRedirectUrl 
  }))
    .pipe(
      catchError(error => {
        console.error('Reset password error:', error);
        return throwError(() => error);
      })
    );
}

  updatePassword(newPassword: string): Observable<any> {
    return from(this.supabaseService.supabase.auth.updateUser({ password: newPassword }))
      .pipe(
        tap(response => {
          if (response.error) {
            throw response.error;
          }
        }),
        catchError(error => {
          console.error('Update password error:', error);
          return throwError(() => error);
        })
      );
  }

checkSessionStatus(): Observable<any> {
    return from(this.supabaseService.supabase.auth.getSession())
      .pipe(
        map((response: { data: { session: any } | null, error: any }) => {
          return response.data?.session || null;
        }),
        catchError(error => {
          return throwError(() => error);
        })
      );
  }

setSession(accessToken: string, refreshToken: string = ''): Observable<any> {
  return from(this.supabaseService.supabase.auth.setSession({ 
    access_token: accessToken, 
    refresh_token: refreshToken 
  }))
    .pipe(
      tap(response => {
        if (response.data?.session) {
          this.currentUserSubject.next(response.data.session.user);
        }
      }),
      catchError(error => {
        return throwError(() => error);
      })
    );
}

verifyRecoveryToken(token: string): Observable<any> {
  // Para versiones modernas de Supabase, el token debe ser procesado como un código de autorización
  // En lugar de usar verifyOtp que es para códigos de un solo uso
  return from(this.supabaseService.supabase.auth.exchangeCodeForSession(token))
    .pipe(
      tap(response => {
        if (response.data?.session) {
          this.currentUserSubject.next(response.data.session.user);
        }
        if (response.error) {
          throw response.error;
        }
      }),
      catchError(error => {
        console.error('Exchange code error:', error);
        // Si exchangeCodeForSession falla, intentar el método legacy
        return from(this.supabaseService.supabase.auth.verifyOtp({ 
          token_hash: token,
          type: 'recovery'
        }))
        .pipe(
          tap(legacyResponse => {
            if (legacyResponse.data?.session) {
              this.currentUserSubject.next(legacyResponse.data.session.user);
            }
            if (legacyResponse.error) {
              throw legacyResponse.error;
            }
          }),
          catchError(legacyError => {
            console.error('Legacy verify OTP error:', legacyError);
            return throwError(() => legacyError);
          })
        );
      })
    );
}
}