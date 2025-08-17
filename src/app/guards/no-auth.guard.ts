import { Injectable } from '@angular/core';
import { CanActivate, Router, UrlTree } from '@angular/router';
import { SupabaseService } from '../services/supabase.service';
import { Observable, of } from 'rxjs';
import { switchMap, take, map } from 'rxjs/operators';

@Injectable({ providedIn: 'root' })
export class NoAuthGuard implements CanActivate {
  constructor(private supabase: SupabaseService, private router: Router) {}

  canActivate(): Observable<boolean | UrlTree> {
    // If tokens/params from Supabase are present, forward to /reset-password instead of showing login
    try {
      const url = typeof window !== 'undefined' ? window.location.href : '';
      const qIndex = url.indexOf('?');
      const query = qIndex >= 0 ? url.substring(qIndex + 1) : '';
      const params = new URLSearchParams(query);
      const hash = typeof window !== 'undefined' ? (window.location.hash || '') : '';
      const hParams = hash && hash.startsWith('#') ? new URLSearchParams(hash.substring(1)) : new URLSearchParams();
      const hasAuthParams = !!(
        params.get('type') || params.get('token') || params.get('code') || params.get('access_token') ||
        hParams.get('type') || hParams.get('token') || hParams.get('code') || hParams.get('access_token')
      );
      if (hasAuthParams) {
        // Prefer hash params first (Supabase often puts access_token here)
        const qp: any = {};
        hParams.forEach((v, k) => (qp[k] = v));
        params.forEach((v, k) => { if (!(k in qp)) qp[k] = v; });
        const tree = this.router.createUrlTree(['/reset-password'], { queryParams: qp });
        return of(tree);
      }
    } catch {}

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
