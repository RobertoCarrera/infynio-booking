import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { SupabaseService } from './supabase.service';
import { WaitingListEntry, CreateWaitingListRequest } from '../models/waiting-list';

@Injectable({
  providedIn: 'root'
})
export class WaitingListService {

  constructor(private supabaseService: SupabaseService) { }

  /**
   * Agrega un usuario a la lista de espera de una clase
   */
  joinWaitingList(request: CreateWaitingListRequest): Observable<WaitingListEntry> {
    return new Observable(observer => {
      this.supabaseService.supabase
        .from('waiting_list')
        .insert({
          user_id: request.user_id,
          class_session_id: request.class_session_id,
          join_date_time: new Date().toISOString(),
          status: request.status || 'waiting',
          notification_sent: false
        })
        .select()
        .single()
        .then(({ data, error }) => {
          if (error) {
            console.error('Error joining waiting list:', error);
            observer.error(error);
          } else {
            observer.next(data);
            observer.complete();
          }
        });
    });
  }

  /**
   * Verifica si un usuario ya está en la lista de espera de una clase
   */
  isUserInWaitingList(userId: number, classSessionId: number): Observable<boolean> {
    return new Observable(observer => {
      this.supabaseService.supabase
        .from('waiting_list')
        .select('id')
        .eq('user_id', userId)
        .eq('class_session_id', classSessionId)
        .eq('status', 'waiting')
        .single()
        .then(({ data, error }) => {
          if (error && error.code !== 'PGRST116') {
            // PGRST116 es "not found", que es esperado si no está en la lista
            console.error('Error checking waiting list:', error);
            observer.error(error);
          } else {
            observer.next(!!data);
            observer.complete();
          }
        });
    });
  }

  /**
   * Obtiene la posición del usuario en la lista de espera
   */
  getUserWaitingListPosition(userId: number, classSessionId: number): Observable<number> {
    return new Observable(observer => {
      this.supabaseService.supabase
        .from('waiting_list')
        .select('id, join_date_time')
        .eq('class_session_id', classSessionId)
        .eq('status', 'waiting')
        .order('join_date_time', { ascending: true })
        .then(({ data, error }) => {
          if (error) {
            console.error('Error getting waiting list position:', error);
            observer.error(error);
          } else {
            const userIndex = data?.findIndex(entry => entry.id === userId) ?? -1;
            observer.next(userIndex >= 0 ? userIndex + 1 : -1);
            observer.complete();
          }
        });
    });
  }

  /**
   * Obtiene el número total de personas en la lista de espera de una clase
   */
  getWaitingListCount(classSessionId: number): Observable<number> {
    return new Observable(observer => {
      this.supabaseService.supabase
        .from('waiting_list')
        .select('id', { count: 'exact' })
        .eq('class_session_id', classSessionId)
        .eq('status', 'waiting')
        .then(({ count, error }) => {
          if (error) {
            console.error('Error getting waiting list count:', error);
            observer.error(error);
          } else {
            observer.next(count || 0);
            observer.complete();
          }
        });
    });
  }

  /**
   * Cancela la entrada del usuario en la lista de espera
   */
  cancelWaitingList(userId: number, classSessionId: number): Observable<void> {
    return new Observable(observer => {
      this.supabaseService.supabase
        .from('waiting_list')
        .update({ status: 'cancelled' })
        .eq('user_id', userId)
        .eq('class_session_id', classSessionId)
        .eq('status', 'waiting')
        .then(({ error }) => {
          if (error) {
            console.error('Error cancelling waiting list:', error);
            observer.error(error);
          } else {
            observer.next();
            observer.complete();
          }
        });
    });
  }
}
