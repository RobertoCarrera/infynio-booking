import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { Subscription } from 'rxjs';
import { ClassSessionsService, ClassSession } from '../../services/class-schedules.service';

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
  classTypes: ClassType[] = [];
  sessions: ClassSession[] = [];
  
  // Forms
  sessionForm: FormGroup;
  generateForm: FormGroup;
  
  // UI States
  loading = false;
  error = '';
  successMessage = '';
  
  // Modal states
  showAddModal = false;
  showEditModal = false;
  showGenerateModal = false;
  editingSession: ClassSession | null = null;
  
  // View options
  viewMode: 'calendar' | 'list' = 'calendar';
  selectedDate: string = '';
  selectedWeek: Date = new Date();
  
  // Days of week mapping
  daysOfWeek = [
    { value: 1, name: 'Lunes' },
    { value: 2, name: 'Martes' },
    { value: 3, name: 'Miércoles' },
    { value: 4, name: 'Jueves' },
    { value: 5, name: 'Viernes' },
    { value: 6, name: 'Sábado' },
    { value: 0, name: 'Domingo' }
  ];
  
  private subscriptions: Subscription[] = [];

  constructor(
    private fb: FormBuilder,
    private sessionsService: ClassSessionsService
  ) {
    this.sessionForm = this.fb.group({
      class_type_id: ['', Validators.required],
      schedule_date: ['', Validators.required],
      schedule_time: ['', Validators.required],
      capacity: [10, [Validators.required, Validators.min(1), Validators.max(50)]]
    });

    this.generateForm = this.fb.group({
      class_type_id: ['', Validators.required],
      day_of_week: ['', Validators.required],
      schedule_time: ['', Validators.required],
      capacity: [10, [Validators.required, Validators.min(1), Validators.max(50)]],
      start_date: ['', Validators.required],
      end_date: ['', Validators.required]
    });

    // Inicializar fecha seleccionada a hoy
    this.selectedDate = this.formatDate(new Date());
  }

  ngOnInit() {
    this.loadClassTypes();
    this.loadSessions();
  }

  ngOnDestroy() {
    this.subscriptions.forEach(sub => sub.unsubscribe());
  }

  // Cargar tipos de clase
  loadClassTypes() {
    // Datos mock basados en tu JSON
    this.classTypes = [
      {"id":1,"name":"Barre","description":"Clase grupal de Barre.","duration_minutes":50},
      {"id":2,"name":"Mat","description":"Clase grupal de Pilates Mat.","duration_minutes":50},
      {"id":3,"name":"Reformer","description":"Clase grupal de Pilates Reformer.","duration_minutes":50},
      {"id":4,"name":"Personalizada","description":"Clase inividual y personalizada.","duration_minutes":50},
      {"id":9,"name":"Funcional","description":"Clase grupal de Pilates Funcional.","duration_minutes":50}
    ];
  }

  // Cargar sesiones desde el servicio
  loadSessions() {
    this.loading = true;
    this.error = '';
    
    const sub = this.sessionsService.getSessions().subscribe({
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

  // Cargar sesiones por fecha
  loadSessionsByDate(date: string) {
    this.loading = true;
    this.error = '';
    
    const sub = this.sessionsService.getSessionsByDate(date).subscribe({
      next: (sessions: ClassSession[]) => {
        this.sessions = sessions;
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

  // Métodos para modal de agregar
  openAddModal() {
    this.editingSession = null;
    this.sessionForm.reset();
    this.sessionForm.patchValue({
      capacity: 10,
      schedule_date: this.selectedDate
    });
    this.showAddModal = true;
  }

  closeAddModal() {
    this.showAddModal = false;
    this.sessionForm.reset();
  }

  // Métodos para modal de editar
  openEditModal(session: ClassSession) {
    this.editingSession = session;
    this.sessionForm.patchValue({
      class_type_id: session.class_type_id,
      schedule_date: session.schedule_date,
      schedule_time: session.schedule_time.substring(0, 5), // HH:mm
      capacity: session.capacity
    });
    this.showEditModal = true;
  }

  closeEditModal() {
    this.showEditModal = false;
    this.editingSession = null;
    this.sessionForm.reset();
  }

  // Métodos para modal de generar sesiones recurrentes
  openGenerateModal() {
    this.generateForm.reset();
    this.generateForm.patchValue({
      capacity: 10,
      start_date: this.selectedDate,
      end_date: this.formatDate(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)) // +30 días
    });
    this.showGenerateModal = true;
  }

  closeGenerateModal() {
    this.showGenerateModal = false;
    this.generateForm.reset();
  }

  // Guardar sesión (crear o actualizar)
  saveSession() {
    if (this.sessionForm.invalid) {
      this.error = 'Por favor completa todos los campos requeridos';
      return;
    }

    const formData = this.sessionForm.value;
    
    // Formatear la hora para incluir segundos
    formData.schedule_time = formData.schedule_time + ':00';

    this.loading = true;
    this.error = '';

    if (this.editingSession) {
      // Actualizar
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
      // Crear
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

  // Generar sesiones recurrentes
  generateRecurringSessions() {
    if (this.generateForm.invalid) {
      this.error = 'Por favor completa todos los campos requeridos';
      return;
    }

    const formData = this.generateForm.value;
    
    // Formatear la hora para incluir segundos
    const timeWithSeconds = formData.schedule_time + ':00';

    this.loading = true;
    this.error = '';

    const sub = this.sessionsService.generateRecurringSessions(
      formData.class_type_id,
      formData.day_of_week,
      timeWithSeconds,
      formData.capacity,
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

  // Eliminar sesión
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

  // Cambiar fecha seleccionada
  onDateChange() {
    if (this.viewMode === 'calendar') {
      this.loadSessionsByDate(this.selectedDate);
    }
  }

  // Cambiar modo de vista
  changeViewMode(mode: 'calendar' | 'list') {
    this.viewMode = mode;
    if (mode === 'list') {
      this.loadSessions();
    } else {
      this.loadSessionsByDate(this.selectedDate);
    }
  }

  // Métodos de utilidad
  getClassTypeName(classTypeId: number): string {
    const classType = this.classTypes.find(ct => ct.id === classTypeId);
    return classType ? classType.name : 'Tipo desconocido';
  }

  getDayName(dayOfWeek: number): string {
    const day = this.daysOfWeek.find(d => d.value === dayOfWeek);
    return day ? day.name : 'Día desconocido';
  }

  // Agrupar sesiones por fecha
  getSessionsByDate(): { [key: string]: ClassSession[] } {
    const grouped: { [key: string]: ClassSession[] } = {};
    
    this.sessions.forEach(session => {
      const date = session.schedule_date;
      if (!grouped[date]) {
        grouped[date] = [];
      }
      grouped[date].push(session);
    });
    
    // Ordenar por hora
    Object.keys(grouped).forEach(date => {
      grouped[date].sort((a, b) => a.schedule_time.localeCompare(b.schedule_time));
    });
    
    return grouped;
  }

  // Formatear fecha
  formatDate(date: Date): string {
    return date.toISOString().split('T')[0];
  }

  // Formatear fecha para mostrar
  formatDisplayDate(dateString: string): string {
    const date = new Date(dateString);
    return date.toLocaleDateString('es-ES', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  }

  // Formatear tiempo
  formatTime(time: string): string {
    return time.substring(0, 5); // HH:mm
  }

  // Limpiar mensajes
  clearMessages() {
    this.error = '';
    this.successMessage = '';
  }

  // Track by functions for performance
  trackBySessionId(index: number, session: ClassSession): any {
    return session.id;
  }
}
