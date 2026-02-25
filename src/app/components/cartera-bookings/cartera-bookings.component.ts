import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription, from, forkJoin } from 'rxjs';
import { SupabaseService } from '../../services/supabase.service';
import { WaitingListService } from '../../services/waiting-list.service';
import { ClassSessionsService, Booking } from '../../services/class-sessions.service';

interface UpcomingBooking {
  id: number;
  status: string;
  scheduleDate: string; // YYYY-MM-DD
  scheduleTime: string; // HH:mm:ss
  className: string;
  cancellationTime?: string | null; // ISO string
  isWaitlist?: boolean;
  class_session_id?: number;
}

@Component({
  selector: 'app-cartera-bookings',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './cartera-bookings.component.html',
  styleUrls: ['./cartera-bookings.component.css']
})
export class CarteraBookingsComponent implements OnInit, OnDestroy {
  loading = true;
  error = '';
  upcoming: UpcomingBooking[] = [];
  private userNumericId: number | null = null;
  private subs: Subscription[] = [];

  constructor(
    private supabaseService: SupabaseService,
    private classSessions: ClassSessionsService,
    private waitingList: WaitingListService
  ) {}

  ngOnInit(): void {
    this.load();
  }

  ngOnDestroy(): void {
    this.subs.forEach(s => s.unsubscribe());
  }

  private async load() {
    try {
      this.loading = true;
      this.error = '';

      const { data: auth } = await this.supabaseService.supabase.auth.getUser();
      const authUser = auth?.user;
      if (!authUser) {
        this.upcoming = [];
        this.loading = false;
        return;
      }

      const { data: userRow, error: uErr } = await this.supabaseService.supabase
        .from('users')
        .select('id')
        .eq('auth_user_id', authUser.id)
        .single();
      if (uErr || !userRow) throw uErr || new Error('Usuario no encontrado');
      this.userNumericId = userRow.id;

      const sub = forkJoin({
        bookings: this.classSessions.getUserBookings(this.userNumericId as number),
        waitlist: this.waitingList.getUserWaitingList(this.userNumericId as number)
      }).subscribe({
        next: ({ bookings, waitlist }) => {
          const now = new Date();
          
          // 1. Process CONFIRMED bookings
          const confirmedBookings: UpcomingBooking[] = (bookings || [])
            .filter((b: any) => (b.status || '').toUpperCase() === 'CONFIRMED')
            .map((b: any) => {
              const sess = b.class_sessions || {};
              const scheduleDate: string = sess.schedule_date || (b.booking_date_time ? new Date(b.booking_date_time).toISOString().slice(0, 10) : null);
              const scheduleTime: string = sess.schedule_time || '00:00:00';
              const className: string = sess.class_types?.name || 'Clase';
              return {
                id: b.id,
                status: b.status,
                scheduleDate: scheduleDate,
                scheduleTime: scheduleTime,
                className,
                cancellationTime: b.cancellation_time || null,
                isWaitlist: false
              } as UpcomingBooking;
            });

          // 2. Process WAITING LIST
          const waitlistEntries: UpcomingBooking[] = (waitlist || [])
            .map((w: any) => {
              const sess = w.class_sessions || {};
              // For waiting list, sess is populated via join in service
              const scheduleDate: string = sess.schedule_date || null;
              const scheduleTime: string = sess.schedule_time || '00:00:00';
              const className: string = sess.class_types?.name || 'Clase (Lista de espera)';
              
              if (!scheduleDate) return null; // Skip if no session data

              return {
                id: w.id, // waitlist entry id
                status: 'WAITING',
                scheduleDate: scheduleDate,
                scheduleTime: scheduleTime,
                className,
                cancellationTime: null,
                isWaitlist: true,
                class_session_id: sess.id // Keep session id for cancellation/actions if needed
              } as any; // Cast to any to add extra props if needed, then filter nulls
            })
            .filter((w: any) => w !== null);

          // 3. Combine and Filter Future
          const combined = [...confirmedBookings, ...waitlistEntries]
            .filter(u => {
              const dt = this.combineDateTime(u.scheduleDate, u.scheduleTime);
              return !!dt && dt.getTime() >= now.getTime();
            })
            .sort((a, b) => {
              const da = this.combineDateTime(a.scheduleDate, a.scheduleTime)?.getTime() || 0;
              const db = this.combineDateTime(b.scheduleDate, b.scheduleTime)?.getTime() || 0;
              return da - db;
            });

          this.upcoming = combined;
          this.loading = false;
        },
        error: (err) => {
          console.error('Error cargando reservas:', err);
          this.error = 'Error al cargar tus reservas';
          this.loading = false;
        }
      });
      this.subs.push(sub);
    } catch (e: any) {
      console.error('Error inicializando reservas:', e);
      this.error = 'No se pudieron cargar tus reservas';
      this.loading = false;
    }
  }

