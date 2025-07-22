import { Injectable } from '@angular/core';
import { SupabaseClient, createClient } from '@supabase/supabase-js';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class BookingsService {
  private supabase: SupabaseClient;

  constructor() {
    this.supabase = createClient(environment.supabaseUrl, environment.supabaseKey);
  }

  async reserveSpot(sessionId: number, userId: number, cancellationTime?: string): Promise<any> {
    // Inserta una reserva en la tabla 'bookings' usando los nombres correctos y cancellation_time
    const { data, error } = await this.supabase
      .from('bookings')
      .insert([
        { class_session_id: sessionId, user_id: userId, cancellation_time: cancellationTime }
      ])
      .select();
    if (error) throw error;
    return data;
  }
  async canCancelBooking(bookingId: number): Promise<boolean> {
    // Llama a la función SQL para saber si se puede cancelar
    const { data, error } = await this.supabase
      .rpc('can_cancel_booking', { booking_id: bookingId });
    if (error) throw error;
    // data será true/false
    return !!data;
  }

  async cancelBooking(bookingId: number): Promise<{ error: any }> {
    // Elimina la reserva de la tabla 'bookings'
    const { error } = await this.supabase
      .from('bookings')
      .delete()
      .eq('id', bookingId);
    return { error };
  }
}
