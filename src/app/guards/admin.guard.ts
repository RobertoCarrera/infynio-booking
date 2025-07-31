import { Injectable } from '@angular/core';
import { CanActivate, Router } from '@angular/router';
import { SupabaseService } from '../services/supabase.service';
import { Observable, of } from 'rxjs';
import { switchMap, map, catchError, take } from 'rxjs/operators';

@Injectable({ providedIn: 'root' })
export class AdminGuard implements CanActivate {
  constructor(private supabase: SupabaseService, private router: Router) {}

  canActivate(): Observable<boolean> {
    return this.supabase.getCurrentUser().pipe(
      take(1), // Solo tomar el primer valor
      switchMap(user => {
        if (!user) {
          console.log('AdminGuard: No user, redirecting to /login');
          this.router.navigate(['/login']);
          return of(false);
        }
        return this.supabase.getCurrentUserRole().pipe(
          take(1), // Solo tomar el primer valor del rol
          map(role => {
            console.log('AdminGuard: user', user.id, 'role', role);
            if (role === 'admin') {
              console.log('AdminGuard: Access granted - user is admin');
              return true;
            } else {
              console.log('AdminGuard: Access denied - user role is:', role, 'redirecting to calendario');
              this.router.navigate(['/calendario']);
              return false;
            }
          }),
          catchError(error => {
            console.error('AdminGuard: Error checking user role:', error);
            console.log('AdminGuard: Error occurred, redirecting to calendario');
            this.router.navigate(['/calendario']);
            return of(false);
          })
        );
      })
    );
  }
}
