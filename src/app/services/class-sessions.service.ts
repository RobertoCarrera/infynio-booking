
import { Injectable } from '@angular/core';
import { Observable, from } from 'rxjs';
import { SupabaseService } from './supabase.service';

export interface ClassType {
  id: number;
  name: string;
  description: string;
  duration_minutes: number;
}

export interface ClassSession {
  id: number;
  class_type_id: number;
  capacity: number;
  schedule_date: string;
  schedule_time: string;
  class_type_name?: string;
  class_type_description?: string;
  class_type_duration?: number;
  bookings?: Booking[];
  // Enhanced fields from get_sessions_for_calendar
  confirmed_bookings_count?: number;
  available_spots?: number;
  is_self_booked?: boolean;
  self_booking_id?: number | null;
  self_cancellation_time?: string | null;
}

export interface Booking {
  id: number;
  user_id: number;
  class_session_id: number;
  booking_date_time: string;
  cancellation_time: string;
  status: string;
  user?: {
    name: string;
    surname: string;
    email: string;
  };
}

export interface CreateBookingRequest {
  user_id: number;
  class_session_id: number;
  class_type: string;
}

@Injectable({
  providedIn: 'root'
})
export class ClassSessionsService {
  /**
   * Obtiene sesiones filtradas por usuario/rol usando la función RPC
   */
  getFilteredSessions(userId: string): Observable<ClassSession[]> {
    return from(this.fetchFilteredSessions(userId));
  }

  private async fetchFilteredSessions(userId: string): Promise<ClassSession[]> {
    const { data, error } = await this.supabaseService.supabase
      .rpc('get_filtered_sessions', { user_id: userId });
    if (error) {
      console.error('Error fetching filtered sessions:', error);
      throw error;
    }
    return data || [];
  }

  constructor(private supabaseService: SupabaseService) { }

  /**
   * Obtiene todas las sesiones de clases con información completa
   */
  getClassSessions(): Observable<ClassSession[]> {
    return from(this.fetchClassSessions());
  }

  private async fetchClassSessions(): Promise<ClassSession[]> {
    const { data, error } = await this.supabaseService.supabase
      .rpc('get_class_sessions');

    if (error) {
      console.error('Error fetching class sessions:', error);
      throw error;
    }

    return data || [];
  }

  /**
   * Obtiene sesiones de clases para un rango de fechas específico
   */
  getClassSessionsByDateRange(startDate: string, endDate: string): Observable<ClassSession[]> {
    return from(this.fetchClassSessionsByDateRange(startDate, endDate));
  }

  /**
   * Obtiene sesiones con contadores de reservas usando función SQL optimizada
   */
  getSessionsWithBookingCounts(startDate?: string, endDate?: string): Observable<ClassSession[]> {
    return from(this.fetchSessionsWithBookingCounts(startDate, endDate));
  }

