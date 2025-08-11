import { Component, OnInit, OnDestroy, ChangeDetectorRef, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { FullCalendarModule, FullCalendarComponent } from '@fullcalendar/angular';
import { CalendarOptions, EventClickArg, DateSelectArg, EventDropArg } from '@fullcalendar/core';
import { ClassSessionsService, ClassSession, Booking } from '../../services/class-sessions.service';
import { ClassTypesService, ClassType } from '../../services/class-types.service';
import { CarteraClasesService } from '../../services/cartera-clases.service';
import { Package, CreateUserPackage } from '../../models/cartera-clases';
import { SupabaseService } from '../../services/supabase.service';
import { FULLCALENDAR_OPTIONS } from '../../components/calendar/fullcalendar-config';
import { Subscription, forkJoin, firstValueFrom } from 'rxjs';

@Component({
  selector: 'app-admin-calendar',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, FullCalendarModule],
  templateUrl: './admin-calendar.component.html',
  styleUrls: ['./admin-calendar.component.css']
})
export class AdminCalendarComponent implements OnInit, OnDestroy {
  @ViewChild('calendar') calendarComponent!: FullCalendarComponent;
  
  calendarOptions: CalendarOptions;
  events: any[] = [];
  classTypes: ClassType[] = [];
  
  // Modal states
  showModal = false;
  isEditing = false;
  selectedSession: ClassSession | null = null;
  
  // Attendees management modal
  showAttendeesModal = false;
  sessionAttendees: any[] = []; // Cambiar a any[] para permitir estructura de Supabase con joins
  allUsers: any[] = [];
  searchTerm = '';
  selectedUserToAdd: any = null;
  showAddUserSection = false;
  attendeesLoading = false;
  
  // Add package modal
  showAddPackageModal = false;
  selectedUserForPackage: any = null;
  packageForm: FormGroup;
  packagesDisponibles: Package[] = [];
  
  // Form
  sessionForm: FormGroup;
  
  // UI states
  loading = false;
  error = '';
  successMessage = '';
  
  // Toast notification system
  showToast = false;
  toastMessage = '';
  toastType: 'success' | 'error' = 'success';
  
  // Calendar state preservation
  currentCalendarDate: Date | null = null;
  currentCalendarView: string | null = null;
  // Freeze updates while modal is open to avoid jumping back to 'Hoy'
  private freezeCalendarUpdates = false;
  private pendingEvents: any[] | null = null;
  
  private subscriptions: Subscription[] = [];

