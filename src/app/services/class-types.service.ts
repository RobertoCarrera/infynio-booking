import { Injectable } from '@angular/core';
import { Observable, from } from 'rxjs';
import { map } from 'rxjs/operators';
import { SupabaseClient, createClient } from '@supabase/supabase-js';
import { environment } from '../../environments/environment';

export interface ClassType {
  id: string;
  name: string;
  description?: string;
  duration_minutes?: number;
}

@Injectable({ providedIn: 'root' })
export class ClassTypesService {
  private supabase: SupabaseClient;

  constructor() {
    this.supabase = createClient(environment.supabaseUrl, environment.supabaseKey);
  }

  getAll(): Observable<ClassType[]> {
    return from(
      this.supabase
        .from('class_types')
        .select('*')
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return (data || []) as ClassType[];
      })
    );
  }
}
