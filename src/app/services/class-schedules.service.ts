import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { SupabaseService } from './supabase.service';

export interface ClassSession {
  id?: number;
  class_type_id: number;
  capacity: number;
  schedule_date: string; // formato YYYY-MM-DD
  schedule_time: string; // formato HH:mm:ss
  created_at?: string;
  updated_at?: string;
}

@Injectable({
  providedIn: 'root'
})
export class ClassSessionsService {

  constructor(private supabase: SupabaseService) { }

  // Obtener todas las sesiones
  getSessions(): Observable<ClassSession[]> {
    return new Observable(observer => {
      this.supabase.supabase
        .from('class_sessions')
        .select('*')
        .order('schedule_date')
        .order('schedule_time')
        .then(({ data, error }) => {
          if (error) {
            observer.error(error);
          } else {
            observer.next(data || []);
          }
          observer.complete();
        });
    });
  }

  // Obtener sesiones por tipo de clase
  getSessionsByClassType(classTypeId: number): Observable<ClassSession[]> {
    return new Observable(observer => {
      this.supabase.supabase
        .from('class_sessions')
        .select('*')
        .eq('class_type_id', classTypeId)
        .order('schedule_date')
        .order('schedule_time')
        .then(({ data, error }) => {
          if (error) {
            observer.error(error);
          } else {
            observer.next(data || []);
          }
          observer.complete();
        });
    });
  }

  // Obtener sesiones por fecha
  getSessionsByDate(date: string): Observable<ClassSession[]> {
    return new Observable(observer => {
      this.supabase.supabase
        .from('class_sessions')
        .select('*')
        .eq('schedule_date', date)
        .order('schedule_time')
        .then(({ data, error }) => {
          if (error) {
            observer.error(error);
          } else {
            observer.next(data || []);
          }
          observer.complete();
        });
    });
  }

  // Obtener sesiones en un rango de fechas
  getSessionsByDateRange(startDate: string, endDate: string): Observable<ClassSession[]> {
    return new Observable(observer => {
      this.supabase.supabase
        .from('class_sessions')
        .select('*')
        .gte('schedule_date', startDate)
        .lte('schedule_date', endDate)
        .order('schedule_date')
        .order('schedule_time')
        .then(({ data, error }) => {
          if (error) {
            observer.error(error);
          } else {
            observer.next(data || []);
          }
          observer.complete();
        });
    });
  }

  // Crear nueva sesión
  createSession(session: Omit<ClassSession, 'id' | 'created_at' | 'updated_at'>): Observable<ClassSession> {
    return new Observable(observer => {
      this.supabase.supabase
        .from('class_sessions')
        .insert([session])
        .select()
        .single()
        .then(({ data, error }) => {
          if (error) {
            observer.error(error);
          } else {
            observer.next(data);
          }
          observer.complete();
        });
    });
  }

  // Actualizar sesión
  updateSession(id: number, session: Partial<ClassSession>): Observable<ClassSession> {
    return new Observable(observer => {
      this.supabase.supabase
        .from('class_sessions')
        .update(session)
        .eq('id', id)
        .select()
        .single()
        .then(({ data, error }) => {
          if (error) {
            observer.error(error);
          } else {
            observer.next(data);
          }
          observer.complete();
        });
    });
  }

  // Eliminar sesión
  deleteSession(id: number): Observable<void> {
    return new Observable(observer => {
      this.supabase.supabase
        .from('class_sessions')
        .delete()
        .eq('id', id)
        .then(({ error }) => {
          if (error) {
            observer.error(error);
          } else {
            observer.next();
          }
          observer.complete();
        });
    });
  }

  // Verificar conflictos de sesiones (mismo tipo, fecha y hora)
  checkSessionConflicts(session: ClassSession): Observable<ClassSession[]> {
    return new Observable(observer => {
      this.supabase.supabase
        .from('class_sessions')
        .select('*')
        .eq('schedule_date', session.schedule_date)
        .eq('schedule_time', session.schedule_time)
        .neq('id', session.id || -1)
        .then(({ data, error }) => {
          if (error) {
            observer.error(error);
          } else {
            observer.next(data || []);
          }
          observer.complete();
        });
    });
  }

  // Crear múltiples sesiones (para generar horarios recurrentes)
  createMultipleSessions(sessions: Omit<ClassSession, 'id' | 'created_at' | 'updated_at'>[]): Observable<ClassSession[]> {
    return new Observable(observer => {
      this.supabase.supabase
        .from('class_sessions')
        .insert(sessions)
        .select()
        .then(({ data, error }) => {
          if (error) {
            observer.error(error);
          } else {
            observer.next(data || []);
          }
          observer.complete();
        });
    });
  }

  // Generar sesiones recurrentes para un período
  generateRecurringSessions(
    classTypeId: number,
    dayOfWeek: number, // 0-6 (Domingo a Sábado)
    time: string, // HH:mm:ss
    capacity: number,
    startDate: string, // YYYY-MM-DD
    endDate: string // YYYY-MM-DD
  ): Observable<ClassSession[]> {
    const sessions: Omit<ClassSession, 'id' | 'created_at' | 'updated_at'>[] = [];
    const start = new Date(startDate);
    const end = new Date(endDate);
    
    // Encontrar el primer día de la semana especificada
    let currentDate = new Date(start);
    while (currentDate.getDay() !== dayOfWeek && currentDate <= end) {
      currentDate.setDate(currentDate.getDate() + 1);
    }
    
    // Generar sesiones semanales
    while (currentDate <= end) {
      sessions.push({
        class_type_id: classTypeId,
        capacity: capacity,
        schedule_date: currentDate.toISOString().split('T')[0],
        schedule_time: time
      });
      
      currentDate.setDate(currentDate.getDate() + 7); // Siguiente semana
    }
    
    return this.createMultipleSessions(sessions);
  }

  // Utilidad para formatear fecha
  formatDate(date: Date): string {
    return date.toISOString().split('T')[0];
  }

  // Utilidad para formatear hora
  formatTime(time: string): string {
    return time.substring(0, 8); // HH:mm:ss
  }
}
