import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { createClient } from '@supabase/supabase-js';
import { environment } from '../../environments/environment';

export const authGuard: CanActivateFn = async (route, state) => {
  const supabase = createClient(environment.supabaseUrl, environment.supabaseKey);
  const router = inject(Router);
  const { data } = await supabase.auth.getSession();
  if (data.session && data.session.user) {
    return true;
  } else {
    return router.parseUrl('/login');
  }
};
