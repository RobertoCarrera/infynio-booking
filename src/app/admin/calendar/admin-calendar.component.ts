import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { FullCalendarModule } from '@fullcalendar/angular';
import { CalendarOptions, EventClickArg, DateSelectArg } from '@fullcalendar/core';
import { ClassSessionsService, ClassSession } from '../../services/class-sessions.service';
import { FULLCALENDAR_OPTIONS } from '../../components/calendar/fullcalendar-config';
import { Subscription } from 'rxjs';

interface ClassType {
  id: number;
  name: string;
  description: string;
  duration_minutes: number;
}

@Component({
  selector: 'app-admin-calendar',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, FullCalendarModule],
  templateUrl: './admin-calendar.component.html',
  styleUrls: ['./admin-calendar.component.css']
})
export class AdminCalendarComponent implements OnInit, OnDestroy {
  calendarOptions: CalendarOptions;
  events: any[] = [];
  classTypes: ClassType[] = [];
  
  // Modal states
  showModal = false;
  isEditing = false;
  selectedSession: ClassSession | null = null;
  
  // Form
  sessionForm: FormGroup;
  
  // UI states
  loading = false;
  error = '';
  successMessage = '';
  
  // Capacidades por tipo de clase
  readonly classTypeCapacities: { [key: number]: number } = {
    9: 10,  // MAT-FUNCIONAL
    2: 8,   // REFORMER 
    4: 1,   // MAT-FUNCIONAL Personal
    3: 2    // REFORMER Personal
  };
  
  private subscriptions: Subscription[] = [];

  constructor(
    private classSessionsService: ClassSessionsService,
    private fb: FormBuilder,
    private cdr: ChangeDetectorRef
  ) {
    this.sessionForm = this.fb.group({
      class_type_id: ['', Validators.required],
      schedule_date: ['', Validators.required],
      schedule_time: ['', Validators.required],
      capacity: [8, [Validators.required, Validators.min(1), Validators.max(15)]],
      recurring: [false],
      recurring_type: [''],
      recurring_end_date: ['']
    });

    // Configuración del calendario adaptada para admin
    this.calendarOptions = {
      ...FULLCALENDAR_OPTIONS,
      selectable: true,
      selectMirror: true,
      select: this.onDateSelect.bind(this),
      eventClick: this.onEventClick.bind(this),
      editable: true,
      dayMaxEvents: false,
      height: 'auto',
      headerToolbar: {
        left: 'prev,next today',
        center: 'title',
        right: 'dayGridMonth,timeGridWeek,timeGridDay'
      },
      buttonText: {
        today: 'Hoy',
        month: 'Mes',
        week: 'Semana',
        day: 'Día'
      }
    };
  }

  ngOnInit() {
    this.loadClassTypes();
    this.loadSessions();
  }

  ngOnDestroy() {
    this.subscriptions.forEach(sub => sub.unsubscribe());
  }

  loadClassTypes() {
    // Los tipos de clase se cargarán junto con las sesiones
    // Por ahora, creamos los tipos básicos manualmente
    this.classTypes = [
      { id: 9, name: 'MAT-FUNCIONAL', description: 'Clase de Mat Funcional', duration_minutes: 60 },
      { id: 2, name: 'REFORMER', description: 'Clase de Reformer', duration_minutes: 60 },
      { id: 4, name: 'MAT-FUNCIONAL Personal', description: 'Clase Personal de Mat Funcional', duration_minutes: 60 },
      { id: 3, name: 'REFORMER Personal', description: 'Clase Personal de Reformer', duration_minutes: 60 }
    ];
  }

  loadSessions() {
    this.loading = true;
    const sub = this.classSessionsService.getClassSessions().subscribe({
      next: (sessions: ClassSession[]) => {
        this.events = sessions.map(session => ({
          id: session.id.toString(),
          title: `${this.getClassTypeName(session.class_type_id)} (${session.bookings || 0}/${session.capacity})`,
          start: `${session.schedule_date}T${session.schedule_time}`,
          end: this.calculateEndTime(session.schedule_date, session.schedule_time, session.class_type_id),
          backgroundColor: this.getClassTypeColor(session.class_type_id),
          borderColor: this.getClassTypeColor(session.class_type_id),
          textColor: '#ffffff',
          extendedProps: {
            session: session,
            capacity: session.capacity,
            bookings: session.bookings || 0
          }
        }));
        
        this.calendarOptions = {
          ...this.calendarOptions,
          events: this.events
        };
        
        this.loading = false;
        this.cdr.detectChanges();
      },
      error: (err: any) => {
        console.error('Error loading sessions:', err);
        this.error = 'Error al cargar las sesiones';
        this.loading = false;
      }
    });
    this.subscriptions.push(sub);
  }

  onDateSelect(selectInfo: DateSelectArg) {
    // Crear nueva sesión en la fecha/hora seleccionada
    const startDate = new Date(selectInfo.start);
    const scheduleDate = startDate.toISOString().split('T')[0];
    const scheduleTime = startDate.toTimeString().slice(0, 5);
    
    this.openCreateModal(scheduleDate, scheduleTime);
    selectInfo.view.calendar.unselect();
  }