  retry() {
    this.load();
  }

  private combineDateTime(dateStr?: string, timeStr?: string): Date | null {
    if (!dateStr) return null;
    const t = (timeStr || '00:00:00').slice(0, 8);
    // Interpret as local time to match app behavior
    const [h, m, s] = t.split(':').map(n => parseInt(n, 10));
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return null;
    d.setHours(h || 0, m || 0, s || 0, 0);
    return d;
  }

  formatWhen(u: UpcomingBooking): string {
    const dt = this.combineDateTime(u.scheduleDate, u.scheduleTime);
    if (!dt) return '';
    // ej.: Lunes, 2 de septiembre · 18:30
    const weekday = dt.toLocaleDateString('es-ES', { weekday: 'long' });
    const day = dt.getDate();
    const month = dt.toLocaleDateString('es-ES', { month: 'long' });
    const time = dt.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
    const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
    return `${cap(weekday)}, ${day} de ${cap(month)} · ${time}`;
  }

  canCancel(u: UpcomingBooking): boolean {
    if (u.isWaitlist) {
      // Permitir salir de lista de espera hasta que empiece la clase
      const dt = this.combineDateTime(u.scheduleDate, u.scheduleTime);
      return !!dt && dt.getTime() > Date.now();
    }
    const cutoff = this.getCutoff(u);
    return !!cutoff && cutoff.getTime() > Date.now();
  }

  cancelling: { [id: number]: boolean } = {};
  cancelError: { [id: number]: string } = {};

  cancel(u: UpcomingBooking) {
    if (!this.userNumericId || !this.canCancel(u) || this.cancelling[u.id]) return;
    this.cancelling[u.id] = true;
    this.cancelError[u.id] = '';
    
    // DIFFERENTIATE WAITING LIST vs BOOKING
    let sub: Subscription;
    if (u.isWaitlist) {
      if (!u.class_session_id) {
        this.cancelError[u.id] = 'Error: falta class_session_id';
        this.cancelling[u.id] = false;
        return;
      }
      sub = this.waitingList.removeFromWaitingList(this.userNumericId, u.class_session_id).subscribe({
        next: () => {
          this.upcoming = this.upcoming.filter(x => x.id !== u.id);
          this.cancelling[u.id] = false;
        },
        error: (err) => {
          console.error('Fallo al salir de lista de espera:', err);
          this.cancelError[u.id] = err?.message || 'No se pudo salir de la lista de espera';
          this.cancelling[u.id] = false;
        }
      });
    } else {
      sub = this.classSessions.cancelBooking(u.id, this.userNumericId).subscribe({
        next: () => {
          // Remove from list after successful cancellation
          this.upcoming = this.upcoming.filter(x => x.id !== u.id);
          this.cancelling[u.id] = false;
        },
        error: (err) => {
          console.error('Fallo al cancelar reserva:', err);
          this.cancelError[u.id] = err?.message || 'No se pudo cancelar';
          this.cancelling[u.id] = false;
        }
      });
    }
    this.subs.push(sub);
  }

  private getCutoff(u: UpcomingBooking): Date | null {
    // Prefer DB-provided cancellation_time
    if (u.cancellationTime) {
      const parsed = new Date(u.cancellationTime);
      if (!isNaN(parsed.getTime())) return parsed;
    }
    // Fallback: 12h antes de la clase según fecha/hora local
    const dt = this.combineDateTime(u.scheduleDate, u.scheduleTime);
    if (!dt) return null;
    const fallback = new Date(dt.getTime() - 12 * 60 * 60 * 1000);
    return fallback;
  }
}
