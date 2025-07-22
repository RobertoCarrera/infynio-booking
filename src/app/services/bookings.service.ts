import { Injectable } from '@angular/core';
import { SupabaseClient, createClient } from '@supabase/supabase-js';
import { environment } from '../../environments/environment';
import { PackagesService } from './packages.service';

@Injectable({ providedIn: 'root' })
export class BookingsService {
  private supabase: SupabaseClient;

  constructor(private packagesService: PackagesService) {
    this.supabase = createClient(environment.supabaseUrl, environment.supabaseKey);
  }

  async reserveSpot(sessionId: number, userId: number, cancellationTime?: string): Promise<any> {
    try {
      // Primero obtener información de la clase para saber el tipo
      const { data: sessionData, error: sessionError } = await this.supabase
        .from('class_sessions')
        .select(`
          *,
          class_type:class_types(*)
        `)
        .eq('id', sessionId)
        .single();

      if (sessionError) throw sessionError;

      // Determinar el tipo de clase y usar el paquete correspondiente
      let classType: 'MAT_FUNCIONAL' | 'REFORMER';
      if (sessionData.class_type.name.toLowerCase().includes('reformer')) {
        classType = 'REFORMER';
      } else {
        classType = 'MAT_FUNCIONAL';
      }

      // Intentar usar una clase del paquete del usuario
      const classUsed = await this.packagesService.useClass(userId, classType);
      
      if (!classUsed) {
        throw new Error('No tienes clases disponibles de este tipo. Compra un paquete para continuar.');
      }

      // Si se pudo usar la clase, proceder con la reserva
      const { data, error } = await this.supabase
        .from('bookings')
        .insert([
          { class_session_id: sessionId, user_id: userId, cancellation_time: cancellationTime }
        ])
        .select();
        
      if (error) {
        // Si hay error en la reserva, devolver la clase al paquete
        await this.packagesService.cancelClass(userId, classType);
        throw error;
      }
      
      return data;
    } catch (error) {
      console.error('Error in reserveSpot:', error);
      throw error;
    }
  }

  async canCancelBooking(bookingId: number): Promise<boolean> {
    // Llama a la función SQL para saber si se puede cancelar
    const { data, error } = await this.supabase
      .rpc('can_cancel_booking', { booking_id: bookingId });
    if (error) throw error;
    // data será true/false
    return !!data;
  }

  async cancelBooking(bookingId: number, userId: number): Promise<{ error: any }> {
    try {
      // Primero obtener información de la reserva para saber qué tipo de clase devolver
      const { data: bookingData, error: bookingError } = await this.supabase
        .from('bookings')
        .select(`
          *,
          class_session:class_sessions(
            *,
            class_type:class_types(*)
          )
        `)
        .eq('id', bookingId)
        .single();

      if (bookingError) throw bookingError;

      // Determinar el tipo de clase
      let classType: 'MAT_FUNCIONAL' | 'REFORMER';
      if (bookingData.class_session.class_type.name.toLowerCase().includes('reformer')) {
        classType = 'REFORMER';
      } else {
        classType = 'MAT_FUNCIONAL';
      }

      // Eliminar la reserva
      const { error } = await this.supabase
        .from('bookings')
        .delete()
        .eq('id', bookingId);

      if (error) throw error;

      // Devolver la clase al paquete del usuario
      await this.packagesService.cancelClass(userId, classType);

      return { error: null };
    } catch (error) {
      console.error('Error in cancelBooking:', error);
      return { error };
    }
  }

  // Verificar si el usuario tiene clases disponibles para un tipo específico
  async hasAvailableClasses(userId: number, classType: 'MAT_FUNCIONAL' | 'REFORMER'): Promise<boolean> {
    try {
      const summary = await this.packagesService.getUserClassesSummary(userId);
      return classType === 'MAT_FUNCIONAL' 
        ? summary.matFuncional.total > 0 
        : summary.reformer.total > 0;
    } catch (error) {
      console.error('Error checking available classes:', error);
      return false;
    }
  }
}
