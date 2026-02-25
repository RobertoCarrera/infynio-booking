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
      // Prefer RPC (SECURITY DEFINER) to avoid RLS issues
      this.supabaseService.supabase
        .rpc('join_waiting_list_v2', {
          p_user_id: request.user_id,
          p_class_session_id: request.class_session_id
        })
        .then(({ data, error }) => {
          if (error) {
            console.warn('RPC join_waiting_list_v2 failed, trying direct insert:', error);
            // Fallback to direct insert (will work if RLS policies allow it)
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
              .then(({ data: d2, error: e2 }) => {
                if (e2) {
                  console.error('Error joining waiting list (fallback):', e2);
                  observer.error(e2);
                } else {
                  observer.next(d2 as any);
                  observer.complete();
                }
              });
          } else {
            const row = Array.isArray(data) ? data[0] : data;
            observer.next(row as any);
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
        .maybeSingle()
        .then(({ data, error }) => {
          if (error) {
            console.error('Error checking waiting list:', error);
            observer.error(error);
          } else {
            // data será null si no existe, o el objeto si existe
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
      // Prefer RPC (SECURITY DEFINER) to avoid RLS issues
      this.supabaseService.supabase
        .rpc('get_waiting_list_position', {
          p_user_id: userId,
          p_class_session_id: classSessionId
        })
        .then(({ data, error }) => {
          if (error) {
            console.warn('RPC get_waiting_list_position failed, trying direct query:', error);
            this.supabaseService.supabase
              .from('waiting_list')
              .select('user_id, join_date_time')
              .eq('class_session_id', classSessionId)
              .eq('status', 'waiting')
              .order('join_date_time', { ascending: true })
              .then(({ data: d2, error: e2 }) => {
                if (e2) {
                  console.error('Error getting waiting list position (fallback):', e2);
                  observer.error(e2);
                } else {
                  const userIndex = d2?.findIndex((entry: any) => entry.user_id === userId) ?? -1;
                  observer.next(userIndex >= 0 ? userIndex + 1 : -1);
                  observer.complete();
                }
              });
          } else {
            observer.next((data as any) ?? -1);
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
        .rpc('get_waiting_list_count', { p_class_session_id: classSessionId })
        .then(({ data, error }) => {
          if (error) {
            console.warn('RPC get_waiting_list_count failed, trying direct count:', error);
            this.supabaseService.supabase
              .from('waiting_list')
              .select('id', { count: 'exact' })
              .eq('class_session_id', classSessionId)
              .eq('status', 'waiting')
              .then(({ count, error: e2 }) => {
                if (e2) {
                  console.error('Error getting waiting list count (fallback):', e2);
                  observer.error(e2);
                } else {
                  observer.next(count || 0);
                  observer.complete();
                }
              });
          } else {
            observer.next((data as any) ?? 0);
            observer.complete();
          }
        });
    });
  }

  /**
   * Elimina definitivamente una entrada de la lista de espera (admin)
   */
  removeFromWaitingList(userId: number, classSessionId: number): Observable<void> {
    return new Observable(observer => {
      this.supabaseService.supabase
        .from('waiting_list')
        .delete()
        .eq('user_id', userId)
        .eq('class_session_id', classSessionId)
        .then(({ error }) => {
          if (error) {
            console.error('Error removing from waiting list (direct delete):', error);
            observer.error(error);
          } else {
            observer.next();
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
      // Prefer RPC to avoid RLS issues
      this.supabaseService.supabase
        .rpc('cancel_waiting_list', {
          p_user_id: userId,
          p_class_session_id: classSessionId
        })
        .then(({ error }) => {
          if (error) {
            console.warn('RPC cancel_waiting_list failed, trying direct update:', error);
            this.supabaseService.supabase
              .from('waiting_list')
              .update({ status: 'cancelled' })
              .eq('user_id', userId)
              .eq('class_session_id', classSessionId)
              .eq('status', 'waiting')
              .then(({ error: e2 }) => {
                if (e2) {
                  console.error('Error cancelling waiting list (fallback):', e2);
                  observer.error(e2);
                } else {
                  observer.next();
                  observer.complete();
                }
              });
          } else {
            observer.next();
            observer.complete();
          }
        });
    });
  }
}
