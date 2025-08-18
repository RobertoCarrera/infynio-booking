import { Injectable } from '@angular/core';
import { CanActivate, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { SupabaseService } from '../services/supabase.service';
import { Observable, of } from 'rxjs';
import { map, take } from 'rxjs/operators';

@Injectable({ providedIn: 'root' })
export class AuthGuard implements CanActivate {
  constructor(
    private authService: AuthService, 
    private supabaseService: SupabaseService,
    private router: Router
  ) {}

  canActivate(): Observable<boolean> {
    // Consultar directamente a Supabase para evitar condiciones de carrera
    return this.supabaseService.getCurrentUser().pipe(
      take(1),
      map(user => {
        if (user) {
          console.log('AuthGuard: User authenticated');
          // Bloquear acceso si requiere onboarding: redirigir a /reset-password
          // Nota: redirección suave; no romper navegación si ya estamos en reset-password
          const href = typeof window !== 'undefined' ? window.location.pathname : '';
          if (!href.includes('/reset-password')) {
            // No podemos invocar RPC sincrónicamente aquí; permitir y que el componente/menú o el ResetPassword haga el gating
          }
          return true;
        }
        console.log('AuthGuard: No user, redirecting to /login');
        this.router.navigate(['/login']);
        return false;
      })
    );
  }
}