  constructor(
    private classSessionsService: ClassSessionsService,
    private classTypesService: ClassTypesService,
    private carteraService: CarteraClasesService,
    private supabaseService: SupabaseService,
    private fb: FormBuilder,
    private cdr: ChangeDetectorRef
  ) {
    this.sessionForm = this.fb.group({
      class_type_id: ['', Validators.required],
      schedule_date: ['', Validators.required],
      schedule_time: ['', Validators.required],
  // Capacidad por defecto; el límite máximo se ajusta dinámicamente según el tipo
  capacity: [8, [Validators.required, Validators.min(1), Validators.max(10)]], // se recalibra en onClassTypeChange
      recurring: [false],
      recurring_type: [''],
      recurring_end_date: ['']
    });

    this.packageForm = this.fb.group({
      package_id: ['', Validators.required],
      activation_date: ['']
    });

    // Configuración del calendario adaptada para admin
    this.calendarOptions = {
      ...FULLCALENDAR_OPTIONS,
      selectable: true,
      selectMirror: true,
      select: this.onDateSelect.bind(this),
      eventClick: this.onEventClick.bind(this),
      editable: true,
      eventDrop: this.onEventDrop.bind(this),
      eventResizableFromStart: false, // Deshabilitar redimensionado desde el inicio
      eventDurationEditable: false, // Deshabilitar edición de duración
      events: this.events,
      height: 'calc(100vh - 100px)', // Usar altura optimizada
      dayMaxEvents: false,
      moreLinkClick: 'popover',
      // Configuración para mostrar el título completo personalizado
      eventDisplay: 'block',
      displayEventTime: false, // Deshabilitar el formato automático de tiempo
      eventContent: this.renderEventContent.bind(this), // Usar renderizado personalizado
      headerToolbar: {
        left: 'prev,next today',
        center: 'title',
        right: 'dayGridMonth,timeGridWeek,timeGridDay'
      },
      buttonText: {
        today: 'Hoy',
        month: 'Mes',
        week: 'Semana',
        día: 'Día'
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
  // Preservar estado actual antes de recargar datos
  this.saveCalendarState();
    
    // Cargar tipos de clase, sesiones y paquetes en paralelo
    const classTypes$ = this.classTypesService.getAll();
    const startDate = new Date().toISOString().split('T')[0];
    const endDate = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const sessions$ = this.classSessionsService.getSessionsWithBookingCounts(startDate, endDate);
    const packages$ = this.carteraService.getPackages();
    
    const sub = forkJoin({
      classTypes: classTypes$,
      sessions: sessions$,
      packages: packages$
    }).subscribe({
      next: ({ classTypes, sessions, packages }) => {
        this.classTypes = classTypes;
        this.packagesDisponibles = packages;
        this.loadSessionsData(sessions);
        this.loading = false;
        this.cdr.detectChanges();
  // Restaurar estado después de cargar
  this.restoreCalendarState();
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
    // No mostrar loading si ya tenemos eventos (actualización en background)
    const hasEvents = this.events && this.events.length > 0;
    if (!hasEvents) {
      this.loading = true;
    }
  // Preservar estado actual antes de recargar sesiones
  this.saveCalendarState();
    
    // Usar la función optimizada que cuenta las reservas confirmadas
    const startDate = new Date().toISOString().split('T')[0]; // Fecha actual
    const endDate = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]; // 1 año hacia adelante
    
    const sub = this.classSessionsService.getSessionsWithBookingCounts(startDate, endDate).subscribe({
      next: (sessions: ClassSession[]) => {
        this.loadSessionsData(sessions);
        this.loading = false;
        this.cdr.detectChanges();
  // Restaurar estado tras la actualización
  this.restoreCalendarState();
      },
      error: (err: any) => {
        console.error('Error loading sessions:', err);
        this.showToastNotification('Error al cargar las sesiones', 'error');
        this.loading = false;
      }
    });
    this.subscriptions.push(sub);
  }

  private loadSessionsData(sessions: ClassSession[]) {
    this.events = sessions.map(session => {
      const bookingCount = session.bookings ? session.bookings.length : 0;
  const className = session.class_type_name || this.getClassTypeName(session.class_type_id);
      
      return {
        id: session.id.toString(),
        title: `${session.schedule_time} • ${className} • (${bookingCount}/${session.capacity})`,
        start: `${session.schedule_date}T${session.schedule_time}`,
  end: this.calculateEndTime(session.schedule_date, session.schedule_time, session.class_type_id),
        backgroundColor: this.getClassTypeColor(session.class_type_id),
        borderColor: this.getClassTypeColor(session.class_type_id),
        textColor: '#ffffff',
        extendedProps: {
          session: session,
          capacity: session.capacity,
          bookings: bookingCount
        }
      };
    });
  // Actualizar eventos sin perder la vista/fecha actual (o encolarlos si está congelado)
  this.setEventsPreservingOrQueue(this.events);
  }

  // Actualiza los eventos en el calendario preservando la vista (semana/día) y la fecha actual
  private applyEventsPreservingView(events: any[]) {
    try {
      const api = this.calendarComponent?.getApi?.();
      if (api) {
        const currentDate = api.getDate();
        api.removeAllEvents();
        for (const ev of events) api.addEvent(ev);
  // Restaurar inmediatamente la fecha
  if (currentDate) api.gotoDate(currentDate);
        this.cdr.detectChanges();
        return;
      }
    } catch (e) {
      console.warn('Fallo al aplicar eventos vía API, usando fallback de options:', e);
    }
    // Fallback: actualizar options (puede provocar scroll a hoy en algunos casos)
    this.calendarOptions = { ...this.calendarOptions, events: [...events] };
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
    // Abrir modal de gestión de asistentes en lugar de editar sesión
    const session = clickInfo.event.extendedProps['session'] as ClassSession;
  // Guardar estado antes de abrir el modal para evitar saltos de vista
  this.saveCalendarState();
  // Congelar actualizaciones del calendario mientras el modal esté abierto
  this.freezeCalendarUpdates = true;
    this.openAttendeesModal(session);
  }

  renderEventContent(eventInfo: any) {
    // Renderizado personalizado para mostrar el título completo
    return {
      html: `<div class="custom-event-content">${eventInfo.event.title}</div>`
    };
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
  // Asegurar que los validadores de capacidad respeten el tipo seleccionado
  this.onClassTypeChange();
    
    // Si el modal de asistentes está abierto, cerrarlo primero
    if (this.showAttendeesModal) {
      this.showAttendeesModal = false;
      // Pequeño delay para evitar conflictos de z-index
      setTimeout(() => {
        this.showModal = true;
      }, 100);
    } else {
      this.showModal = true;
    }
    
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
          // Refrescar solo el evento afectado en el calendario
          const updatedId = this.selectedSession!.id;
          const idx = this.events.findIndex(e => e.id === String(updatedId));
          if (idx !== -1) {
            const s = { ...this.events[idx].extendedProps.session, ...updateData };
            this.events[idx].extendedProps.session = s;
            const currentBookings = this.events[idx].extendedProps.bookings ?? 0;
            this.updateCalendarEventCounts(updatedId, currentBookings);
          } else {
            // Si no está cargado, como fallback recargar sesiones
            this.loadSessions();
          }
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
      next: (created: any) => {
        this.successMessage = 'Sesión creada correctamente';
        this.closeModal();
        // Añadir el evento al calendario sin recargar todo
        const createdSession = Array.isArray(created) ? created[0] : created;
        if (createdSession && createdSession.id) {
          const bookingCount = 0;
          const classTypeId = createdSession.class_type_id;
          const className = this.getClassTypeName(classTypeId);
          const start = `${createdSession.schedule_date}T${createdSession.schedule_time}`;
          const end = this.calculateEndTime(createdSession.schedule_date, createdSession.schedule_time, classTypeId);
          const color = this.getClassTypeColor(classTypeId);
          const event = {
            id: String(createdSession.id),
            title: `${createdSession.schedule_time} • ${className} • (${bookingCount}/${createdSession.capacity})`,
            start,
            end,
            backgroundColor: color,
            borderColor: color,
            textColor: '#ffffff',
            extendedProps: {
              session: createdSession,
              capacity: createdSession.capacity,
              bookings: bookingCount
            }
          };
          this.events = [...this.events, event];
          this.applyEventsPreservingView(this.events);
        } else {
          // Fallback: recargar sesiones para incluir la nueva
          this.loadSessions();
        }
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

    // Crear todas las sesiones en secuencia e ir agregándolas al calendario sin reload
    sessions.forEach((sessionReq, index) => {
      const sub = this.classSessionsService.createSession(sessionReq).subscribe({
        next: (created: any) => {
          // Añadir el evento recién creado de inmediato
          const createdSession = Array.isArray(created) ? created[0] : created;
          if (createdSession && createdSession.id) {
            const bookingCount = 0;
            const classTypeId = createdSession.class_type_id;
            const className = this.getClassTypeName(classTypeId);
            const start = `${createdSession.schedule_date}T${createdSession.schedule_time}`;
            const end = this.calculateEndTime(createdSession.schedule_date, createdSession.schedule_time, classTypeId);
            const color = this.getClassTypeColor(classTypeId);
            const event = {
              id: String(createdSession.id),
              title: `${createdSession.schedule_time} • ${className} • (${bookingCount}/${createdSession.capacity})`,
              start,
              end,
              backgroundColor: color,
              borderColor: color,
              textColor: '#ffffff',
              extendedProps: {
                session: createdSession,
                capacity: createdSession.capacity,
                bookings: bookingCount
              }
            };
            this.events = [...this.events, event];
            this.applyEventsPreservingView(this.events);
          }

          createdCount++;
          if (createdCount === totalSessions) {
            this.successMessage = `${createdCount} sesiones recurrentes creadas correctamente`;
            this.closeModal();
            this.loading = false;
          }
        },
        error: (err: any) => {
          console.error(`Error creating session ${index + 1}:`, err);
          createdCount++;
          if (createdCount === totalSessions) {
            this.error = `Se crearon ${createdCount - 1} sesiones. Algunas no se pudieron crear.`;
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
        // Quitar el evento del calendario local si existe
        const removedId = this.selectedSession!.id;
        const before = this.events.length;
        this.events = this.events.filter(e => e.id !== String(removedId));
        if (this.events.length !== before) {
          this.applyEventsPreservingView(this.events);
        } else {
          this.loadSessions();
        }
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
  // Establecer capacidad por defecto según el tipo seleccionado
  this.sessionForm.patchValue({ capacity });

  // Ajustar validadores para respetar el máximo por tipo
  const capacityControl = this.sessionForm.get('capacity');
  capacityControl?.setValidators([Validators.required, Validators.min(1), Validators.max(capacity)]);
  capacityControl?.updateValueAndValidity();

  console.log(`Capacidad automática establecida: ${capacity} para ${this.getClassTypeName(classTypeId)}`);
    }
  }

  getClassTypeCapacity(classTypeId: number): number {
    // Capacidades por defecto según el tipo de clase
    // La capacidad real se establece individualmente en cada class_session
    const capacityMap: { [key: number]: number } = {
  1: 2,   // Barre
  2: 8,   // Mat
  3: 2,   // Reformer
  4: 1,   // Mat Personalizada
  9: 10,  // Funcional
  22: 1,  // Funcional Personalizada
  23: 1   // Reformer Personalizada
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
  4: '#9C27B0',  // Morado - Mat Personalizada
  9: '#FF9800',  // Naranja - Funcional
  22: '#8BC34A', // Verde claro - Funcional Personalizada
  23: '#00BCD4'  // Cian - Reformer Personalizada
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

  // ==============================================
  // SISTEMA DE NOTIFICACIONES TOAST
  // ==============================================

  showToastNotification(message: string, type: 'success' | 'error' = 'success') {
    this.toastMessage = message;
    this.toastType = type;
    this.showToast = true;
    
    // Auto-ocultar después de 3 segundos
    setTimeout(() => {
      this.hideToast();
    }, 3000);
  }

  hideToast() {
    this.showToast = false;
    setTimeout(() => {
      this.toastMessage = '';
    }, 300); // Esperar a que termine la animación
  }

  // ==============================================
  // PRESERVACIÓN DE ESTADO DEL CALENDARIO
  // ==============================================

  private saveCalendarState() {
    if (this.calendarComponent && this.calendarComponent.getApi) {
      const calendarApi = this.calendarComponent.getApi();
      this.currentCalendarDate = calendarApi.getDate();
      this.currentCalendarView = calendarApi.view.type;
      console.log('Estado del calendario guardado:', {
        date: this.currentCalendarDate,
        view: this.currentCalendarView
      });
    }
  }

  private restoreCalendarState() {
    if (this.currentCalendarDate && this.calendarComponent) {
      setTimeout(() => {
        try {
          const calendarApi = this.calendarComponent.getApi();
          
          // Restaurar la vista si es diferente a la actual
          if (this.currentCalendarView && calendarApi.view.type !== this.currentCalendarView) {
            calendarApi.changeView(this.currentCalendarView);
          }
          
          // Restaurar la fecha (verificar que no sea null)
          if (this.currentCalendarDate) {
            calendarApi.gotoDate(this.currentCalendarDate);
          }
          
          console.log('Estado del calendario restaurado:', {
            date: this.currentCalendarDate,
            view: this.currentCalendarView
          });
        } catch (error) {
          console.warn('Error restaurando estado del calendario:', error);
        }
      }, 300); // Aumentar timeout para asegurar que el calendario esté completamente cargado
    }
  }

  // ==============================================
  // CONTROL DE ACTUALIZACIONES (FREEZE/QUEUE)
  // ==============================================

  private setEventsPreservingOrQueue(events: any[]) {
    if (this.freezeCalendarUpdates) {
      this.pendingEvents = [...events];
      return;
    }
    this.applyEventsPreservingView(events);
  }

  private applyPendingIfAny() {
    if (this.pendingEvents) {
      const toApply = [...this.pendingEvents];
      this.pendingEvents = null;
      this.applyEventsPreservingView(toApply);
    }
  }

  // ==============================================
  // GESTIÓN DE ASISTENTES
  // ==============================================

  async openAttendeesModal(session: ClassSession) {
    this.selectedSession = session;
    this.showAttendeesModal = true;
  this.attendeesLoading = true;
    this.clearMessages();
    
    try {
      // Cargar asistentes de la sesión
      await this.loadSessionAttendees(session.id);
      // Cargar todos los usuarios para poder añadir nuevos
      await this.loadAllUsers();
    } catch (error: any) {
      console.error('Error loading attendees:', error);
      this.error = 'Error al cargar los asistentes';
    } finally {
      this.attendeesLoading = false;
      // Mantener calendario congelado mientras el modal esté visible
    }
  }

  async loadSessionAttendees(sessionId: number) {
    const { data, error } = await this.supabaseService.supabase
      .from('bookings')
      .select(`
        *,
        users (
          id,
          name,
          surname,
          email
        )
      `)
      .eq('class_session_id', sessionId)
      .eq('status', 'CONFIRMED');

    if (error) {
      throw error;
    }

    console.log(`Cargados ${data?.length || 0} asistentes para sesión ${sessionId}`);
    if (data && data.length > 0) {
      console.log('Estructura primer booking:', {
        user_id: data[0].user_id,
        users: data[0].users,
        hasUsers: !!data[0].users
      });
    }

    this.sessionAttendees = data || [];
    
    // Actualizar también la sesión seleccionada con el conteo real
    if (this.selectedSession) {
      this.selectedSession.bookings = this.sessionAttendees;
      // Refrescar contador del evento en el calendario
      this.updateCalendarEventCounts(this.selectedSession.id, this.sessionAttendees.length);
    }
  }

  async loadAllUsers() {
    const { data, error } = await this.supabaseService.getValidUsers();
    if (error) {
      throw error;
    }
    this.allUsers = data || [];
  }

  get filteredUsers() {
    if (!this.searchTerm) return this.allUsers;
    
    return this.allUsers.filter(user => 
      user.name?.toLowerCase().includes(this.searchTerm.toLowerCase()) ||
      user.surname?.toLowerCase().includes(this.searchTerm.toLowerCase()) ||
      user.email?.toLowerCase().includes(this.searchTerm.toLowerCase())
    );
  }

  get availableUsers() {
    const attendeeUserIds = this.sessionAttendees.map(booking => booking.user_id);
    return this.filteredUsers.filter(user => !attendeeUserIds.includes(user.id));
  }

  async removeAttendee(booking: any) {
    // Acceder correctamente a la estructura de datos de Supabase
    const userName = booking.users?.name || 'Usuario';
    
    console.log('Intentando eliminar booking:', {
      bookingId: booking.id,
      userId: booking.user_id,
      userName: userName,
      status: booking.status
    });
    
    if (!confirm(`¿Estás seguro de que quieres eliminar a ${userName} de esta clase?`)) {
      return;
    }

    this.loading = true;
    try {
      // Cancelar la reserva usando el método mejorado
  const result = await firstValueFrom(this.classSessionsService.cancelBooking(booking.id, booking.user_id));
      
      console.log('Resultado de cancelación:', result);
      
      // Mostrar notificación inmediatamente
      this.showToastNotification(`${userName} eliminado correctamente. Bono devuelto.`, 'success');
      
      // Actualizar UI local inmediatamente - remover de la lista
      this.sessionAttendees = this.sessionAttendees.filter(attendee => attendee.id !== booking.id);
      
      // ACTUALIZAR también el evento en el calendario local para UI inmediata
      this.updateCalendarEventCounts(this.selectedSession!.id, this.sessionAttendees.length);
      
      // Recargar asistentes desde la BD de forma asíncrona para confirmar
      setTimeout(async () => {
        await this.loadSessionAttendees(this.selectedSession!.id);
      }, 100);
      
    } catch (error: any) {
      console.error('Error removing attendee:', error);
      console.error('Booking data:', booking);
      this.showToastNotification(error.message || 'Error al eliminar asistente', 'error');
    } finally {
      this.loading = false;
    }
  }

  async addAttendee(user: any) {
    if (!this.selectedSession) return;

    this.loading = true;
    try {
      // VERIFICAR PRIMERO: No permitir duplicados
      const { data: existingBooking, error: checkError } = await this.supabaseService.supabase
        .from('bookings')
        .select('id')
        .eq('user_id', user.id)
        .eq('class_session_id', this.selectedSession.id)
        .eq('status', 'CONFIRMED')
        .maybeSingle();

      if (checkError) {
        throw new Error(`Error verificando reserva existente: ${checkError.message}`);
      }

      if (existingBooking) {
        this.error = `${user.name} ya está inscrito en esta clase`;
        this.loading = false;
        return;
      }

      // VERIFICAR CAPACIDAD: No exceder límite - Calcular desde la BD
      const { data: currentBookingsData, error: countError } = await this.supabaseService.supabase
        .from('bookings')
        .select('id', { count: 'exact' })
        .eq('class_session_id', this.selectedSession.id)
        .eq('status', 'CONFIRMED');

      if (countError) {
        throw new Error(`Error verificando capacidad: ${countError.message}`);
      }

      const currentBookingsCount = currentBookingsData?.length || 0;
      if (currentBookingsCount >= this.selectedSession.capacity) {
        this.error = `La clase está completa (${currentBookingsCount}/${this.selectedSession.capacity})`;
        this.loading = false;
        return;
      }

      // Verificar si el usuario tiene bono para este tipo de clase
      const classTypeName = this.getClassTypeName(this.selectedSession.class_type_id);
      const hasPackage = await this.checkUserHasPackage(user.id, this.selectedSession.class_type_id);

      if (!hasPackage) {
        // Mostrar opción para añadir bono
        const shouldAddPackage = confirm(
          `${user.name} no tiene un bono para clases de ${classTypeName}. ¿Quieres añadir un bono primero?`
        );

        if (shouldAddPackage) {
          // Abrir modal para añadir bono
          this.openAddPackageModal(user, classTypeName);
          return;
        } else {
          this.error = 'No se puede añadir al usuario sin un bono válido';
          this.loading = false;
          return;
        }
      }

      // MÉTODO MEJORADO: Usar función SQL atómica para validaciones
      const { data: result, error: functionError } = await this.supabaseService.supabase
        .rpc('create_booking_with_validations', {
          p_user_id: user.id,
          p_class_session_id: this.selectedSession.id,
          p_booking_date_time: new Date().toISOString()
        });

      if (functionError) {
        console.warn('Función SQL no disponible, usando método manual:', functionError);
        
        // FALLBACK: Método manual si la función no existe aún
        await this.createBookingManuallyFallback(user);
        return;
      }

      const bookingResult = result[0];
      if (!bookingResult.success) {
        throw new Error(bookingResult.message);
      }

      // Obtener la reserva completa con información del usuario
      const { data: bookingData, error: bookingDataError } = await this.supabaseService.supabase
        .rpc('get_booking_with_user', {
          p_booking_id: bookingResult.booking_id
        });

      if (bookingDataError || !bookingData || bookingData.length === 0) {
        console.warn('No se pudo obtener datos completos, recargando asistentes...');
      } else {
      // AGREGAR inmediatamente el usuario a la lista local para UI inmediata
      const completeBooking = bookingData[0];
      const newBooking: any = {
        id: completeBooking.id,
        user_id: completeBooking.user_id,
        class_session_id: completeBooking.class_session_id,
        booking_date_time: completeBooking.booking_date_time,
        status: completeBooking.status,
        cancellation_time: completeBooking.cancellation_time || '',
        users: {  // Usar 'users' (plural) para consistencia con Supabase
          name: completeBooking.user_name,
          surname: completeBooking.user_surname,
          email: completeBooking.user_email
        }
      };
      
      // Agregar a la lista local inmediatamente
      this.sessionAttendees.push(newBooking);
    }
    
    // Mostrar notificación inmediatamente
    this.showToastNotification(`${user.name} añadido correctamente a la clase`, 'success');
    
    // ACTUALIZAR también el evento en el calendario local para UI inmediata
    this.updateCalendarEventCounts(this.selectedSession.id, this.sessionAttendees.length);
    
    // Recargar asistentes desde la BD de forma asíncrona para confirmar
    setTimeout(async () => {
      if (this.selectedSession) {
        await this.loadSessionAttendees(this.selectedSession.id);
      }
    }, 100);
    
    // Resetear búsqueda
    this.searchTerm = '';
    this.showAddUserSection = false;
    
    } catch (error: any) {
      console.error('Error adding attendee:', error);
      this.showToastNotification(error.message || 'Error al añadir asistente', 'error');
    } finally {
      this.loading = false;
    }
  }

  async checkUserHasPackage(userId: number, classTypeId: number): Promise<boolean> {
    try {
      const { data, error } = await this.supabaseService.supabase
        .from('user_packages')
        .select('*')
        .eq('user_id', userId)
        .eq('status', 'active')
        .gt('current_classes_remaining', 0);

      if (error || !data) return false;

      // Verificar si tiene paquetes compatibles con el tipo de clase
      const hasCompatiblePackage = data.some(userPkg => {
        // Aquí deberíamos verificar si el paquete es compatible
        // Por ahora asumimos que cualquier paquete activo sirve
        return true;
      });

      return hasCompatiblePackage;
    } catch (error) {
      console.error('Error checking user package:', error);
      return false;
    }
  }

  toggleAddUserSection() {
    this.showAddUserSection = !this.showAddUserSection;
    if (this.showAddUserSection) {
      this.searchTerm = '';
    }
  }

  closeAttendeesModal() {
    this.showAttendeesModal = false;
    this.selectedSession = null;
    this.sessionAttendees = [];
    this.searchTerm = '';
    this.showAddUserSection = false;
    this.clearMessages();
  // Descongelar y aplicar actualizaciones pendientes preservando la vista actual
  this.freezeCalendarUpdates = false;
  this.applyPendingIfAny();
  }

  // ==============================================
  // GESTIÓN DEL MODAL DE PAQUETES
  // ==============================================

  openAddPackageModal(user: any, classTypeName: string) {
    this.selectedUserForPackage = user;
    this.showAddPackageModal = true;
    
    // Establecer fecha de activación para el día de la clase
    const activationDate = this.selectedSession?.schedule_date || new Date().toISOString().split('T')[0];
    this.packageForm.patchValue({
      activation_date: activationDate
    });
    
    this.clearMessages();
  }

  closeAddPackageModal() {
    this.showAddPackageModal = false;
    this.selectedUserForPackage = null;
    this.packageForm.reset();
    this.clearMessages();
  }

  async addPackageToUser() {
    if (this.packageForm.invalid || !this.selectedUserForPackage) {
      return;
    }

    this.loading = true;
    try {
      const formData = this.packageForm.value;
      
      const createData: CreateUserPackage = {
        user_id: this.selectedUserForPackage.id,
        package_id: formData.package_id,
        activation_date: formData.activation_date || null
      };

  await firstValueFrom(this.carteraService.agregarPackageAUsuario(createData));
      
      this.successMessage = `Bono añadido correctamente a ${this.selectedUserForPackage.name}`;
      
      // Guardar referencia del usuario antes de cerrar modal
      const userToAdd = this.selectedUserForPackage;
      
      // Cerrar modal de paquetes
      this.closeAddPackageModal();
      
      // Intentar añadir al usuario a la clase ahora que tiene bono
      if (this.selectedSession && userToAdd) {
        await this.addAttendeeWithPackage(userToAdd);
      }
      
    } catch (error: any) {
      console.error('Error adding package:', error);
      this.error = error.message || 'Error al añadir el bono';
    } finally {
      this.loading = false;
    }
  }

  async addAttendeeWithPackage(user: any) {
    if (!this.selectedSession) return;

    try {
      // MÉTODO MEJORADO: Usar función SQL atómica para validaciones
      const { data: result, error: functionError } = await this.supabaseService.supabase
        .rpc('create_booking_with_validations', {
          p_user_id: user.id,
          p_class_session_id: this.selectedSession.id,
          p_booking_date_time: new Date().toISOString()
        });

      if (functionError) {
        console.warn('Función SQL no disponible, usando método manual:', functionError);
        
        // FALLBACK: Método manual si la función no existe aún
        await this.addAttendeeWithPackageFallback(user);
        return;
      }

      const bookingResult = result[0];
      if (!bookingResult.success) {
        throw new Error(bookingResult.message);
      }

      // Obtener la reserva completa con información del usuario
      const { data: bookingData, error: bookingDataError } = await this.supabaseService.supabase
        .rpc('get_booking_with_user', {
          p_booking_id: bookingResult.booking_id
        });

      if (bookingDataError || !bookingData || bookingData.length === 0) {
        console.warn('No se pudo obtener datos completos, recargando asistentes...');
      } else {
        // AGREGAR inmediatamente el usuario a la lista local para UI inmediata
        const completeBooking = bookingData[0];
        const newBooking: Booking = {
          id: completeBooking.id,
          user_id: completeBooking.user_id,
          class_session_id: completeBooking.class_session_id,
          booking_date_time: completeBooking.booking_date_time,
          status: completeBooking.status,
          cancellation_time: completeBooking.cancellation_time || '',
          user: {
            name: completeBooking.user_name,
            surname: completeBooking.user_surname,
            email: completeBooking.user_email
          }
        };
        
        // Agregar a la lista local inmediatamente
        this.sessionAttendees.push(newBooking);
      }
      
      this.successMessage = `${user.name} añadido correctamente a la clase con su nuevo bono`;
      
      // ACTUALIZAR también el evento en el calendario local para UI inmediata
      this.updateCalendarEventCounts(this.selectedSession.id, this.sessionAttendees.length);
      
      // Recargar asistentes desde la BD de forma asíncrona para confirmar
      setTimeout(async () => {
        if (this.selectedSession) {
          await this.loadSessionAttendees(this.selectedSession.id);
        }
      }, 100);
      
      // Resetear búsqueda
      this.searchTerm = '';
      this.showAddUserSection = false;
      
    } catch (error: any) {
      console.error('Error adding attendee with package:', error);
      this.error = error.message || 'Error al añadir asistente';
    }
  }

  getPackagesByClassType(classTypeName: string): Package[] {
    // Mapear el nombre de la clase al ID del tipo de clase
    const typeMapping: { [key: string]: number } = {
      'Barre': 1,
      'Mat': 2,
      'Reformer': 3,
      'Mat Personalizada': 4,
      'Funcional': 9,
      'Funcional Personalizada': 22,
      'Reformer Personalizada': 23
    };

    const classTypeId = typeMapping[classTypeName];
    if (!classTypeId) return [];

    return this.packagesDisponibles.filter(pkg => {
      // Filtrar paquetes según el tipo de clase
      if (classTypeId === 1) { // Barre
        return pkg.class_type === 1 || pkg.class_type === 2; // Barre puede usar MAT_FUNCIONAL también
      } else if (classTypeId === 2) { // Mat
        return pkg.class_type === 2;
      } else if (classTypeId === 9) { // Funcional
        return pkg.class_type === 2; // Funcional usa MAT_FUNCIONAL
      } else if (classTypeId === 3) { // Reformer
        return pkg.class_type === 3;
      } else if (classTypeId === 4) { // Mat Personalizada
        return pkg.is_personal === true; // Paquetes personales
      } else if (classTypeId === 22) { // Funcional Personalizada
        return pkg.is_personal === true; // Paquetes personales
      } else if (classTypeId === 23) { // Reformer Personalizada
        return pkg.is_personal === true; // Paquetes personales
      }
      return false;
    });
  }

  getCurrentDate(): string {
    return new Date().toISOString().split('T')[0];
  }

  // ==============================================
  // MÉTODO FALLBACK PARA RESERVAS MANUALES
  // ==============================================

  private async createBookingManuallyFallback(user: any) {
    if (!this.selectedSession) return;

    // MÉTODO TEMPORAL: Crear reserva e actualizar paquete manualmente
    // 1. Primero, obtener el paquete activo del usuario
    const { data: userPackages, error: packageQueryError } = await this.supabaseService.supabase
      .from('user_packages')
      .select('*')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .gt('current_classes_remaining', 0)
      .order('purchase_date', { ascending: true })
      .limit(1);

    if (packageQueryError || !userPackages || userPackages.length === 0) {
      throw new Error('Usuario no tiene bonos disponibles');
    }

    const userPackage = userPackages[0];

    // 2. Crear la reserva
    const { data: bookingData, error: bookingError } = await this.supabaseService.supabase
      .from('bookings')
      .insert({
        user_id: user.id,
        class_session_id: this.selectedSession.id,
        booking_date_time: new Date().toISOString(),
        status: 'CONFIRMED',
        is_from_package: true,
        cancellation_time: null,
        payment_id: null
      });

    if (bookingError) {
      throw new Error(`Error creando reserva: ${bookingError.message}`);
    }

    // 3. Actualizar el paquete del usuario
    const newClassesRemaining = userPackage.current_classes_remaining - 1;
    const newClassesUsed = userPackage.classes_used_this_month + 1;
    const newStatus = newClassesRemaining <= 0 ? 'expired' : 'active';

    const { error: packageUpdateError } = await this.supabaseService.supabase
      .from('user_packages')
      .update({
        current_classes_remaining: newClassesRemaining,
        classes_used_this_month: newClassesUsed,
        status: newStatus
      })
      .eq('id', userPackage.id);

    if (packageUpdateError) {
      console.warn('Warning: No se pudo actualizar el paquete automáticamente:', packageUpdateError);
    }

    // AGREGAR inmediatamente el usuario a la lista local para UI inmediata
    const newBooking: Booking & { users?: { name: string; surname: string; email: string } } = {
      id: Date.now(), // ID temporal
      user_id: user.id,
      class_session_id: this.selectedSession.id,
      booking_date_time: new Date().toISOString(),
      status: 'CONFIRMED',
      cancellation_time: '', // String vacío en lugar de null
      user: {
        name: user.name,
        surname: user.surname,
        email: user.email
      },
      // Duplicamos en 'users' para coincidir con la forma del join de Supabase y evitar UI nulls
      users: {
        name: user.name,
        surname: user.surname,
        email: user.email
      }
    };

    // Agregar a la lista local inmediatamente
    this.sessionAttendees.push(newBooking);

    this.successMessage = `${user.name} añadido correctamente a la clase`;

    // Actualizar contador del evento inmediatamente (sin recargar todo el calendario)
    this.updateCalendarEventCounts(this.selectedSession.id, this.sessionAttendees.length);

    // Recargar asistentes desde la BD para confirmar (sin recargar todo el calendario)
    await this.loadSessionAttendees(this.selectedSession.id);
  }

  private async addAttendeeWithPackageFallback(user: any) {
    if (!this.selectedSession) return;

    // MÉTODO TEMPORAL: Crear reserva e actualizar paquete manualmente
    // 1. Primero, obtener el paquete activo del usuario
    const { data: userPackages, error: packageQueryError } = await this.supabaseService.supabase
      .from('user_packages')
      .select('*')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .gt('current_classes_remaining', 0)
      .order('purchase_date', { ascending: true })
      .limit(1);

    if (packageQueryError || !userPackages || userPackages.length === 0) {
      throw new Error('Usuario no tiene bonos disponibles');
    }

    const userPackage = userPackages[0];

    // 2. Crear la reserva
    const { data: bookingData, error: bookingError } = await this.supabaseService.supabase
      .from('bookings')
      .insert({
        user_id: user.id,
        class_session_id: this.selectedSession.id,
        booking_date_time: new Date().toISOString(),
        status: 'CONFIRMED',
        is_from_package: true,
        cancellation_time: null,
        payment_id: null
      });

    if (bookingError) {
      throw new Error(`Error creando reserva: ${bookingError.message}`);
    }

    // 3. Actualizar el paquete del usuario
    const newClassesRemaining = userPackage.current_classes_remaining - 1;
    const newClassesUsed = userPackage.classes_used_this_month + 1;
    const newStatus = newClassesRemaining <= 0 ? 'expired' : 'active';

    const { error: packageUpdateError } = await this.supabaseService.supabase
      .from('user_packages')
      .update({
        current_classes_remaining: newClassesRemaining,
        classes_used_this_month: newClassesUsed,
        status: newStatus
      })
      .eq('id', userPackage.id);

    if (packageUpdateError) {
      console.warn('Warning: No se pudo actualizar el paquete automáticamente:', packageUpdateError);
    }

    // AGREGAR inmediatamente el usuario a la lista local para UI inmediata
    const newBooking: Booking & { users?: { name: string; surname: string; email: string } } = {
      id: Date.now(), // ID temporal
      user_id: user.id,
      class_session_id: this.selectedSession.id,
      booking_date_time: new Date().toISOString(),
      status: 'CONFIRMED',
      cancellation_time: '', // String vacío en lugar de null
      user: {
        name: user.name,
        surname: user.surname,
        email: user.email
      },
      users: {
        name: user.name,
        surname: user.surname,
        email: user.email
      }
    };

    // Agregar a la lista local inmediatamente
    this.sessionAttendees.push(newBooking);

    this.successMessage = `${user.name} añadido correctamente a la clase con su nuevo bono`;

    // Actualizar contador del evento inmediatamente
    this.updateCalendarEventCounts(this.selectedSession.id, this.sessionAttendees.length);

    // Recargar asistentes desde la BD para confirmar (sin recargar todo el calendario)
    await this.loadSessionAttendees(this.selectedSession.id);
    
    // Resetear búsqueda
    this.searchTerm = '';
    this.showAddUserSection = false;
  }

  // ==============================================
  // MÉTODO PARA MOVER EVENTOS (DRAG & DROP)
  // ==============================================

  async onEventDrop(dropInfo: EventDropArg) {
  // Variables para poder revertir el estado local en caso de error
  let originalDateStr = '';
  let originalTimeStr = '';
    try {
      const sessionId = parseInt(dropInfo.event.id);
      const newDate = dropInfo.event.start;
      
      if (!newDate) {
        console.error('Nueva fecha no válida');
        dropInfo.revert();
        return;
      }

      // Guardar estado del calendario ANTES de cualquier operación
      this.saveCalendarState();

      // Obtener datos del evento original
      const originalEvent = this.events.find(event => event.id === sessionId.toString());
      if (!originalEvent) {
        console.error('No se encontró el evento original');
        dropInfo.revert();
        return;
      }

  // Guardar valores originales para posible revert local
  originalDateStr = originalEvent.extendedProps.session.schedule_date;
  originalTimeStr = originalEvent.extendedProps.session.schedule_time;

      // Formatear la nueva fecha en formato YYYY-MM-DD (sin problemas de zona horaria)
      const year = newDate.getFullYear();
      const month = (newDate.getMonth() + 1).toString().padStart(2, '0');
      const day = newDate.getDate().toString().padStart(2, '0');
      const formattedDate = `${year}-${month}-${day}`;

      // Formatear la nueva hora en formato HH:MM (asegurándonos de que esté en formato correcto)
      const hours = newDate.getHours().toString().padStart(2, '0');
      const minutes = newDate.getMinutes().toString().padStart(2, '0');
      const formattedTime = `${hours}:${minutes}`;

      console.log('=== DATOS DEL MOVIMIENTO ===');
      console.log('Session ID:', sessionId);
      console.log('Fecha original:', originalEvent.extendedProps.session.schedule_date);
      console.log('Hora original:', originalEvent.extendedProps.session.schedule_time);
      console.log('Nueva fecha formateada:', formattedDate);
      console.log('Nueva hora formateada:', formattedTime);

      // Actualizar el evento local INMEDIATAMENTE para UI responsive
      const eventIndex = this.events.findIndex(event => event.id === sessionId.toString());
      if (eventIndex !== -1) {
  // Actualizar todas las propiedades del evento
  this.events[eventIndex].start = dropInfo.event.start;
  // Recalcular end según duración de la clase tras el cambio
  const session = this.events[eventIndex].extendedProps.session;
  const newEndIso = this.calculateEndTime(formattedDate, formattedTime, session.class_type_id);
  this.events[eventIndex].end = newEndIso;
        
        // Actualizar también los datos internos de la sesión
        this.events[eventIndex].extendedProps.session.schedule_date = formattedDate;
        this.events[eventIndex].extendedProps.session.schedule_time = formattedTime;
        
  // Refrescar SOLO este evento (título con la nueva hora y conteo actual)
  const currentBookings = this.events[eventIndex].extendedProps.bookings ?? 0;
  this.updateCalendarEventCounts(sessionId, currentBookings);
        
        console.log('Evento local actualizado inmediatamente');
      }

      // Mostrar notificación de éxito INMEDIATAMENTE
      this.showToastNotification('Moviendo evento...', 'success');

      // Llamar al servicio para actualizar la sesión en la base de datos
      const updateData = {
        schedule_date: formattedDate,
        schedule_time: formattedTime
      };

      console.log('Actualizando en BD:', updateData);

  const result = await firstValueFrom(this.classSessionsService.updateSession(sessionId, updateData));

      console.log('Resultado de la actualización:', result);

      const ok = (Array.isArray(result) && result.length > 0)
        || (!!result && (result.success === true || typeof result === 'object'));
      if (ok) {
        console.log('Sesión actualizada exitosamente en BD');
        
        // Actualizar notificación de éxito
        this.showToastNotification('Evento movido exitosamente', 'success');
        
  // NO recargar todo el calendario - mantener la vista actual
  // Actualizar usando API para preservar vista/fecha
  this.applyEventsPreservingView(this.events);
        
  } else {
        throw new Error('La actualización no devolvió datos válidos');
      }

    } catch (error: any) {
      console.error('=== ERROR AL MOVER EVENTO ===');
      console.error('Error completo:', error);
      console.error('Mensaje:', error.message);
      
      // Mostrar notificación de error
      this.showToastNotification(`Error al mover el evento: ${error.message}`, 'error');
      
      // Revertir cambios locales en el modelo
      try {
        const eventIndex = this.events.findIndex(e => e.id === dropInfo.event.id);
        if (eventIndex !== -1) {
          // Restaurar fecha/hora originales en el modelo
          this.events[eventIndex].extendedProps.session.schedule_date = originalDateStr;
          this.events[eventIndex].extendedProps.session.schedule_time = originalTimeStr;
          // Refrescar título con hora original
          const currentBookings = this.events[eventIndex].extendedProps.bookings ?? 0;
          this.updateCalendarEventCounts(parseInt(dropInfo.event.id), currentBookings);
        }
      } catch {}

      dropInfo.revert(); // Revertir el cambio visual si hay error
    }
  }

  // ==============================================
  // MÉTODO PARA ACTUALIZAR CONTADORES EN TIEMPO REAL
  // ==============================================

  private updateCalendarEventCounts(sessionId: number, bookingCount: number) {
    // Encontrar y actualizar el evento en el calendario local
    const eventIndex = this.events.findIndex(event => event.id === sessionId.toString());
    if (eventIndex !== -1) {
      const session = this.events[eventIndex].extendedProps.session;
      const classTypeName = this.getClassTypeName(session.class_type_id);
      const capacity = `${bookingCount}/${session.capacity}`;
      
      // Actualizar el título del evento con formato simple
      this.events[eventIndex].title = `${session.schedule_time} • ${classTypeName} • (${capacity})`;
      this.events[eventIndex].extendedProps.bookings = bookingCount;
      
      // Actualizar solo ese evento a través de la API para evitar recarga completa
      try {
        const api = this.calendarComponent?.getApi?.();
        if (api) {
          const fcEvent = api.getEventById(sessionId.toString());
          if (fcEvent) {
            fcEvent.setProp('title', this.events[eventIndex].title);
          } else {
            this.applyEventsPreservingView(this.events);
          }
        } else {
          this.applyEventsPreservingView(this.events);
        }
      } catch {
        this.applyEventsPreservingView(this.events);
      }
    }
  }
}