  private async fetchSessionsWithBookingCounts(startDate?: string, endDate?: string): Promise<ClassSession[]> {
    const { data, error } = await this.supabaseService.supabase
      .rpc('get_sessions_with_booking_counts', {
        p_start_date: startDate || null,
        p_end_date: endDate || null
      });

    if (error) {
      console.warn('Función SQL no disponible, usando método alternativo:', error);
      // Fallback al método original
      if (startDate && endDate) {
        return this.fetchClassSessionsByDateRange(startDate, endDate);
      } else {
        return this.fetchClassSessions();
      }
    }

  // Sanitize rows early to avoid null dereferences downstream
  const rows: any[] = (data || []).filter((r: any) => r && r.id != null);

    // Obtener nombres/duración de tipos de clase para etiquetar eventos en UI de usuario
  const typeIds = Array.from(new Set(rows.map((r: any) => r.class_type_id).filter((v: any) => v != null)));
    let typesMap = new Map<number, { name: string; description: string | null; duration_minutes: number | null }>();
    if (typeIds.length > 0) {
      const { data: typesData } = await this.supabaseService.supabase
        .from('class_types')
        .select('id, name, description, duration_minutes')
        .in('id', typeIds as any);
      (typesData || []).forEach((t: any) => typesMap.set(t.id, { name: t.name, description: t.description, duration_minutes: t.duration_minutes }));
    }

    // Intentar enriquecer con info del usuario actual (self booked) si está autenticado
    let currentUserNumericId: number | null = null;
    try {
      const { data: authUser } = await this.supabaseService.supabase.auth.getUser();
      const uid = authUser?.user?.id;
      if (uid) {
        const { data: urow } = await this.supabaseService.supabase
          .from('users')
          .select('id, auth_user_id')
          .eq('auth_user_id', uid)
          .single();
        currentUserNumericId = urow?.id ?? null;
      }
    } catch (_) {
      currentUserNumericId = null;
    }

    let selfBookingsMap = new Map<number, { id: number; cancellation_time: string | null }>();
    if (currentUserNumericId) {
      // Obtener reservas confirmadas del usuario en las sesiones listadas
  const sessionIds = rows.map((r: any) => r.id);
      if (sessionIds.length > 0) {
        const { data: selfBookings } = await this.supabaseService.supabase
          .from('bookings')
          .select('id, class_session_id, cancellation_time, status')
          .in('class_session_id', sessionIds as any)
          .eq('user_id', currentUserNumericId)
          .eq('status', 'CONFIRMED');
        (selfBookings || []).forEach((b: any) => selfBookingsMap.set(b.class_session_id, { id: b.id, cancellation_time: b.cancellation_time }));
      }
    }

  // Prefer counts from elevated RPC; avoid re-counting via bookings (RLS may hide rows)
  const sessionIds = rows.map((r: any) => r.id);
  const confirmedCountsMap = new Map<number, number>();

    // Transformar los datos para que coincidan con la interfaz ClassSession
  return (rows || []).filter((session: any) => session && session.id != null).map((session: any) => {
      const t = typesMap.get(session.class_type_id);
      const selfB = selfBookingsMap.get(session.id);
      const confirmedCount = typeof session.confirmed_bookings_count === 'number'
        ? session.confirmed_bookings_count
        : 0;
      const available = Math.max(0, (session.capacity || 0) - confirmedCount);
      return {
        id: session.id,
        class_type_id: session.class_type_id,
        capacity: session.capacity,
        schedule_date: session.schedule_date,
        schedule_time: session.schedule_time,
        class_type_name: t?.name,
        class_type_description: t?.description || undefined,
        class_type_duration: t?.duration_minutes || undefined,
        confirmed_bookings_count: confirmedCount,
        available_spots: available,
        // Enriquecido: marcar si el usuario actual ya está reservado
        is_self_booked: !!selfB,
        self_booking_id: selfB?.id ?? null,
        self_cancellation_time: selfB?.cancellation_time ?? null,
        // Back-compat: create synthetic bookings to keep existing consumers working
        bookings: Array(session.confirmed_bookings_count).fill({
          id: 0,
          user_id: 0,
          class_session_id: session.id,
          booking_date_time: '',
          cancellation_time: '',
          status: 'CONFIRMED'
        })
      } as ClassSession;
    });
  }

  /**
   * Obtiene sesiones optimizadas para el calendario del usuario logado,
   * incluyendo contadores, si el propio usuario está reservado y lista de asistentes
   */
  getSessionsForCalendar(userId: number, startDate?: string, endDate?: string): Observable<ClassSession[]> {
    return from(this.fetchSessionsForCalendar(userId, startDate, endDate));
  }

