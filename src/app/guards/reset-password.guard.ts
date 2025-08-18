import { Injectable, inject } from '@angular/core';
import { CanActivate, Router, UrlTree } from '@angular/router';
import { SupabaseService } from '../services/supabase.service';
import { Observable, of } from 'rxjs';
import { map, take } from 'rxjs/operators';

@Injectable({ providedIn: 'root' })
export class ResetPasswordGuard implements CanActivate {
  private supabase = inject(SupabaseService);
  private router = inject(Router);

  canActivate(): Observable<boolean | UrlTree> {
    try {
      const href = typeof window !== 'undefined' ? window.location.href : '';
      const qIndex = href.indexOf('?');
      const query = qIndex >= 0 ? href.substring(qIndex + 1) : '';
      const params = new URLSearchParams(query);
      const hash = typeof window !== 'undefined' ? (window.location.hash || '') : '';
      const hParams = hash && hash.startsWith('#') ? new URLSearchParams(hash.substring(1)) : new URLSearchParams();
      const hasAuthParams = !!(
        params.get('type') || params.get('token') || params.get('code') || params.get('access_token') || params.get('error') ||
        hParams.get('type') || hParams.get('token') || hParams.get('code') || hParams.get('access_token') || hParams.get('error')
      );
      if (hasAuthParams) return of(true);
    } catch {}

    // No tokens in URL; allow only if already authenticated
    return this.supabase.getCurrentUser().pipe(
      take(1),
      map(user => user ? true : this.router.parseUrl('/login'))
    );
  }
}
