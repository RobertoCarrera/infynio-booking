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
      bookings: session.bookings?.filter((b: any) => b.status === 'confirmed') || []
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
    // Usar la función segura que maneja todo el proceso
    const { data, error } = await this.supabaseService.supabase
      .rpc('cancel_booking_safe', {
        p_booking_id: bookingId,
        p_user_id: userId
      });

    if (error) {
      console.error('Error cancelling booking:', error);
      throw new Error(error.message || 'Error cancelando la reserva');
    }

    // La función retorna un JSON con success/error
    if (!data.success) {
      throw new Error(data.error);
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
    const confirmedBookings = session.bookings?.filter(b => 
      b.status === 'confirmed'
    ) || [];
    return confirmedBookings.length < session.capacity;
  }

  /**
   * Obtiene el número de espacios disponibles en una sesión
   */
  getAvailableSpots(session: ClassSession): number {
    const confirmedBookings = session.bookings?.filter(b => 
      b.status === 'confirmed'
    ) || [];
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
}