import { Injectable } from '@angular/core';
import { CanActivate, Router, UrlTree } from '@angular/router';
import { SupabaseService } from '../services/supabase.service';
import { Observable, of } from 'rxjs';
import { switchMap, take, map } from 'rxjs/operators';

@Injectable({ providedIn: 'root' })
export class NoAuthGuard implements CanActivate {
  constructor(private supabase: SupabaseService, private router: Router) {}

  canActivate(): Observable<boolean | UrlTree> {
    return this.supabase.getCurrentUser().pipe(
      take(1),
      switchMap(user => {
        if (!user) {
          // Not logged in, allow access to /login
          return of(true);
        }
        // Logged in: route based on role
        return this.supabase.getCurrentUserRole().pipe(
          take(1),
          map(role => this.router.parseUrl(role === 'admin' ? '/admin' : '/calendario'))
        );
      })
    );
  }
}