  private async fetchSessionsForCalendar(userId: number, startDate?: string, endDate?: string): Promise<ClassSession[]> {
    const { data, error } = await this.supabaseService.supabase
      .rpc('get_sessions_for_calendar', {
        p_start_date: startDate || null,
        p_end_date: endDate || null,
        p_user_id: userId
      });

    if (error) {
      console.error('Error fetching sessions for calendar:', error);
      // Fallback: usar getSessionsWithBookingCounts sin datos de self ni asistentes
      return this.fetchSessionsWithBookingCounts(startDate, endDate);
    }

    return (data || []).map((s: any) => ({
      id: s.id,
      class_type_id: s.class_type_id,
      capacity: s.capacity,
      schedule_date: s.schedule_date,
      schedule_time: s.schedule_time,
      class_type_name: s.class_type_name,
      class_type_description: s.class_type_description,
      class_type_duration: s.class_type_duration,
      confirmed_bookings_count: s.confirmed_bookings_count,
      available_spots: s.available_spots,
      is_self_booked: s.is_self_booked,
      self_booking_id: s.self_booking_id,
      self_cancellation_time: s.self_cancellation_time
    }));
  }

  private async fetchClassSessionsByDateRange(startDate: string, endDate: string): Promise<ClassSession[]> {
    const { data, error } = await this.supabaseService.supabase
      .from('class_sessions')
      .select(`
        *,
        class_types (
          id,
          name,
          description,
          duration_minutes
        ),
        bookings (
          id,
          user_id,
          booking_date_time,
          cancellation_time,
          status,
          users (
            name,
            surname,
            email
          )
        )
      `)
      .gte('schedule_date', startDate)
      .lte('schedule_date', endDate)
      .order('schedule_date', { ascending: true })
      .order('schedule_time', { ascending: true });

    if (error) {
      console.error('Error fetching class sessions by date range:', error);
      throw error;
    }

  // Transformar los datos para una estructura más plana
  return (data || []).map(session => ({
      id: session.id,
      class_type_id: session.class_type_id,
      capacity: session.capacity,
      schedule_date: session.schedule_date,
      schedule_time: session.schedule_time,
      class_type_name: session.class_types?.name,
      class_type_description: session.class_types?.description,
      class_type_duration: session.class_types?.duration_minutes,
  bookings: session.bookings?.filter((b: any) => (b.status || '').toUpperCase() === 'CONFIRMED') || []
    }));
  }

  /**
   * Crea una nueva reserva para una sesión de clase usando el sistema de packages
   */
  createBooking(bookingRequest: CreateBookingRequest): Observable<any> {
    return from(this.performCreateBooking(bookingRequest));
  }

  private async performCreateBooking(bookingRequest: CreateBookingRequest): Promise<any> {
    // Usar la función atómica validada en BD. Ignoramos class_type del request para compatibilidad
    const { data, error } = await this.supabaseService.supabase
      .rpc('create_booking_with_validations', {
        p_user_id: bookingRequest.user_id,
        p_class_session_id: bookingRequest.class_session_id,
        p_booking_date_time: new Date().toISOString()
      });

    if (error) {
      console.error('Error creating booking:', error);
      throw new Error(error.message || 'Error creando la reserva');
    }

    // Supabase devuelve rows para RETURNS TABLE
    const row = Array.isArray(data) ? data[0] : data;
    if (!row || row.success !== true) {
      throw new Error(row?.message || 'No se pudo crear la reserva');
    }

    return row;
  }

  /**
   * Cancela una reserva usando la función segura
   */
  cancelBooking(bookingId: number, userId: number): Observable<any> {
    return from(this.performCancelBooking(bookingId, userId));
  }

  private async performCancelBooking(bookingId: number, userId: number): Promise<any> {
    // Usar función atómica en BD
    const { data, error } = await this.supabaseService.supabase
      .rpc('cancel_booking_with_refund', {
        p_booking_id: bookingId,
        p_user_id: userId
      });

    if (error) {
      throw new Error(error.message || 'Error al cancelar la reserva');
    }

    if (!data || data.success !== true) {
      throw new Error(data?.error || 'No se pudo cancelar la reserva');
    }

    return data;
  }

  /**
   * Obtiene las reservas de un usuario
   */
  getUserBookings(userId: number): Observable<Booking[]> {
    return from(this.fetchUserBookings(userId));
  }

