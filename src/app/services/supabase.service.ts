import { Injectable } from '@angular/core';
import { SupabaseClient, createClient } from '@supabase/supabase-js';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class SupabaseService {
  private clientInstance: SupabaseClient;

  constructor() {
    this.clientInstance = createClient(
      environment.supabaseUrl,
      environment.supabaseKey
    );
    console.log('SupabaseService: Cliente inicializado');
  }

  get client(): SupabaseClient {
    return this.clientInstance;
  }
}