  onEventClick(clickInfo: EventClickArg) {
    // Editar sesión existente
    const session = clickInfo.event.extendedProps['session'] as ClassSession;
    this.openEditModal(session);
  }

  openCreateModal(date?: string, time?: string) {
    this.isEditing = false;
    this.selectedSession = null;
    this.sessionForm.reset();
    
    if (date) {
      this.sessionForm.patchValue({
        schedule_date: date,
        schedule_time: time || '09:00',
        capacity: 8
      });
    }
    
    this.showModal = true;
    this.clearMessages();
  }

  openEditModal(session: ClassSession) {
    this.isEditing = true;
    this.selectedSession = session;
    
    this.sessionForm.patchValue({
      class_type_id: session.class_type_id,
      schedule_date: session.schedule_date,
      schedule_time: session.schedule_time,
      capacity: session.capacity
    });
    
    this.showModal = true;
    this.clearMessages();
  }

  closeModal() {
    this.showModal = false;
    this.isEditing = false;
    this.selectedSession = null;
    this.sessionForm.reset();
    this.clearMessages();
  }

  onSubmit() {
    if (this.sessionForm.invalid) {
      this.error = 'Por favor completa todos los campos requeridos';
      return;
    }

    this.loading = true;
    this.clearMessages();

    const formData = this.sessionForm.value;
    
    if (this.isEditing && this.selectedSession) {
      // Actualizar sesión existente
      const updateData = {
        class_type_id: formData.class_type_id,
        schedule_date: formData.schedule_date,
        schedule_time: formData.schedule_time,
        capacity: formData.capacity
      };

      const sub = this.classSessionsService.updateSession(this.selectedSession.id, updateData).subscribe({
        next: () => {
          this.successMessage = 'Sesión actualizada correctamente';
          this.closeModal();
          this.loadSessions();
          this.loading = false;
        },
        error: (err: any) => {
          console.error('Error updating session:', err);
          this.error = 'Error al actualizar la sesión';
          this.loading = false;
        }
      });
      this.subscriptions.push(sub);
    } else {
      // Crear nueva sesión
      const newSession = {
        class_type_id: formData.class_type_id,
        schedule_date: formData.schedule_date,
        schedule_time: formData.schedule_time,
        capacity: formData.capacity
      };

      const sub = this.classSessionsService.createSession(newSession).subscribe({
        next: () => {
          this.successMessage = 'Sesión creada correctamente';
          this.closeModal();
          this.loadSessions();
          this.loading = false;
        },
        error: (err: any) => {
          console.error('Error creating session:', err);
          this.error = 'Error al crear la sesión';
          this.loading = false;
        }
      });
      this.subscriptions.push(sub);
    }
  }

  deleteSession() {
    if (!this.selectedSession) return;

    if (!confirm('¿Estás seguro de que quieres eliminar esta sesión?')) {
      return;
    }

    this.loading = true;
    const sub = this.classSessionsService.deleteSession(this.selectedSession.id).subscribe({
      next: () => {
        this.successMessage = 'Sesión eliminada correctamente';
        this.closeModal();
        this.loadSessions();
        this.loading = false;
      },
      error: (err: any) => {
        console.error('Error deleting session:', err);
        this.error = 'Error al eliminar la sesión';
        this.loading = false;
      }
    });
    this.subscriptions.push(sub);
  }

  onClassTypeChange() {
    const classTypeId = this.sessionForm.get('class_type_id')?.value;
    if (classTypeId && this.classTypeCapacities[classTypeId]) {
      this.sessionForm.patchValue({
        capacity: this.classTypeCapacities[classTypeId]
      });
    }
  }

  // Métodos auxiliares
  getClassTypeName(classTypeId: number): string {
    const classType = this.classTypes.find(ct => ct.id === classTypeId);
    return classType?.name || 'Clase';
  }

  getClassTypeColor(classTypeId: number): string {
    const colorMap: { [key: number]: string } = {
      9: '#4CAF50',  // Verde - MAT-FUNCIONAL
      2: '#2196F3',  // Azul - REFORMER
      4: '#8BC34A',  // Verde claro - MAT-FUNCIONAL Personal
      3: '#03A9F4'   // Azul claro - REFORMER Personal
    };
    return colorMap[classTypeId] || '#9E9E9E';
  }

  calculateEndTime(date: string, time: string, classTypeId: number): string {
    const classType = this.classTypes.find(ct => ct.id === classTypeId);
    const duration = classType?.duration_minutes || 60;
    
    const startDateTime = new Date(`${date}T${time}`);
    const endDateTime = new Date(startDateTime.getTime() + duration * 60000);
    
    return endDateTime.toISOString();
  }

  clearMessages() {
    this.error = '';
    this.successMessage = '';
  }
}
