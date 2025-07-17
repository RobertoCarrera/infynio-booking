import { Injectable } from '@angular/core';
import { CanActivate, Router } from '@angular/router';
import { SupabaseAdminService } from '../services/supabase-admin.service';
import { Observable, of } from 'rxjs';
import { switchMap, map } from 'rxjs/operators';

@Injectable({ providedIn: 'root' })
export class AdminGuard implements CanActivate {
  constructor(private supabase: SupabaseAdminService, private router: Router) {}

  canActivate(): Observable<boolean> {
    return this.supabase.getCurrentUser().pipe(
      switchMap(user => {
        if (!user) {
          console.log('AdminGuard: No user, redirecting to /login');
          this.router.navigate(['/login']);
          return of(false);
        }
        return this.supabase.getCurrentUserRole().pipe(
          map(role => {
            console.log('AdminGuard: user', user, 'role', role);
            if (role === 'admin') {
              return true;
            } else {
              this.router.navigate(['/']);
              return false;
            }
          })
        );
      })
    );
  }
}
