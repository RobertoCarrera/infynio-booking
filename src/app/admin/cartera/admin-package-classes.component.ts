import { Component, Input, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ClassSessionsService } from '../../services/class-sessions.service';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-admin-package-classes',
  standalone: true,
  imports: [CommonModule],
  template: `
  <div class="card h-100">
    <div class="card-header d-flex align-items-center justify-content-between">
  <h6 class="mb-0">Clases del bono</h6>
  <span class="badge bg-secondary" *ngIf="!loading && !error">{{ classes.length || 0 }}</span>
    </div>

    <div class="card-body" *ngIf="loading">
      <div class="d-flex justify-content-center py-3"><div class="spinner-border text-primary" role="status"></div></div>
    </div>

    <div class="card-body" *ngIf="error">
      <div class="alert alert-danger">{{ error }}</div>
    </div>

  <ul class="list-group list-group-flush h-100" *ngIf="!loading && !error && classes.length > 0">
      <li class="list-group-item" *ngFor="let c of classes">
        <div class="d-flex justify-content-between align-items-center">
          <div>
            <div class="fw-semibold">{{ c.class_name || c.class_type_name || 'Clase' }}</div>
            <div class="text-muted small">{{ formatWhen(c) }}</div>
          </div>
          <div class="text-end small">
            <div *ngIf="c.status==='CONFIRMED'" class="badge bg-success">Confirmada</div>
          </div>
        </div>
      </li>
    </ul>

  <div class="card-body text-center text-muted" *ngIf="!loading && !error && classes.length===0">
      <div>No hay clases asociadas a este bono</div>
    </div>
  </div>
  `
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
      // There's no direct RPC for classes by user_package_id; use bookings table join via Supabase directly
      const supabase = (this.classSessions as any).supabaseService?.supabase;
      if (!supabase) throw new Error('Supabase no disponible');
      const rows = await supabase
        .from('bookings')
        .select(`*, class_sessions(*, class_types(name))`)
        .eq('user_package_id', this.userPackageId)
        .order('booking_date_time', { ascending: true });
      if (rows.error) throw rows.error;
      this.classes = (rows.data || []).map((r: any) => ({
        id: r.id,
        status: r.status,
        booking_date_time: r.booking_date_time,
        class_name: r.class_sessions && r.class_sessions.class_types ? r.class_sessions.class_types.name : undefined,
        class_type_name: r.class_sessions && r.class_sessions.class_types ? r.class_sessions.class_types.name : undefined,
        schedule_date: r.class_sessions ? r.class_sessions.schedule_date : undefined,
        schedule_time: r.class_sessions ? r.class_sessions.schedule_time : undefined
      }));
    } catch (e: any) {
      console.error('Error cargando clases del bono:', e);
      this.error = 'Error al cargar las clases del bono';
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
