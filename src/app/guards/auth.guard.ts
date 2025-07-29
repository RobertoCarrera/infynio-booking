import { Injectable } from '@angular/core';
import { CanActivate, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { SupabaseService } from '../services/supabase.service';
import { Observable, of } from 'rxjs';
import { map, switchMap, take } from 'rxjs/operators';

@Injectable({ providedIn: 'root' })
export class AuthGuard implements CanActivate {
  constructor(
    private authService: AuthService, 
    private supabaseService: SupabaseService,
    private router: Router
  ) {}

  canActivate(): Observable<boolean> {
    return this.authService.currentUser$.pipe(
      take(1), // Solo tomar el primer valor para evitar múltiples ejecuciones
      switchMap(user => {
        if (user) {
          console.log('AuthGuard: User authenticated');
          return of(true);
        } else {
          console.log('AuthGuard: No user, checking for contextual redirect');
          
          // Si no hay usuario, redirigir según la ruta que intentaba acceder
          const currentUrl = this.router.url;
          if (currentUrl.startsWith('/admin')) {
            console.log('AuthGuard: Attempted admin access, redirecting to login');
          } else {
            console.log('AuthGuard: Attempted user access, redirecting to login');
          }
          
          this.router.navigate(['/login']);
          return of(false);
        }
      })
    );
  }
}