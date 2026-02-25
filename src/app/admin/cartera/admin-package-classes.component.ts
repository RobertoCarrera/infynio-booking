import { Component, Input, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ClassSessionsService } from '../../services/class-sessions.service';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-admin-package-classes',
  standalone: true,
  imports: [CommonModule],
  templateUrl: 'admin-package-classes.component.html',
  styleUrls: ['admin-package-classes.component.css']
})
export class AdminPackageClassesComponent implements OnChanges {
  @Input() userPackageId: number | null = null;
  classes: any[] = [];
  loading = false;
  error = '';
  private sub?: Subscription;

  constructor(private classSessions: ClassSessionsService) {}

  ngOnChanges(changes: SimpleChanges) {
    if (changes['userPackageId']) {
      this.loadClasses();
    }
  }

  async loadClasses() {
    this.classes = [];
    this.error = '';
    if (!this.userPackageId) {
      this.loading = false;
      return;
    }
    this.loading = true;
    try {
      const supabase = (this.classSessions as any).supabaseService?.supabase;
      if (!supabase) throw new Error('Supabase no disponible');

      // 1. Fetch BOOKINGS
      const bookingsPromise = supabase
        .from('bookings')
        .select(`*, class_sessions(*, class_types(name))`)
        .eq('user_package_id', this.userPackageId)
        .in('status', ['CONFIRMED', 'CANCELLED'])
        .order('booking_date_time', { ascending: true });

      // 2. Fetch WAITLIST (new logic)
      const waitlistPromise = supabase
        .from('waiting_list')
        .select(`*, class_sessions(*, class_types(name))`)
        .eq('user_package_id', this.userPackageId)
        .order('join_date_time', { ascending: true });

      const [bookingsRes, waitlistRes] = await Promise.all([bookingsPromise, waitlistPromise]);

      if (bookingsRes.error) throw bookingsRes.error;
      if (waitlistRes.error) throw waitlistRes.error;

      const bookings = (bookingsRes.data || []).map((r: any) => {
        const sess = r.class_sessions || {};
        const typeName = sess.class_types?.name || 'Clase';
        return {
          id: r.id,
          status: r.status,
          booking_date_time: r.booking_date_time,
          schedule_date: sess.schedule_date,
          schedule_time: sess.schedule_time,
          class_name: typeName,
          class_type_name: typeName,
          type: 'booking'
        };
      });

      const waitlist = (waitlistRes.data || []).map((r: any) => {
        const sess = r.class_sessions || {};
        const typeName = sess.class_types?.name || 'Clase';
        return {
          id: r.id,
          status: 'WAITING',
          booking_date_time: r.join_date_time,
          schedule_date: sess.schedule_date,
          schedule_time: sess.schedule_time,
          class_name: typeName + ' (En espera)',
          class_type_name: typeName + ' (En espera)',
          type: 'waitlist'
        };
      });

      // Combine and sort
      this.classes = [...bookings, ...waitlist].sort((a, b) => {
        const da = new Date(a.booking_date_time).getTime();
        const db = new Date(b.booking_date_time).getTime();
        return da - db;
      });

    } catch (e: any) {
      console.error('Error loading package classes:', e);
      this.error = e.message || 'Error cargando historial del bono';
    } finally {
      this.loading = false;
    }
  }

  formatWhen(c: any): string {

    const date = c.schedule_date || (c.booking_date_time ? new Date(c.booking_date_time).toISOString().slice(0,10) : null);
    const time = c.schedule_time || (c.booking_date_time ? new Date(c.booking_date_time).toLocaleTimeString() : '');
    if (!date) return '';
    try{
      const d = new Date(date + 'T' + (c.schedule_time || '00:00:00'));
      return d.toLocaleDateString('es-ES', { weekday: 'short', day: '2-digit', month: 'short' }) + ' · ' + d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
    }catch{ return date; }
  }
}
