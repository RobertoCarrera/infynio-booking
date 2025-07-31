
import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { Subscription } from 'rxjs';
import { ClassSessionsService, ClassSession } from '../../services/class-sessions.service';

interface ClassType {
  id: number;
  name: string;
  description: string;
  duration_minutes: number;
}

@Component({
  selector: 'app-admin-class-schedules',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, RouterModule],
  templateUrl: './admin-class-schedules.component.html',
  styleUrls: ['./admin-class-schedules.component.css']
})
export class AdminClassSchedulesComponent implements OnInit, OnDestroy {
  isPrevDayDisabled(): boolean {
    const today = this.formatDate(new Date());
    return this.selectedDate <= today;
  }
  changeDay(offset: number) {
    const current = new Date(this.selectedDate);
    current.setDate(current.getDate() + offset);
    this.selectedDate = this.formatDate(current);
    this.onDateChange();
  }
  classTypes: ClassType[] = [];
  sessions: ClassSession[] = [];
  sessionForm: FormGroup;
  generateForm: FormGroup;
  readonly classTypeCapacities: { [key: number]: number } = {
    9: 10,
    2: 8,
    4: 1,
    3: 2
  };
  loading = false;
  error = '';
  successMessage = '';
  showAddModal = false;
  showEditModal = false;
  showGenerateModal = false;
  editingSession: ClassSession | null = null;
  viewMode: 'calendar' | 'list' = 'calendar';
  selectedDate: string = '';
  selectedWeek: Date = new Date();
  daysOfWeek = [
    { value: 1, name: 'Lunes' },
    { value: 2, name: 'Martes' },
    { value: 3, name: 'Miércoles' },
    { value: 4, name: 'Jueves' },
    { value: 5, name: 'Viernes' }
  ];
  private subscriptions: Subscription[] = [];
  constructor(
    private fb: FormBuilder,
    private sessionsService: ClassSessionsService
  ) {
    this.sessionForm = this.fb.group({
      class_type_id: ['', Validators.required],
      schedule_date: ['', Validators.required],
      schedule_time: ['', Validators.required]
    });
    this.generateForm = this.fb.group({
      class_type_id: ['', Validators.required],
      day_of_week: ['', Validators.required],
      schedule_time: ['', Validators.required],
      start_date: ['', Validators.required],
      end_date: ['', Validators.required]
    });
    this.selectedDate = this.formatDate(new Date());
  }
  ngOnInit() {
    this.loadClassTypes();
    if (this.viewMode === 'calendar') {
      this.loadSessionsByDate(this.selectedDate);
    } else {
      this.loadSessions();
    }
  }
  ngOnDestroy() {
    this.subscriptions.forEach(sub => sub.unsubscribe());
  }
  loadClassTypes() {
    this.classTypes = [
      {"id":1,"name":"Barre","description":"Clase grupal de Barre.","duration_minutes":50},
      {"id":2,"name":"Mat","description":"Clase grupal de Pilates Mat.","duration_minutes":50},
      {"id":3,"name":"Reformer","description":"Clase grupal de Pilates Reformer.","duration_minutes":50},
      {"id":4,"name":"Personalizada","description":"Clase inividual y personalizada.","duration_minutes":50},
      {"id":9,"name":"Funcional","description":"Clase grupal de Pilates Funcional.","duration_minutes":50}
    ];
  }
  loadSessions() {
    this.loading = true;
    this.error = '';
    const sub = this.sessionsService.getClassSessions().subscribe({
      next: (sessions: ClassSession[]) => {
        this.sessions = sessions;
        this.loading = false;
      },
      error: (err: any) => {
        console.error('Error al cargar sesiones:', err);
        this.error = 'Error al cargar las sesiones';
        this.loading = false;
      }
    });
    this.subscriptions.push(sub);
  }
  loadSessionsByDate(date: string) {
    this.loading = true;
    this.error = '';
    // Si tienes un método getSessionsByDate, úsalo. Si no, filtra localmente:
    const sub = this.sessionsService.getClassSessions().subscribe({
      next: (sessions: ClassSession[]) => {
        this.sessions = sessions.filter(s => s.schedule_date === date);
        this.loading = false;
      },
      error: (err: any) => {
        console.error('Error al cargar sesiones por fecha:', err);
        this.error = 'Error al cargar las sesiones';
        this.loading = false;
      }
    });
    this.subscriptions.push(sub);
  }
  openAddModal() {
    this.editingSession = null;
    this.sessionForm.reset();
    this.sessionForm.patchValue({
      schedule_date: this.selectedDate
    });
    this.showAddModal = true;
  }
  closeAddModal() {
    this.showAddModal = false;
    this.sessionForm.reset();
  }
  openEditModal(session: ClassSession) {
    this.editingSession = session;
    this.sessionForm.patchValue({
      class_type_id: session.class_type_id,
      schedule_date: session.schedule_date,
      schedule_time: session.schedule_time.substring(0, 5)
    });
    this.showEditModal = true;
  }
  closeEditModal() {
    this.showEditModal = false;
    this.editingSession = null;
    this.sessionForm.reset();
  }
  openGenerateModal() {
    this.generateForm.reset();
    this.generateForm.patchValue({
      start_date: this.selectedDate,
      end_date: this.formatDate(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000))
    });
    this.showGenerateModal = true;
  }
  closeGenerateModal() {
    this.showGenerateModal = false;
    this.generateForm.reset();
  }
  saveSession() {
    if (this.sessionForm.invalid) {
      this.error = 'Por favor completa todos los campos requeridos';
      return;
    }
    const formData = this.sessionForm.value;
    formData.capacity = this.classTypeCapacities[formData.class_type_id] ?? 10;
    formData.schedule_time = formData.schedule_time + ':00';
    this.loading = true;
    this.error = '';
    if (this.editingSession) {
      const sub = this.sessionsService.updateSession(this.editingSession.id!, formData).subscribe({
        next: () => {
          this.successMessage = 'Sesión actualizada exitosamente';
          this.loadSessions();
          this.closeEditModal();
          this.loading = false;
          setTimeout(() => this.successMessage = '', 3000);
        },
        error: (err: any) => {
          console.error('Error al actualizar sesión:', err);
          this.error = 'Error al actualizar la sesión';
          this.loading = false;
        }
      });
      this.subscriptions.push(sub);
    } else {
      const sub = this.sessionsService.createSession(formData).subscribe({
        next: () => {
          this.successMessage = 'Sesión creada exitosamente';
          this.loadSessions();
          this.closeAddModal();
          this.loading = false;
          setTimeout(() => this.successMessage = '', 3000);
        },
        error: (err: any) => {
          console.error('Error al crear sesión:', err);
          this.error = 'Error al crear la sesión';
          this.loading = false;
        }
      });
      this.subscriptions.push(sub);
    }
  }
  generateRecurringSessions() {
    if (this.generateForm.invalid) {
      this.error = 'Por favor completa todos los campos requeridos';
      return;
    }
    const formData = this.generateForm.value;
    const capacity = this.classTypeCapacities[formData.class_type_id] ?? 10;
    const timeWithSeconds = formData.schedule_time + ':00';
    this.loading = true;
    this.error = '';
    const sub = this.sessionsService.generateRecurringSessions(
      formData.class_type_id,
      formData.day_of_week,
      timeWithSeconds,
      capacity,
      formData.start_date,
      formData.end_date
    ).subscribe({
      next: (sessions: ClassSession[]) => {
        this.successMessage = `${sessions.length} sesiones generadas exitosamente`;
        this.loadSessions();
        this.closeGenerateModal();
        this.loading = false;
        setTimeout(() => this.successMessage = '', 3000);
      },
      error: (err: any) => {
        console.error('Error al generar sesiones:', err);
        this.error = 'Error al generar las sesiones';
        this.loading = false;
      }
    });
    this.subscriptions.push(sub);
  }
  deleteSession(session: ClassSession) {
    if (!confirm(`¿Estás seguro de que quieres eliminar la sesión de ${this.getClassTypeName(session.class_type_id)} del ${this.formatDisplayDate(session.schedule_date)}?`)) {
      return;
    }
    this.loading = true;
    const sub = this.sessionsService.deleteSession(session.id!).subscribe({
      next: () => {
        this.successMessage = 'Sesión eliminada exitosamente';
        this.loadSessions();
        this.loading = false;
        setTimeout(() => this.successMessage = '', 3000);
      },
      error: (err: any) => {
        console.error('Error al eliminar sesión:', err);
        this.error = 'Error al eliminar la sesión';
        this.loading = false;
      }
    });
    this.subscriptions.push(sub);
  }
  onDateChange() {
    if (this.viewMode === 'calendar') {
      this.loadSessionsByDate(this.selectedDate);
    }
  }
  changeViewMode(mode: 'calendar' | 'list') {
    this.viewMode = mode;
    if (mode === 'list') {
      this.loadSessions();
    } else {
      this.loadSessionsByDate(this.selectedDate);
    }
  }
  getClassTypeName(classTypeId: number): string {
    const classType = this.classTypes.find(ct => ct.id === classTypeId);
    return classType ? classType.name : 'Tipo desconocido';
  }
  getDayName(dayOfWeek: number): string {
    const day = this.daysOfWeek.find(d => d.value === dayOfWeek);
    return day ? day.name : 'Día desconocido';
  }
  getSessionsByDate(): { [key: string]: ClassSession[] } {
    const grouped: { [key: string]: ClassSession[] } = {};
    this.sessions.forEach(session => {
      const date = session.schedule_date;
      if (!grouped[date]) {
        grouped[date] = [];
      }
      grouped[date].push(session);
    });
    Object.keys(grouped).forEach(date => {
      grouped[date].sort((a, b) => a.schedule_time.localeCompare(b.schedule_time));
    });
    return grouped;
  }
  formatDate(date: Date): string {
    return date.toISOString().split('T')[0];
  }
  formatDisplayDate(dateString: string): string {
    const date = new Date(dateString);
    return date.toLocaleDateString('es-ES', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  }
  formatTime(time: string): string {
    return time.substring(0, 5);
  }
  clearMessages() {
    this.error = '';
    this.successMessage = '';
  }
  trackBySessionId(index: number, session: ClassSession): any {
    return session.id;
  }
}