  private async fetchUserBookings(userId: number): Promise<Booking[]> {
    const { data, error } = await this.supabaseService.supabase
      .from('bookings')
      .select(`
        *,
        class_sessions (
          schedule_date,
          schedule_time,
          capacity,
          class_types (
            name,
            description,
            duration_minutes
          )
        )
      `)
      .eq('user_id', userId)
      .order('booking_date_time', { ascending: false });

    if (error) {
      console.error('Error fetching user bookings:', error);
      throw error;
    }

    return data || [];
  }

  /**
   * Verifica si una sesión tiene espacios disponibles
   */
  isSessionAvailable(session: ClassSession): boolean {
    if (typeof session.available_spots === 'number') {
      return session.available_spots > 0;
    }
    const confirmedBookings = session.bookings?.filter(b => (b.status || '').toUpperCase() === 'CONFIRMED') || [];
    return confirmedBookings.length < session.capacity;
  }

  /**
   * Obtiene el número de espacios disponibles en una sesión
   */
  getAvailableSpots(session: ClassSession): number {
    if (typeof session.available_spots === 'number') {
      return Math.max(0, session.available_spots);
    }
    const confirmedBookings = session.bookings?.filter(b => (b.status || '').toUpperCase() === 'CONFIRMED') || [];
    return Math.max(0, session.capacity - confirmedBookings.length);
  }

  /**
   * Obtiene colores elegantes por tipo de clase
   */
  getClassTypeColors(classTypeName: string): { background: string, border: string, hover: string } {
    const colorMap: { [key: string]: { background: string, border: string, hover: string } } = {
      'Barre': {
        background: '#f59e0b', // Amber - energético y vibrante
        border: '#d97706',
        hover: '#b45309'
      },
      'Mat': {
        background: '#10b981', // Emerald - relajante y natural
        border: '#059669',
        hover: '#047857'
      },
      'Reformer': {
        background: '#6366f1', // Indigo - sofisticado y premium
        border: '#4f46e5',
        hover: '#5b21b6'
      },
      'Personalizada': {
        background: '#8b5cf6', // Purple - exclusivo y especial
        border: '#7c3aed',
        hover: '#6d28d9'
      },
      'Funcional': {
        background: '#ef4444', // Red - dinámico y potente
        border: '#dc2626',
        hover: '#b91c1c'
      }
    };

    // Buscar por coincidencia exacta primero
    if (colorMap[classTypeName]) {
      return colorMap[classTypeName];
    }

    // Buscar por coincidencia parcial para mayor flexibilidad
    const matchedKey = Object.keys(colorMap).find(key => 
      classTypeName.toLowerCase().includes(key.toLowerCase()) || 
      key.toLowerCase().includes(classTypeName.toLowerCase())
    );

    if (matchedKey) {
      return colorMap[matchedKey];
    }

    // Color por defecto si no se encuentra el tipo
    return {
      background: '#6b7280', // Gray neutro
      border: '#4b5563',
      hover: '#374151'
    };
  }

  /**
   * Obtiene el color de disponibilidad (combinado con tipo de clase)
   */
  getEventColors(session: ClassSession): { background: string, border: string } {
    const isAvailable = this.isSessionAvailable(session);
    const typeColors = this.getClassTypeColors(session.class_type_name || '');
    
    if (isAvailable) {
      return {
        background: typeColors.background,
        border: typeColors.border
      };
    } else {
      // Clases completas: versión más oscura y desaturada
      return {
        background: '#94a3b8', // Slate más claro para "completo"
        border: '#64748b'
      };
    }
  }
  /**
   * Crea una nueva sesión de clase
   */
  public createSession(sessionData: Partial<ClassSession>): Observable<any> {
    return from(this.performCreateSession(sessionData));
  }

  private async performCreateSession(sessionData: Partial<ClassSession>): Promise<any> {
    const { data, error } = await this.supabaseService.supabase
      .from('class_sessions')
      .insert([sessionData])
      .select();
    if (error) {
      console.error('Error creando sesión:', error);
      throw error;
    }
    return data;
  }

