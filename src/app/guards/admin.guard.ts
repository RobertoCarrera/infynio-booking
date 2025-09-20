import { Injectable } from '@angular/core';
import { CanActivate, Router, UrlTree } from '@angular/router';
import { SupabaseService } from '../services/supabase.service';
import { Observable, of } from 'rxjs';
import { switchMap, map, catchError, take } from 'rxjs/operators';

@Injectable({ providedIn: 'root' })
export class AdminGuard implements CanActivate {
  constructor(private supabase: SupabaseService, private router: Router) {}
  canActivate(): Observable<boolean | UrlTree> {
    // Use UrlTree for redirects — prevents flicker and is the recommended pattern
    return this.supabase.getCurrentUser().pipe(
      take(1), // only need first value
      switchMap(user => {
        if (!user) {
          return of(this.router.createUrlTree(['/login']));
        }
        return this.supabase.getCurrentUserRole().pipe(
          take(1),
          map(role => {
            // Accept numeric or string role identifiers
            const roleStr = (role === null || role === undefined) ? '' : String(role).toLowerCase();
            const isAdmin = roleStr === 'admin' || roleStr === '1' || roleStr === 'role_admin' || roleStr === 'rol_admin';
            if (isAdmin) {
              return true;
            }
            // redirect normal users to calendario
            return this.router.createUrlTree(['/calendario']);
          }),
          catchError(err => {
            return of(this.router.createUrlTree(['/calendario']));
          })
        );
      })
    );
  }
}
