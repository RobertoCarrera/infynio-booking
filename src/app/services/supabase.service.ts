import { Injectable } from '@angular/core';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class SupabaseService {
  public supabase: SupabaseClient;

  constructor() {
    this.supabase = createClient(environment.supabaseUrl, environment.supabaseKey, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
        // Reducir problemas de lock en desarrollo
        storageKey: 'sb-auth-token',
        storage: window.localStorage,
        flowType: 'pkce'
      },
      // Configuración para desarrollo
      global: {
        headers: {
          'X-Client-Info': 'mars-studio-angular'
        }
      }
    });

    // Log para debugging en desarrollo
    if (!environment.production) {
      console.log('🔧 Supabase client initialized for development');
    }
  }
}