  /**
   * Actualiza una sesión de clase existente
   */
  public updateSession(sessionId: number, sessionData: Partial<ClassSession>): Observable<any> {
    return from(this.performUpdateSession(sessionId, sessionData));
  }

  private async performUpdateSession(sessionId: number, sessionData: Partial<ClassSession>): Promise<any> {
    const hasDate = Object.prototype.hasOwnProperty.call(sessionData, 'schedule_date');
    const hasTime = Object.prototype.hasOwnProperty.call(sessionData, 'schedule_time');
    const hasOther = Object.keys(sessionData).some(k => !['schedule_date', 'schedule_time'].includes(k));

    // Si solo cambiamos fecha/hora, usar RPC para recalcular cancellation_time
    if ((hasDate || hasTime) && !hasOther) {
      const { data, error } = await this.supabaseService.supabase
        .rpc('update_session_time', {
          p_session_id: sessionId,
          p_schedule_date: (sessionData as any).schedule_date,
          p_schedule_time: (sessionData as any).schedule_time
        });
      if (error) {
        console.error('Error update_session_time:', error);
        throw error;
      }
      return data;
    }

    // Si hay otros cambios (capacidad/tipo), actualizar tabla y, si hay fecha/hora presentes, llamar RPC adicionalmente
    const { data, error } = await this.supabaseService.supabase
      .from('class_sessions')
      .update(sessionData)
      .eq('id', sessionId)
      .select();
    if (error) {
      console.error('Error actualizando sesión:', error);
      throw error;
    }

    if (hasDate || hasTime) {
      // Reforzar recálculo de cancellation_time
      const { error: rpcErr } = await this.supabaseService.supabase
        .rpc('update_session_time', {
          p_session_id: sessionId,
          p_schedule_date: (sessionData as any).schedule_date,
          p_schedule_time: (sessionData as any).schedule_time
        });
      if (rpcErr) {
        console.warn('Warning: fallo en update_session_time tras update directo:', rpcErr);
      }
    }

    return data;
  }

  /**
   * Elimina una sesión de clase
   */
  public deleteSession(sessionId: number): Observable<any> {
    return from(this.performDeleteSession(sessionId));
  }

  private async performDeleteSession(sessionId: number): Promise<any> {
    const { data, error } = await this.supabaseService.supabase
      .from('class_sessions')
      .delete()
      .eq('id', sessionId);
    if (error) {
      console.error('Error eliminando sesión:', error);
      throw error;
    }
    return data;
  }

  /**
   * Genera sesiones recurrentes para un tipo de clase, día de la semana y rango de fechas
   */
  public generateRecurringSessions(classTypeId: number, dayOfWeek: number, scheduleTime: string, capacity: number, startDate: string, endDate: string): Observable<ClassSession[]> {
    return from(this.performGenerateRecurringSessions(classTypeId, dayOfWeek, scheduleTime, capacity, startDate, endDate));
  }

  private async performGenerateRecurringSessions(classTypeId: number, dayOfWeek: number, scheduleTime: string, capacity: number, startDate: string, endDate: string): Promise<ClassSession[]> {
    // Lógica para generar fechas recurrentes entre startDate y endDate
    const sessionsToCreate: Partial<ClassSession>[] = [];
    let current = new Date(startDate);
    const end = new Date(endDate);
    while (current <= end) {
      if (current.getDay() === dayOfWeek) {
        sessionsToCreate.push({
          class_type_id: classTypeId,
          schedule_date: current.toISOString().split('T')[0],
          schedule_time: scheduleTime,
          capacity
        });
      }
      current.setDate(current.getDate() + 1);
    }
    if (sessionsToCreate.length === 0) return [];
    const { data, error } = await this.supabaseService.supabase
      .from('class_sessions')
      .insert(sessionsToCreate)
      .select();
    if (error) {
      console.error('Error generando sesiones recurrentes:', error);
      throw error;
    }
    return data || [];
  }
}