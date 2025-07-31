// ...existing code...
// ...existing code...
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { SupabaseService } from './supabase.service';

export interface ClassSession {
  id?: number;
  class_type_id: number;
  capacity: number;
  schedule_date: string;
  schedule_time: string;
}

@Injectable({
  providedIn: 'root'
})
export class ClassSessionsService {
  constructor(private supabase: SupabaseService) { }

  // Obtener sesiones filtradas por usuario (RPC Supabase)
  getFilteredSessions(userId: string): Observable<ClassSession[]> {
    return new Observable<ClassSession[]>(observer => {
      this.supabase.supabase.rpc('get_filtered_sessions', { user_id: userId })
        .then(({ data, error }: { data: any; error: any }) => {
          if (error) {
            observer.error(error);
          } else {
            observer.next(data as ClassSession[]);
          }
          observer.complete();
        });
    });
  }
}
