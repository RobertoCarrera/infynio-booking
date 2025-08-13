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
          return true;
        }
        console.log('AuthGuard: No user, redirecting to /login');
        this.router.navigate(['/login']);
        return false;
      })
    );
  }
}