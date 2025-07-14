import { Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { BehaviorSubject, Observable, from, throwError } from 'rxjs';
import { catchError, map, tap } from 'rxjs/operators';
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
      this.currentUserSubject.next(null);
    }
  }

  // Método de login simplificado
  login(email: string, password: string): Observable<any> {
    return from(this.supabaseService.supabase.auth.signInWithPassword({ email, password }))
      .pipe(
        tap(response => {
          if (response.error) {
            throw response.error;
          }
          
          if (response.data?.user) {
            this.currentUserSubject.next(response.data.user);
            this.router.navigate(['/calendario']);
          }
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
  const actualRedirectUrl = redirectUrl || `${window.location.origin}/assets/auth-redirect.html`;
  
  return from(this.supabaseService.supabase.auth.resetPasswordForEmail(email, { redirectTo: actualRedirectUrl }))
    .pipe(
      tap(response => {
      }),
      catchError(error => {
        return throwError(() => error);
      })
    );
}

  updatePassword(newPassword: string): Observable<any> {
    return from(this.supabaseService.supabase.auth.updateUser({ password: newPassword }))
      .pipe(
        tap(response => {
        }),
        catchError(error => {
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
  return from(this.supabaseService.supabase.auth.verifyOtp({ 
    token_hash: token,
    type: 'recovery'
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
}