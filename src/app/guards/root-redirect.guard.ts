import { Injectable } from '@angular/core';
import { CanActivate, Router, UrlTree } from '@angular/router';
import { SupabaseService } from '../services/supabase.service';
import { Observable, of } from 'rxjs';
import { switchMap, take, map } from 'rxjs/operators';

@Injectable({ providedIn: 'root' })
export class RootRedirectGuard implements CanActivate {
  constructor(private supabase: SupabaseService, private router: Router) {}

  canActivate(): Observable<boolean | UrlTree> {
    // If Supabase redirected to the site root with auth params, forward them to /reset-password
    const url = this.router.url || '/';
    try {
      const qIndex = url.indexOf('?');
      const query = qIndex >= 0 ? url.substring(qIndex + 1) : '';
      const params = new URLSearchParams(query);
      const hasAuthParams = !!(
        params.get('type') || params.get('token') || params.get('code') || params.get('access_token')
      );
        if (hasAuthParams) {
          const qp = Object.fromEntries(params.entries());
          const tree = this.router.createUrlTree(['/reset-password'], { queryParams: qp });
          return of(tree);
      }
      // Also check hash params (#access_token=...)
      if (typeof window !== 'undefined') {
        const hash = window.location.hash || '';
        if (hash && hash.startsWith('#')) {
          const hParams = new URLSearchParams(hash.substring(1));
          const hasHashAuth = !!(
            hParams.get('type') || hParams.get('token') || hParams.get('code') || hParams.get('access_token')
          );
            if (hasHashAuth) {
              const qp: any = {};
              hParams.forEach((v, k) => (qp[k] = v));
              const tree = this.router.createUrlTree(['/reset-password'], { queryParams: qp });
              return of(tree);
          }
        }
      }
    } catch {}

    return this.supabase.getCurrentUser().pipe(
      take(1),
      switchMap(user => {
        if (!user) {
          // Not logged in, send to login
          return of(this.router.parseUrl('/login'));
        }
        return this.supabase.getCurrentUserRole().pipe(
          take(1),
          map(role => this.router.parseUrl(role === 'admin' ? '/admin' : '/calendario'))
        );
      })
    );
  }
}
