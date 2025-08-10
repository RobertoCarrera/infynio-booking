
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

    // Transformar los datos para que coincidan con la interfaz ClassSession
    return (data || []).map((session: any) => ({
      id: session.id,
      class_type_id: session.class_type_id,
      capacity: session.capacity,
      schedule_date: session.schedule_date,
      schedule_time: session.schedule_time,
      bookings: Array(session.confirmed_bookings_count).fill({
        id: 0,
        user_id: 0,
        class_session_id: session.id,
        booking_date_time: '',
        cancellation_time: '',
        status: 'CONFIRMED'
      }) // Array simulado para mantener compatibilidad
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
    // Usar la nueva función que maneja todo el proceso de forma segura
    const { data, error } = await this.supabaseService.supabase
      .rpc('create_booking_from_package', {
        p_user_id: bookingRequest.user_id,
        p_class_session_id: bookingRequest.class_session_id,
        p_class_type: bookingRequest.class_type
      });

    if (error) {
      console.error('Error creating booking:', error);
      throw new Error(error.message || 'Error creando la reserva');
    }

    // La función retorna un JSON con success/error
    if (!data.success) {
      throw new Error(data.error);
    }

    return data;
  }

  /**
   * Cancela una reserva usando la función segura
   */
  cancelBooking(bookingId: number, userId: number): Observable<any> {
    return from(this.performCancelBooking(bookingId, userId));
  }

  private async performCancelBooking(bookingId: number, userId: number): Promise<any> {
    // MÉTODO DIRECTO: Cancelar la reserva y devolver el bono manualmente
    
    // 1. Primero, obtener la información de la reserva
    const { data: bookingData, error: bookingError } = await this.supabaseService.supabase
      .from('bookings')
      .select(`
        *,
        users (name, surname)
      `)
      .eq('id', bookingId)
      .eq('user_id', userId)
      .eq('status', 'CONFIRMED')
      .single();

    if (bookingError || !bookingData) {
      console.error('Booking not found:', { bookingId, userId, error: bookingError });
      throw new Error('Reserva no encontrada o ya cancelada');
    }

    // 2. Cancelar la reserva
    const { error: cancelError } = await this.supabaseService.supabase
      .from('bookings')
      .update({
        status: 'CANCELLED',
        cancellation_time: new Date().toISOString()
      })
      .eq('id', bookingId);

    if (cancelError) {
      throw new Error(`Error cancelando reserva: ${cancelError.message}`);
    }

    // 3. Devolver el bono al usuario (solo si era de un paquete)
    if (bookingData.is_from_package) {
      // Buscar el paquete activo más reciente del usuario
      const { data: userPackages, error: packageError } = await this.supabaseService.supabase
        .from('user_packages')
        .select('*')
        .eq('user_id', userId)
        .in('status', ['active', 'expired'])
        .order('purchase_date', { ascending: false })
        .limit(1);

      if (!packageError && userPackages && userPackages.length > 0) {
        const userPackage = userPackages[0];
        
        // Actualizar el paquete: devolver una clase
        const newClassesRemaining = userPackage.current_classes_remaining + 1;
        const newClassesUsed = Math.max(0, userPackage.classes_used_this_month - 1);
        const newStatus = newClassesRemaining > 0 ? 'active' : userPackage.status;

        const { error: updateError } = await this.supabaseService.supabase
          .from('user_packages')
          .update({
            current_classes_remaining: newClassesRemaining,
            classes_used_this_month: newClassesUsed,
            status: newStatus
          })
          .eq('id', userPackage.id);

        if (updateError) {
          console.warn('Warning: No se pudo actualizar el paquete:', updateError);
        }
      }
    }

    return {
      success: true,
      message: 'Reserva cancelada correctamente'
    };
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
  const confirmedBookings = session.bookings?.filter(b => (b.status || '').toUpperCase() === 'CONFIRMED') || [];
    return confirmedBookings.length < session.capacity;
  }

  /**
   * Obtiene el número de espacios disponibles en una sesión
   */
  getAvailableSpots(session: ClassSession): number {
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
    const { data, error } = await this.supabaseService.supabase
      .from('class_sessions')
      .update(sessionData)
      .eq('id', sessionId)
      .select();
    if (error) {
      console.error('Error actualizando sesión:', error);
      throw error;
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