import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { FullCalendarModule } from '@fullcalendar/angular';
import { CalendarOptions, EventClickArg, DateSelectArg } from '@fullcalendar/core';
import { ClassSessionsService, ClassSession } from '../../services/class-sessions.service';
import { ClassTypesService, ClassType } from '../../services/class-types.service';
import { FULLCALENDAR_OPTIONS } from '../../components/calendar/fullcalendar-config';
import { Subscription, forkJoin } from 'rxjs';

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
  
  private subscriptions: Subscription[] = [];

  constructor(
    private classSessionsService: ClassSessionsService,
    private classTypesService: ClassTypesService,
    private fb: FormBuilder,
    private cdr: ChangeDetectorRef
  ) {
    this.sessionForm = this.fb.group({
      class_type_id: ['', Validators.required],
      schedule_date: ['', Validators.required],
      schedule_time: ['', Validators.required],
      capacity: [8, [Validators.required, Validators.min(1), Validators.max(15)]], // Se establece automáticamente
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
    this.loadData();
  }

  ngOnDestroy() {
    this.subscriptions.forEach(sub => sub.unsubscribe());
  }

  loadData() {
    this.loading = true;
    
    // Cargar tipos de clase y sesiones en paralelo
    const classTypes$ = this.classTypesService.getAll();
    const sessions$ = this.classSessionsService.getClassSessions();
    
    const sub = forkJoin({
      classTypes: classTypes$,
      sessions: sessions$
    }).subscribe({
      next: ({ classTypes, sessions }) => {
        this.classTypes = classTypes;
        this.loadSessionsData(sessions);
        this.loading = false;
        this.cdr.detectChanges();
      },
      error: (err: any) => {
        console.error('Error loading data:', err);
        this.error = 'Error al cargar los datos';
        this.loading = false;
      }
    });
    
    this.subscriptions.push(sub);
  }

  loadClassTypes() {
    // Este método ahora forma parte de loadData()
    // Los tipos de clase se cargan dinámicamente desde la BD
  }

  loadSessions() {
    this.loading = true;
    const sub = this.classSessionsService.getClassSessions().subscribe({
      next: (sessions: ClassSession[]) => {
        this.loadSessionsData(sessions);
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

  private loadSessionsData(sessions: ClassSession[]) {
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
        capacity: 8 // Capacidad por defecto hasta que se seleccione tipo
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

    // Validar campos de recurrencia si está activada
    if (this.sessionForm.get('recurring')?.value) {
      if (!this.sessionForm.get('recurring_type')?.value || !this.sessionForm.get('recurring_end_date')?.value) {
        this.error = 'Por favor completa todos los campos de recurrencia';
        return;
      }
    }

    this.loading = true;
    this.clearMessages();

    const formData = this.sessionForm.value;
    
    if (this.isEditing && this.selectedSession) {
      // Actualizar sesión existente (las sesiones recurrentes no se pueden editar para mantener integridad)
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
      // Crear nueva sesión o sesiones recurrentes
      if (formData.recurring) {
        this.createRecurringSessions(formData);
      } else {
        this.createSingleSession(formData);
      }
    }
  }

  private createSingleSession(formData: any) {
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

  private createRecurringSessions(formData: any) {
    const sessions = this.generateRecurringSessions(formData);
    let createdCount = 0;
    let totalSessions = sessions.length;

    if (totalSessions === 0) {
      this.error = 'No se pudieron generar sesiones con los parámetros especificados';
      this.loading = false;
      return;
    }

    // Crear todas las sesiones en secuencia
    sessions.forEach((session, index) => {
      const sub = this.classSessionsService.createSession(session).subscribe({
        next: () => {
          createdCount++;
          if (createdCount === totalSessions) {
            this.successMessage = `${createdCount} sesiones recurrentes creadas correctamente`;
            this.closeModal();
            this.loadSessions();
            this.loading = false;
          }
        },
        error: (err: any) => {
          console.error(`Error creating session ${index + 1}:`, err);
          createdCount++;
          if (createdCount === totalSessions) {
            this.error = `Se crearon ${createdCount - 1} sesiones. Algunas no se pudieron crear.`;
            this.loadSessions();
            this.loading = false;
          }
        }
      });
      this.subscriptions.push(sub);
    });
  }

  private generateRecurringSessions(formData: any): any[] {
    const sessions: any[] = [];
    const startDate = new Date(formData.schedule_date);
    const endDate = new Date(formData.recurring_end_date);
    const recurringType = formData.recurring_type;

    let currentDate = new Date(startDate);

    while (currentDate <= endDate) {
      sessions.push({
        class_type_id: formData.class_type_id,
        schedule_date: currentDate.toISOString().split('T')[0],
        schedule_time: formData.schedule_time,
        capacity: formData.capacity
      });

      // Avanzar según el tipo de recurrencia
      switch (recurringType) {
        case 'daily':
          currentDate.setDate(currentDate.getDate() + 1);
          break;
        case 'weekly':
          currentDate.setDate(currentDate.getDate() + 7);
          break;
        case 'biweekly':
          currentDate.setDate(currentDate.getDate() + 14);
          break;
        case 'monthly':
          currentDate.setMonth(currentDate.getMonth() + 1);
          break;
        default:
          // Si no hay tipo válido, salir del bucle
          break;
      }

      // Protección contra bucles infinitos
      if (sessions.length > 100) {
        console.warn('Limitando a 100 sesiones recurrentes');
        break;
      }
    }

    return sessions;
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
    if (classTypeId) {
      const capacity = this.getClassTypeCapacity(classTypeId);
      this.sessionForm.patchValue({
        capacity: capacity
      });
      
      console.log(`Capacidad automática establecida: ${capacity} para ${this.getClassTypeName(classTypeId)}`);
    }
  }

  getClassTypeCapacity(classTypeId: number): number {
    // Capacidades por defecto según el tipo de clase
    // La capacidad real se establece individualmente en cada class_session
    const capacityMap: { [key: number]: number } = {
      1: 8,   // Barre
      2: 8,   // Mat
      3: 2,   // Reformer
      4: 2,   // Personalizada
      9: 10   // Funcional
    };
    return capacityMap[classTypeId] || 8; // Default 8 si no se encuentra
  }

  onRecurringChange() {
    const isRecurring = this.sessionForm.get('recurring')?.value;
    const recurringTypeControl = this.sessionForm.get('recurring_type');
    const recurringEndDateControl = this.sessionForm.get('recurring_end_date');

    if (isRecurring) {
      // Hacer campos obligatorios cuando está activada la recurrencia
      recurringTypeControl?.setValidators([Validators.required]);
      recurringEndDateControl?.setValidators([Validators.required]);
      
      // Establecer fecha por defecto (1 mes desde la fecha de inicio)
      const startDate = this.sessionForm.get('schedule_date')?.value;
      if (startDate) {
        const endDate = new Date(startDate);
        endDate.setMonth(endDate.getMonth() + 1);
        this.sessionForm.patchValue({
          recurring_end_date: endDate.toISOString().split('T')[0]
        });
      }
    } else {
      // Quitar validadores cuando no está activada
      recurringTypeControl?.clearValidators();
      recurringEndDateControl?.clearValidators();
      this.sessionForm.patchValue({
        recurring_type: '',
        recurring_end_date: ''
      });
    }

    recurringTypeControl?.updateValueAndValidity();
    recurringEndDateControl?.updateValueAndValidity();
  }

  getRecurringPreview(): string {
    const isRecurring = this.sessionForm.get('recurring')?.value;
    if (!isRecurring) return '';

    const type = this.sessionForm.get('recurring_type')?.value;
    const startDate = this.sessionForm.get('schedule_date')?.value;
    const endDate = this.sessionForm.get('recurring_end_date')?.value;

    if (!type || !startDate || !endDate) return '';

    const typeLabels: { [key: string]: string } = {
      'daily': 'diariamente',
      'weekly': 'semanalmente',
      'biweekly': 'cada 2 semanas',
      'monthly': 'mensualmente'
    };

    const preview = this.generateRecurringSessions({
      ...this.sessionForm.value,
      schedule_date: startDate,
      recurring_end_date: endDate,
      recurring_type: type
    });

    return `Se crearán ${preview.length} sesiones ${typeLabels[type]} desde ${startDate} hasta ${endDate}`;
  }

  // Métodos auxiliares
  getClassTypeName(classTypeId: number): string {
    const classType = this.classTypes.find(ct => ct.id === classTypeId);
    return classType?.name || 'Clase';
  }

  getClassTypeColor(classTypeId: number): string {
    // Colores definidos en el frontend como parte del diseño de la UI
    const colorMap: { [key: number]: string } = {
      1: '#FF6B6B',  // Rojo coral - Barre
      2: '#4CAF50',  // Verde - Mat
      3: '#2196F3',  // Azul - Reformer
      4: '#9C27B0',  // Morado - Personalizada
      9: '#FF9800'   // Naranja - Funcional
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
