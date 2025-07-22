import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FullCalendarModule } from '@fullcalendar/angular';
import { FULLCALENDAR_OPTIONS } from './fullcalendar-config';
import { SupabaseService } from '../../services/supabase.service';
import { BookingsService } from '../../services/bookings.service';

export interface CalendarClassSession {
  id: number;
  class_type_id: number;
  capacity: number;
  schedule_date: string;
  schedule_time: string;
  name: string;
  description: string;
  duration_minutes: number;
}

@Component({
  selector: 'app-calendar',
  standalone: true,
  imports: [CommonModule, FullCalendarModule],
  templateUrl: './calendar.component.html',
  styleUrls: ['./calendar.component.css'],
})
export class CalendarComponent implements OnInit, OnDestroy {
  currentUserId: number | null = null;
  canCancel: boolean | null = null;
  cancelMessage: string = '';
  private bookingsSubscription: any;
  showReserveModal = false;
  selectedEvent: any = null;
  calendarOptions: any = { ...FULLCALENDAR_OPTIONS, events: [] };
  classSessions: CalendarClassSession[] = [];

  constructor(
    private supabaseService: SupabaseService,
    private bookingsService: BookingsService
  ) {}

  async ngOnInit() {
    this.supabaseService.getCurrentUser().subscribe(async user => {
      if (user) {
        const { data: userData } = await this.supabaseService.supabase
          .from('users')
          .select('id')
          .eq('auth_user_id', user.id)
          .single();
        this.currentUserId = userData?.id ?? null;
      }
    });
    await this.refreshCalendarEvents();
    this.bookingsSubscription = this.supabaseService.supabase
      .channel('bookings-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings' }, async () => {
        await this.refreshCalendarEvents();
      })
      .subscribe();
  }

  async refreshCalendarEvents() {
    this.classSessions = await this.supabaseService.getClassSessionsWithTypes();
    
    // Debug: Verificar la duración de las clases
    console.log('🔍 Duración de clases desde BD:', this.classSessions.map(s => ({
      name: s.name,
      duration_minutes: s.duration_minutes
    })));
    
    const classTypeColors: string[] = [
      '#E8C4A0', // beige más intenso
      '#F48FB1', // rosa más vibrante  
      '#B39DDB', // lavanda más intensa
      '#80CBC4', // verde agua más saturado
      '#FFB74D', // naranja más vivo
      '#FF8A65', // coral más intenso
      '#A5D6A7', // verde más definido
      '#FFF176'  // amarillo más brillante
    ];
    const mappedEvents = this.classSessions.map((session: any) => {
      let userBooking = null;
      if (Array.isArray(session.bookings) && this.currentUserId) {
        userBooking = session.bookings.find((b: any) => b.user_id === this.currentUserId) || null;
      }
      
      const endTime = this.getEndDateTime(session.schedule_date, session.schedule_time, session.duration_minutes);
      
      // Debug: Verificar el cálculo de tiempo
      console.log(`⏰ Clase ${session.name}: ${session.schedule_time} → ${endTime.split('T')[1]} (${session.duration_minutes} min)`);
      
      return {
        title: `${session.name} (${session.capacity} plazas)`,
        start: session.schedule_date + 'T' + session.schedule_time,
        end: endTime,
        backgroundColor: classTypeColors[session.class_type_id % classTypeColors.length],
        borderColor: classTypeColors[session.class_type_id % classTypeColors.length],
        extendedProps: {
          description: session.description,
          capacity: session.capacity,
          classTypeId: session.class_type_id,
          sessionId: session.id,
          bookingId: userBooking ? userBooking.id : null,
          bookingCancellationTime: userBooking ? userBooking.cancellation_time : null
        }
      };
    });
    this.calendarOptions = {
      ...FULLCALENDAR_OPTIONS,
      events: mappedEvents,
      eventClick: async (info: any) => {
        this.selectedEvent = info.event;
        this.showReserveModal = true;
        this.canCancel = null;
        this.cancelMessage = '';
        
        // Si hay una reserva, verificar automáticamente si se puede cancelar
        const bookingId = info.event.extendedProps?.bookingId;
        if (bookingId) {
          await this.checkCanCancelBooking(bookingId);
        }
      }
    };
  }

  async onCancelBooking(bookingId: number) {
    if (!bookingId) {
      alert('No se encontró la reserva para cancelar.');
      return;
    }
    try {
      const canCancel = await this.bookingsService.canCancelBooking(bookingId);
      if (!canCancel) {
        this.cancelMessage = 'Ya no se puede anular la reserva porque quedan menos de 12 horas para la clase.';
        return;
      }
      const { error } = await this.bookingsService.cancelBooking(bookingId);
      if (error) {
        alert('Error al cancelar la reserva: ' + error.message);
      } else {
        alert('Reserva cancelada correctamente.');
        this.closeReserveModal();
        await this.refreshCalendarEvents();
      }
    } catch (error: any) {
      alert('Error al cancelar la reserva: ' + error.message);
    }
  }

  ngOnDestroy(): void {
    if (this.bookingsSubscription) {
      this.bookingsSubscription.unsubscribe();
    }
  }

  closeReserveModal() {
    this.canCancel = null;
    this.cancelMessage = '';
    this.showReserveModal = false;
    this.selectedEvent = null;
  }

  reserveSpot() {
    this.supabaseService.getCurrentUser().subscribe(async user => {
      if (!user) {
        alert('Debes iniciar sesión para reservar.');
        return;
      }
      const { data: userData, error } = await this.supabaseService.supabase
        .from('users')
        .select('id')
        .eq('auth_user_id', user.id)
        .single();
      if (error || !userData) {
        alert('No se pudo encontrar el usuario en la base de datos.');
        return;
      }
      try {
        const classDateTime = new Date(this.selectedEvent?.start);
        classDateTime.setHours(classDateTime.getHours() - 12);
        const cancellationTime = classDateTime.toISOString();
        await this.bookingsService.reserveSpot(
          this.selectedEvent?.extendedProps?.sessionId,
          userData.id,
          cancellationTime
        );
        alert('Reserva realizada para la clase: ' + this.selectedEvent?.title);
        this.closeReserveModal();
        await this.refreshCalendarEvents();
      } catch (error: any) {
        alert('Error al reservar plaza: ' + error.message);
      }
    });
  }

  getEndDateTime(date: string, time: string, duration: number): string {
    const start = new Date(date + 'T' + time);
    // Debug: verificar fecha inicial
    console.log(`🐛 DEBUG - Inicio: ${start.toISOString()}, Duración: ${duration} min`);
    
    start.setMinutes(start.getMinutes() + duration);
    
    // Debug: verificar fecha final
    console.log(`🐛 DEBUG - Final: ${start.toISOString()}`);
    
    return start.toISOString().slice(0, 16);
  }

  async checkCanCancelBooking(bookingId: number) {
    try {
      const canCancel = await this.bookingsService.canCancelBooking(bookingId);
      this.canCancel = canCancel;
      if (!canCancel) {
        this.cancelMessage = 'Ya no se puede anular la reserva porque quedan menos de 12 horas para la clase.';
      } else {
        this.cancelMessage = '';
      }
    } catch (error) {
      this.canCancel = null;
      this.cancelMessage = 'Error al comprobar si se puede cancelar.';
    }
  }
}