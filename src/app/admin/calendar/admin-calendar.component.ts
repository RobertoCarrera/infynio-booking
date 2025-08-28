import { Component, OnInit, AfterViewInit, OnDestroy, ChangeDetectorRef, ViewChild } from '@angular/core';
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
export class AdminCalendarComponent implements OnInit, AfterViewInit, OnDestroy {
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
  packagePreselected = false;
  
  // Form
  sessionForm: FormGroup;
  
  // UI states
  loading = false;
  error = '';
  successMessage = '';
  // Package availability check for personal sessions
  selectedUserHasValidPackage: boolean | null = null; // null = unknown/not-checked, true/false = result
  checkingPackageAvailability = false;
  // If user has any package but none matching the session month
  selectedUserHasPackageButNotForMonth = false;
  
  // Toast notification system
  showToast = false;
  toastMessage = '';
  toastType: 'success' | 'error' = 'success';
  
  // Background progress for bulk (recurring) creation
  bulkActive = false;
  bulkTotal = 0;
  bulkDone = 0;
  bulkErrors = 0;
  bulkStartedAt: number | null = null;
  // Sync with calendar rendering so progress doesn't hit 100% too early
  private calendarIsLoading = false;
  private awaitingBulkSync = false;
  // Render tick state (lightweight animation until eventsSet)
  private _renderTickStart: number | null = null;
  private _renderTickElapsed: number = 0;
  private renderTick: any = null;
  // Fake smooth progress animation (preferred UX)
  private fakeProgress = 0; // 0..100 displayed
  private fakeTimer: any = null;
  get bulkPercent(): number {
    if (!this.bulkActive) return 0;
    return Math.round(Math.max(0, Math.min(100, this.fakeProgress)));
  }
  dismissBulkProgress() {
    this.bulkActive = false;
  this.stopRenderPhaseTimer();
    this.stopFakeProgress();
  }
  
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
  recurring_end_date: [''],
  user_id: ['']
    });

    this.packageForm = this.fb.group({
      package_id: ['', Validators.required],
      expiration_date: ['', Validators.required]
    });

  // Configuración del calendario adaptada para admin
  const isMobile = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(max-width: 600px)').matches;
  this.calendarOptions = {
      ...FULLCALENDAR_OPTIONS,
      selectable: true,
      selectMirror: true,
      select: this.onDateSelect.bind(this),
  dateClick: this.onDateClick.bind(this),
      eventClick: this.onEventClick.bind(this),
      editable: true,
      eventDrop: this.onEventDrop.bind(this),
      eventResizableFromStart: false,
      eventDurationEditable: false,
      events: (info: any, success: any, failure: any) => this.fetchEventsForRange(info, success, failure),
      loading: (isLoading: boolean) => this.onCalendarLoading(isLoading),
      eventsSet: (_events: any[]) => this.onEventsSet(_events),
      height: 'calc(100vh - 100px)',
      dayMaxEvents: false,
      moreLinkClick: 'popover',
      eventDisplay: 'block',
      displayEventTime: false,
      eventContent: this.renderEventContent.bind(this),
      headerToolbar: (isMobile || window.innerWidth <= 1024)
        ? {
            left: 'prev,next today',
            center: 'title',
            right: 'timeGridDay,timeGridWeek'
          }
        : {
            left: 'prev,next today',
            center: 'title',
            right: 'dayGridMonth,timeGridWeek,timeGridDay'
          },
      initialView: (isMobile || window.innerWidth <= 1024) ? 'timeGridDay' : 'timeGridWeek',
      buttonText: {
        today: 'Hoy',
        month: 'Mes',
        week: 'Semana',
        día: 'Día'
      },
      // Forzar selección en móvil para admin
      selectAllow: () => true
    };
  }

  onDateClick(clickInfo: any) {
    // FullCalendar dateClick fires on tap in many mobile browsers; use it to open create modal
    try {
      const dt = new Date(clickInfo.date);
      const scheduleDate = dt.toISOString().split('T')[0];
      const scheduleTime = dt.toTimeString().slice(0,5);
      this.openCreateModal(scheduleDate, scheduleTime);
    } catch (e) {
      console.warn('[admin] onDateClick failed', e);
    }
  }

  ngOnInit() {
  this.loadData();
  }

  ngAfterViewInit() {
    // Observe relevant form controls so we can validate package availability for personal sessions
    try {
      const classTypeCtrl = this.sessionForm.get('class_type_id');
      const userCtrl = this.sessionForm.get('user_id');
      const dateCtrl = this.sessionForm.get('schedule_date');

      if (classTypeCtrl) {
        const sub = classTypeCtrl.valueChanges.subscribe(() => this.onSelectedUserOrTypeOrDateChange());
        this.subscriptions.push(sub);
      }
      if (userCtrl) {
        const sub = userCtrl.valueChanges.subscribe(() => this.onSelectedUserOrTypeOrDateChange());
        this.subscriptions.push(sub);
      }
      if (dateCtrl) {
        const sub = dateCtrl.valueChanges.subscribe(() => this.onSelectedUserOrTypeOrDateChange());
        this.subscriptions.push(sub);
      }
    } catch (e) {
      // Non-fatal
    }
  }

  // Helper: normalize time-only strings like '09:00:00' to a Date for template formatting
  formatTimeForTemplate(timeValue: string | Date | null | undefined): Date | null {
    if (!timeValue) return null;
    if (timeValue instanceof Date) return timeValue;
    // Accept formats like 'HH:mm' or 'HH:mm:ss'
    const t = String(timeValue).trim();
    const parts = t.split(':');
    if (parts.length >= 2) {
      const hh = parseInt(parts[0], 10) || 0;
      const mm = parseInt(parts[1], 10) || 0;
      const d = new Date();
      d.setHours(hh, mm, 0, 0);
      return d;
    }
    // Fallback: try Date parse
    const parsed = new Date(t);
    return isNaN(parsed.getTime()) ? null : parsed;
  }

  private async onSelectedUserOrTypeOrDateChange() {
    // Reset cached flag and run check only when relevant
    this.selectedUserHasValidPackage = null;
    // Only check when the selected class type is personal and a user is chosen
    const classTypeId = this.sessionForm.get('class_type_id')?.value;
    if (!this.isPersonalType(classTypeId)) return;

    const userIdRaw = this.sessionForm.get('user_id')?.value;
    const scheduleDate = this.sessionForm.get('schedule_date')?.value;
    if (!userIdRaw || !scheduleDate) {
      this.selectedUserHasValidPackage = null;
      return;
    }

    const userId = Number(userIdRaw);
    if (!userId) {
      this.selectedUserHasValidPackage = null;
      return;
    }

    try {
      this.checkingPackageAvailability = true;
      const isPersonal = true;
      // Use new helper that returns whether user has any matching package and whether one matches the session month
      const res = await firstValueFrom(this.carteraService.tienePaqueteYCoincideMes(userId, Number(classTypeId), isPersonal, scheduleDate));
      this.selectedUserHasValidPackage = !!res.matchesMonth;
      this.selectedUserHasPackageButNotForMonth = !!(res.hasAny && !res.matchesMonth);
    } catch (err) {
      console.warn('Error checking package availability:', err);
      this.selectedUserHasValidPackage = false;
      this.selectedUserHasPackageButNotForMonth = false;
    } finally {
      this.checkingPackageAvailability = false;
      this.cdr.detectChanges();
    }
  }

  getSelectedUser(): any | null {
    const userIdRaw = this.sessionForm.get('user_id')?.value;
    if (!userIdRaw) return null;
    const id = Number(userIdRaw);
    // prefer availableUsers list (recent search) then fallback to allUsers
    const found = (this.availableUsers || []).find(u => Number(u.id) === id) || (this.allUsers || []).find(u => Number(u.id) === id);
    return found || null;
  }

  getPreselectedPackageName(): string {
    const id = this.packageForm.get('package_id')?.value;
    if (!id) return '';
    const p = (this.packagesDisponibles || []).find(x => Number(x.id) === Number(id));
    return p ? (p.name || '') : '';
  }

  ngOnDestroy() {
    this.subscriptions.forEach(sub => sub.unsubscribe());
  this.stopRenderPhaseTimer();
  this.stopFakeProgress();
  }

  loadData() {
    this.loading = true;
  // Preservar estado actual antes de recargar datos
  this.saveCalendarState();
    
    // Cargar tipos de clase y paquetes; las sesiones se cargan por lazy-load
    const classTypes$ = this.classTypesService.getAll();
    const packages$ = this.carteraService.getPackages();

    const sub = forkJoin({
      classTypes: classTypes$,
      packages: packages$
    }).subscribe({
      next: ({ classTypes, packages }) => {
        this.classTypes = classTypes;
        this.packagesDisponibles = packages;
        this.loading = false;
        this.cdr.detectChanges();
  // FullCalendar event source will fetch automatically; just restore view state
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

  // loadSessions ya no usa lazy-load; FullCalendar event source gestiona las cargas por rango

  private loadSessionsData(sessions: ClassSession[]) {
    this.events = sessions.map(session => {
      const bookingCount = session.bookings ? session.bookings.length : 0;
      const className = session.class_type_name || this.getClassTypeName(session.class_type_id);
      // Format time as HH:mm and use line breaks for separation
      const time = session.schedule_time?.slice(0,5) || '';
      return {
        id: session.id.toString(),
        title: `${time}\n${className}\n(${bookingCount}/${session.capacity})`,
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
    // Con event source simple, siempre refetch
    api.refetchEvents();
        this.cdr.detectChanges();
        return;
      }
    } catch (e) {
      console.warn('Fallo al aplicar eventos vía API, usando fallback de options:', e);
    }
    // Fallback: actualizar options con los eventos
    this.calendarOptions = { ...this.calendarOptions, events: [...events] };
  }

  // Event source function for FullCalendar
  private fetchEventsForRange(info: { startStr: string; endStr: string }, success: (evs: any[]) => void, failure: (err: any) => void) {
    try { console.debug('[admin] source: range load', info); } catch {}
    // FullCalendar end is exclusive; restar 1 día para inclusivo
    const startDate = this.formatDate(new Date(info.startStr));
    const endExcl = new Date(info.endStr);
    endExcl.setDate(endExcl.getDate() - 1);
    const endDate = this.formatDate(endExcl);
    const sub = this.classSessionsService.getSessionsWithBookingCounts(startDate, endDate).subscribe({
      next: (sessions: ClassSession[]) => {
        try {
          const safeSessions = (sessions || []).filter((s: any) => s && s.id != null && s.schedule_date && s.schedule_time);
          const events = safeSessions.map(session => {
            const bookingCount = typeof session.confirmed_bookings_count === 'number'
              ? session.confirmed_bookings_count
              : (session.bookings ? session.bookings.length : 0);
            const className = session.class_type_name || this.getClassTypeName(session.class_type_id);
            // Format time as HH:mm and use line breaks for separation
            const time = session.schedule_time?.slice(0,5) || '';
            return {
              id: String(session.id),
              title: `${time}\n${className}\n(${bookingCount}/${session.capacity})`,
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
          this.events = events; // snapshot para helpers locales
          success(events);
        } catch (mapErr) {
          console.error('[admin] event mapping error', mapErr);
          // Ensure FullCalendar stops its loading spinner
          try { success([]); } catch { try { failure(mapErr); } catch {} }
        }
      },
      error: (err: any) => {
        console.error('[admin] source error', err);
        // Ensure FullCalendar stops its loading spinner
        try { failure(err); } catch { try { success([]); } catch {} }
      }
    });
    this.subscriptions.push(sub);
  }
  // Lazy-loading eliminado: sin caché local ni ventanas prefetch

  // Formatea fecha local a YYYY-MM-DD sin efectos de zona horaria
  private formatDate(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
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
    const session = clickInfo?.event?.extendedProps?.['session'] as ClassSession | undefined;
    if (!session) {
      console.warn('[admin] Click en evento sin sesión asociada. Ignorado.');
      return;
    }
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
    
  // Load users for potential personalized sessions
  this.sessionForm.patchValue({ user_id: '' });
  this.loadAllUsers().catch(e => console.warn('No se pudieron cargar usuarios:', e));
  this.showModal = true;
    this.clearMessages();
  // Ensure availability state is fresh
  try { this.onSelectedUserOrTypeOrDateChange(); } catch {}
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
          // Capturar ID antes de cerrar modal para evitar null access
          const updatedId = this.selectedSession!.id;
          this.closeModal();
          // Refrescar solo el evento afectado en el calendario
          const idx = this.events.findIndex(e => e.id === String(updatedId));
          if (idx !== -1) {
            const s = { ...this.events[idx].extendedProps.session, ...updateData };
            this.events[idx].extendedProps.session = s;
            const currentBookings = this.events[idx].extendedProps.bookings ?? 0;
            this.updateCalendarEventCounts(updatedId, currentBookings);
          } else {
            // Si no está cargado, refrescar sólo el rango visible
            try { this.calendarComponent?.getApi?.().refetchEvents(); } catch {}
          }
          // Refrescar eventos para garantizar consistencia inmediata
          try { this.calendarComponent?.getApi?.().refetchEvents(); } catch {}
          this.loading = false;
        },
        error: (err: any) => {
          console.error('Error updating session:', err);
          this.error = 'Error al actualizar la sesión';
          this.loading = false;
        }
      });
      this.subscriptions.push(sub);
      return;
    }

    // Crear nueva sesión (o varias si es recurrente)
    if (formData.recurring) {
      this.createRecurringSessions(formData);
    } else {
      this.createSingleSession(formData);
    }
  }

  private createSingleSession(formData: any) {
    const newSession: any = {
      class_type_id: formData.class_type_id,
      schedule_date: formData.schedule_date,
      schedule_time: formData.schedule_time,
      capacity: formData.capacity
    };
    // If personalized type, include personal_user_id (DB column name)
    if (this.isPersonalType(formData.class_type_id)) {
      newSession['personal_user_id'] = formData.user_id || null;
    }

    const createObs = newSession.personal_user_id
      ? this.classSessionsService.createSessionWithPersonalBooking(newSession)
      : this.classSessionsService.createSession(newSession);

    const sub = createObs.subscribe({
      next: (created: any) => {
        this.successMessage = 'Sesión creada correctamente';
        this.closeModal();
        // Añadir el evento al calendario sin recargar todo
        const createdSession = Array.isArray(created) ? created[0] : created;
        if (createdSession && createdSession.id) {
          // If the session was created with a personal_user_id, treat it as an immediate confirmed booking
          const bookingCount = createdSession.personal_user_id ? 1 : 0;
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
            // If we used the RPC, it will return the booking linked; handle both shapes
            if (createdSession && createdSession.booking_row) {
              try {
                const booking = createdSession.booking_row;
                // Update local counts
                this.updateCalendarEventCounts(createdSession.session_row.id, 1);
                this.showToastNotification('Sesión y reserva creadas correctamente', 'success');
              } catch {}
            }
        }
        try { this.calendarComponent?.getApi?.().refetchEvents(); } catch {}
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
    const totalSessions = sessions.length;

    if (totalSessions === 0) {
      this.error = 'No se pudieron generar sesiones con los parámetros especificados';
      this.loading = false;
      return;
    }

    // Poner en background: cerrar modal y mostrar progreso no bloqueante
    this.showModal = false;
    this.isEditing = false;
    this.clearMessages();
    this.bulkActive = true;
    this.bulkTotal = totalSessions;
    this.bulkDone = 0;
    this.bulkErrors = 0;
    this.bulkStartedAt = Date.now();
  this.fakeProgress = 0;
  this.startFakeProgress();
    // No bloquear la UI global
    this.loading = false;

    // Crear todas las sesiones y agregar al calendario sin recargar todo
    sessions.forEach((sessionReq, index) => {
      // If personalized type, ensure personal_user_id is attached (shouldn't happen for recurring but defensive)
      if (this.isPersonalType(formData.class_type_id)) {
        sessionReq.personal_user_id = formData.user_id || null;
      }
      const createObs = sessionReq.personal_user_id
        ? this.classSessionsService.createSessionWithPersonalBooking(sessionReq)
        : this.classSessionsService.createSession(sessionReq);

      const sub = createObs.subscribe({
        next: (created: any) => {
          // When using the RPC, payload may include session_row and booking_row
          let createdSession: any = Array.isArray(created) ? created[0] : created;
          if (createdSession && createdSession.session_row) createdSession = createdSession.session_row;
          if (createdSession && createdSession.id) {
            // Honor personal_user_id as an occupied spot for recurring/personalized creations
            const bookingCount = createdSession.personal_user_id ? 1 : 0;
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
            // If personalized, attempt to create a real booking
            if (createdSession.personal_user_id) {
              this.classSessionsService.createBooking({
                user_id: createdSession.personal_user_id,
                class_session_id: createdSession.id,
                class_type: className
              }).subscribe({
                next: () => {
                  // increment local count conservatively
                  this.updateCalendarEventCounts(createdSession.id, bookingCount);
                },
                error: (err: any) => {
                  console.warn('No se pudo crear reserva automática en creación recurrente:', err);
                }
              });
            }
          }

          createdCount++;
          this.bulkDone = createdCount;
          if (createdCount === totalSessions) {
            this.successMessage = `${createdCount} sesiones recurrentes creadas correctamente`;
            // Trigger a final refetch and wait for eventsSet to finish before closing
            this.awaitingBulkSync = true;
            try { this.calendarComponent?.getApi?.().refetchEvents(); } catch {}
          }
        },
        error: (err: any) => {
          console.error(`Error creating session ${index + 1}:`, err);
          createdCount++;
          this.bulkDone = createdCount;
          this.bulkErrors++;
          if (createdCount === totalSessions) {
            this.error = `Se crearon ${totalSessions - this.bulkErrors} sesiones. ${this.bulkErrors} fallaron.`;
            // Synchronize with calendar rendering
            this.awaitingBulkSync = true;
            try { this.calendarComponent?.getApi?.().refetchEvents(); } catch {}
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
  // Capturar ID antes de cerrar el modal para evitar null access
  const toRemoveId = this.selectedSession.id;
  const sub = this.classSessionsService.deleteSession(toRemoveId).subscribe({
      next: () => {
        // Apagar spinner inmediatamente para evitar quedarse colgado si hay errores posteriores
        this.loading = false;
        try {
          this.successMessage = 'Sesión eliminada correctamente';
          this.closeModal();
          // Quitar el evento del calendario local si existe
          const removedId = toRemoveId;
          // Remover del FullCalendar primero para evitar refs obsoletas
          try {
            const api = this.calendarComponent?.getApi?.();
            const fcEvent = api?.getEventById(String(removedId));
            if (fcEvent) fcEvent.remove();
          } catch {}
          // Mantener snapshot local coherente
          this.events = (this.events || []).filter(e => e && e.id !== String(removedId));
          // Refresca la ventana actual para garantizar consistencia inmediata
          try { this.calendarComponent?.getApi?.().refetchEvents(); } catch {}
        } catch (innerErr) {
          console.warn('Post-delete UI update failed (ignorable):', innerErr);
        }
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
    // If the selected type is a personalized one (4,22,23), show user selector and disable recurring
    if (this.isPersonalType(classTypeId)) {
      // Force capacity to 1 for personalized
      this.sessionForm.patchValue({ capacity: 1 });
      // Disable recurring options
      this.sessionForm.patchValue({ recurring: false, recurring_type: '', recurring_end_date: '' });
    }
  // Re-evaluate package availability when class type changes
  try { this.onSelectedUserOrTypeOrDateChange(); } catch {}
  }

  getClassTypeCapacity(classTypeId: number): number {
    // Try to find capacity on runtime-loaded classTypes; fall back to sensible defaults.
    const ct = this.classTypes?.find(c => Number(c.id) === Number(classTypeId));
    if (ct && (ct as any).default_capacity) return Number((ct as any).default_capacity);
    // sensible defaults when metadata is missing
    const fallback = {
      personal: 1,
      reformer: 2,
      barre: 2,
      mat: 8,
      funcional: 10,
    };
    const name = (ct && (ct as any).name) ? String((ct as any).name).toLowerCase() : '';
    if (/personal|personalizada|individual/.test(name)) return fallback.personal;
    if (/reformer/.test(name)) return fallback.reformer;
    if (/barre/.test(name)) return fallback.barre;
    if (/mat/.test(name)) return fallback.mat;
    if (/funcional/.test(name)) return fallback.funcional;
    return 8; // default
  }

  /**
   * Determina si un tipo de clase es "personalizado" consultando los datos cargados
   * Preferimos una bandera explícita `is_personal` si existe en la fila; si no,
   * hacemos un fallback por heurística sobre el nombre ('personal', 'personalizada', 'individual').
   */
  isPersonalType(classTypeId: number | string | null | undefined): boolean {
    if (!classTypeId) return false;
    const id = Number(classTypeId);
    const ct = this.classTypes.find(c => Number(c.id) === id);
    if (!ct) return false;
    // Prefer explicit flag when available
    const anyCt: any = ct as any;
    if (anyCt.is_personal !== undefined && anyCt.is_personal !== null) {
      return !!anyCt.is_personal;
    }
    // If packagesDisponibles contains a personal package for this class type, treat as personal
    try {
      if (this.packagesDisponibles && this.packagesDisponibles.length > 0) {
        const hasPersonalPackage = this.packagesDisponibles.some(p => {
          try { return !!p && !!p.is_personal && Number(p.class_type) === id; } catch { return false; }
        });
        if (hasPersonalPackage) return true;
      }
    } catch {}
    const name = (ct as any).name || '';
    return /personal|individual/i.test(name);
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

  // Acción auxiliar para el botón de refresco en progreso bulk
  refetchCalendarSafely() {
    try { this.calendarComponent?.getApi?.().refetchEvents(); } catch {}
  }

  // FullCalendar lifecycle hooks to sync bulk progress with visual rendering
  private onCalendarLoading(isLoading: boolean) {
    this.calendarIsLoading = isLoading;
  }

  private onEventsSet(_events: any[]) {
    if (this.awaitingBulkSync) {
      // Calendar has applied events after our final refetch
      this.awaitingBulkSync = false;
      // Ensure 100% is visible briefly before dismissing
  this.bulkDone = this.bulkTotal;
  this.fakeProgress = 100;
      this.stopRenderPhaseTimer();
  this.stopFakeProgress();
      setTimeout(() => {
        this.bulkActive = false;
      }, 1000);
    }
  }

  // Two-phase render progress management
  private beginRenderPhase() {
    this.awaitingBulkSync = true;
    // start a short timer to animate the render phase until eventsSet fires
    this.stopRenderPhaseTimer();
    this._renderTickStart = Date.now();
    this._renderTickElapsed = 0;
    this.renderTick = setInterval(() => {
      this._renderTickElapsed = Date.now() - (this._renderTickStart as number);
      try { this.cdr.detectChanges(); } catch {}
    }, 100);
  }

  private stopRenderPhaseTimer() {
    if (this.renderTick) {
      clearInterval(this.renderTick);
      this.renderTick = null as any;
    }
  }

  // Fake progress controls
  private startFakeProgress() {
    this.stopFakeProgress();
    // Initialize fake progress near the start
    if (this.fakeProgress < 2) this.fakeProgress = 2;
    this.fakeTimer = setInterval(() => this.tickFakeProgress(), 120);
  }

  private stopFakeProgress() {
    if (this.fakeTimer) {
      clearInterval(this.fakeTimer);
      this.fakeTimer = null;
    }
  }

  private tickFakeProgress() {
    if (!this.bulkActive) return;
    // Dynamic cap: ramp from ~55% to ~90% as creations progress; in render phase, cap is 99%
    const createdRatio = this.bulkTotal > 0 ? (this.bulkDone / this.bulkTotal) : 0;
    const baseCap = 55; // starting cap
    const dynamicCap = baseCap + Math.min(40, Math.round(createdRatio * 35)); // up to ~90
    const targetCap = (this.awaitingBulkSync || this.calendarIsLoading) ? 99 : dynamicCap;
    // Ease towards target cap
    const dist = targetCap - this.fakeProgress;
    if (dist <= 0.1) return; // close enough to cap; wait for next state change
    const step = Math.max(0.3, dist * 0.05); // smaller steps near cap
    this.fakeProgress = Math.min(targetCap, this.fakeProgress + step);
    try { this.cdr.detectChanges(); } catch {}
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

    // If no bookings but the session itself has a personal_user_id, synthesize a confirmed booking
    if ((this.sessionAttendees.length === 0) && this.selectedSession && this.selectedSession.personal_user_id) {
      try {
        const { data: udata } = await this.supabaseService.supabase
          .from('users')
          .select('id, name, surname, email')
          .eq('id', this.selectedSession.personal_user_id)
          .limit(1)
          .single();
        if (udata) {
          const synthetic = [{
            id: 0,
            user_id: udata.id,
            class_session_id: this.selectedSession.id,
            booking_date_time: new Date().toISOString(),
            cancellation_time: null,
            status: 'CONFIRMED',
            users: {
              name: udata.name,
              surname: udata.surname,
              email: udata.email
            }
          }];
          this.sessionAttendees = synthetic;
        }
      } catch (e) {
        console.warn('No se pudo cargar usuario personal para sesión personal:', e);
      }
    }

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

  // Template-friendly computed property for checking whether the currently selected class type is personal
  get selectedTypeIsPersonal(): boolean {
    const ct = this.sessionForm.get('class_type_id')?.value;
    return this.isPersonalType(ct);
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
  // Capture session id upfront to avoid null access if modal closes
  const sessionId = this.selectedSession?.id ?? booking.class_session_id;
    try {
      // Cancelar la reserva: si el usuario es admin, forzar cancelación sin restricciones
      let result: any;
      try {
        // Intento 1: usar endpoint de admin que ignora límites
        const { data, error } = await this.supabaseService.supabase
          .rpc('admin_cancel_booking_force', { p_booking_id: booking.id });
        if (error) throw error;
        result = data;
      } catch (e) {
        // Fallback: método estándar con validaciones por si el RPC no está desplegado todavía
        result = await firstValueFrom(this.classSessionsService.cancelBooking(booking.id, booking.user_id));
      }
      
      console.log('Resultado de cancelación:', result);
      
      // Mostrar notificación inmediatamente
      this.showToastNotification(`${userName} eliminado correctamente. Bono devuelto.`, 'success');
      
      // Actualizar UI local inmediatamente - remover de la lista
      this.sessionAttendees = this.sessionAttendees.filter(attendee => attendee.id !== booking.id);
      
      // ACTUALIZAR también el evento en el calendario local para UI inmediata
      if (sessionId != null) {
        this.updateCalendarEventCounts(sessionId, this.sessionAttendees.length);
      }
      // Close attendees modal and refresh calendar immediately so user sees the change
      try { this.closeAttendeesModal(); } catch {}
      try { this.calendarComponent?.getApi?.().refetchEvents(); } catch {}
      // Incrementar available_spots si lo tenemos en selectedSession
      if (this.selectedSession && typeof this.selectedSession.available_spots === 'number') {
        this.selectedSession.available_spots = Math.max(0, (this.selectedSession.available_spots || 0) + 1);
      }

      // If this was a personal session and we removed the performing user, delete the session immediately
      try {
        const isPersonal = this.isPersonalType(this.selectedSession?.class_type_id);
        // Ensure we have the authoritative personal_user_id from DB in case the calendar event lacked it
        let personalUserId: number | null | undefined = this.selectedSession?.personal_user_id;
        if (isPersonal && booking.user_id && (personalUserId == null)) {
          try {
            const { data: sessionRow, error: sessionErr } = await this.supabaseService.supabase
              .from('class_sessions')
              .select('id, personal_user_id')
              .eq('id', sessionId)
              .maybeSingle();
            if (!sessionErr && sessionRow) {
              personalUserId = sessionRow.personal_user_id;
              // Update local selectedSession for future checks
              if (this.selectedSession) this.selectedSession.personal_user_id = personalUserId;
            }
          } catch (fetchErr) {
            console.warn('No se pudo obtener personal_user_id desde DB:', fetchErr);
          }
        }

        if (isPersonal && booking.user_id && personalUserId === booking.user_id) {
          try {
            console.debug('[admin] Calling safeDeleteSession RPC for session', sessionId);
            const delRes = await firstValueFrom(this.classSessionsService.safeDeleteSession(sessionId));
            console.debug('[admin] safeDeleteSession result:', delRes);
            // If RPC returned truthy, remove event and close modal
            if (delRes) {
              this.showToastNotification('Sesión personalizada eliminada tras borrar al usuario', 'success');
              // Close attendees modal (we're in the attendees flow) and remove event from calendar
              try { this.closeAttendeesModal(); } catch {}
              try { const api = this.calendarComponent?.getApi?.(); const fcEvent = api?.getEventById(String(sessionId)); if (fcEvent) fcEvent.remove(); api?.refetchEvents?.(); } catch {}
              // Also remove locally from events array
              this.events = (this.events || []).filter(e => e && e.id !== String(sessionId));
              // Done — no need to reload attendees
              this.loading = false;
              return;
            } else {
              console.warn('[admin] safeDeleteSession returned falsy, not attempting REST delete to avoid 409.');
              this.showToastNotification('No se pudo eliminar la sesión en servidor (RPC returned false). Revisa migraciones.', 'error');
            }
          } catch (rpcErr: any) {
            console.error('safeDeleteSession failed:', rpcErr);
            // Surface clearer message when RPC is missing or forbidden
            const msg = rpcErr?.message || rpcErr?.statusText || 'RPC safe_delete_session no disponible o falló';
            this.showToastNotification(`Error eliminando la sesión en servidor: ${msg}. Asegúrate de que la función SQL 'safe_delete_session' esté desplegada y tenga permisos.`, 'error');
            // Do not fall back to REST delete (409 risk). Stop here.
            this.loading = false;
            return;
          }
        }
      } catch (e) {
        // ignore
      }

      // Recargar asistentes desde la BD de forma asíncrona para confirmar (normal flow)
      setTimeout(async () => {
        if (sessionId != null) {
          await this.loadSessionAttendees(sessionId);
        }
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
      // Capture session context upfront
      const sessionId = this.selectedSession.id;
      const classTypeIdCtx = this.selectedSession.class_type_id;
      // VERIFICAR PRIMERO: No permitir duplicados
      const { data: existingBooking, error: checkError } = await this.supabaseService.supabase
        .from('bookings')
        .select('id')
        .eq('user_id', user.id)
  .eq('class_session_id', sessionId)
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
  .eq('class_session_id', sessionId)
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
  const classTypeName = this.getClassTypeName(classTypeIdCtx);
    // Verificar usando servicio que conoce los mapeos (2<->9 y 4<->22) y personales
  const isPersonal = this.isPersonalType(this.selectedSession.class_type_id);
      const hasPackage = await new Promise<boolean>((resolve) => {
        const sub = this.carteraService
  .tieneClasesDisponibles(user.id, classTypeIdCtx, isPersonal)
          .subscribe({ next: (ok) => { resolve(ok); sub.unsubscribe(); }, error: () => { resolve(false); sub.unsubscribe(); } });
      });

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
          p_class_session_id: sessionId,
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

  // Se elimina checkUserHasPackage: la verificación se centraliza en carteraClasesService

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

  async openAddPackageModal(user: any, classTypeName: string) {
    this.selectedUserForPackage = user;
    this.showAddPackageModal = true;
  this.packagePreselected = false;
    
    // Establecer fecha de caducidad por defecto: último día del mes siguiente
    const base = this.selectedSession?.schedule_date
      ? new Date(this.selectedSession.schedule_date)
      : new Date();
    const lastDayNextMonth = new Date(base.getFullYear(), base.getMonth() + 2, 0);
    const defaultExpiration = lastDayNextMonth.toISOString().split('T')[0];
    this.packageForm.patchValue({
      expiration_date: defaultExpiration
    });
    
    this.clearMessages();

    // Try to auto-select a matching package for this class type (personal)
    try {
      // Prefer selectedSession (when adding to an existing session), otherwise use form value (create modal)
      const classTypeId = this.selectedSession?.class_type_id || this.sessionForm.get('class_type_id')?.value || null;
      // Ensure packagesDisponibles is loaded
      if ((!this.packagesDisponibles || this.packagesDisponibles.length === 0) && this.carteraService) {
        try {
          const pkgs = await firstValueFrom(this.carteraService.getPackages());
          this.packagesDisponibles = pkgs || [];
        } catch {}
      }
      if (classTypeId && this.packagesDisponibles && this.packagesDisponibles.length > 0) {
        const acceptable = await firstValueFrom(this.classTypesService.equivalentGroup(Number(classTypeId)));
        // Find personal packages that match by class_type or equivalent group
        let matches = this.packagesDisponibles.filter(p => !!p && !!p.is_personal && (acceptable.includes(Number(p.class_type)) || Number(p.class_type) === Number(classTypeId)));
        // If none found by direct match, allow personal packages that are marked as personal regardless of class_type
        if (matches.length === 0) {
          matches = this.packagesDisponibles.filter(p => !!p && !!p.is_personal);
        }
        if (matches.length >= 1) {
          // Heuristic: pick the package with largest class_count (more general)
          matches.sort((a,b) => (Number(b.class_count)||0) - (Number(a.class_count)||0));
          this.packageForm.patchValue({ package_id: matches[0].id });
          this.packagePreselected = true;
        }
      }
    } catch (e) {
      // Non-fatal
    }
  }

  closeAddPackageModal() {
    this.showAddPackageModal = false;
    this.selectedUserForPackage = null;
    this.packageForm.reset();
    this.clearMessages();
  // Re-run availability check in case admin just added a package
  try { this.onSelectedUserOrTypeOrDateChange(); } catch {}
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
        expiration_date: formData.expiration_date
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
    const sessionId = this.selectedSession.id;
      // MÉTODO MEJORADO: Usar función SQL atómica para validaciones
      const { data: result, error: functionError } = await this.supabaseService.supabase
        .rpc('create_booking_with_validations', {
          p_user_id: user.id,
      p_class_session_id: sessionId,
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
      this.updateCalendarEventCounts(sessionId, this.sessionAttendees.length);
      
      // Recargar asistentes desde la BD de forma asíncrona para confirmar
      setTimeout(async () => {
        if (sessionId != null) {
          await this.loadSessionAttendees(sessionId);
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
  ,
  user_package_id: userPackage.id
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
  payment_id: null,
  user_package_id: userPackage.id
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
  if (!originalEvent || !originalEvent?.extendedProps?.session) {
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
  if (eventIndex !== -1 && this.events[eventIndex]?.extendedProps?.session) {
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
  try { this.calendarComponent?.getApi?.().refetchEvents(); } catch {}
  // Lazy-load eliminado
        
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
  if (eventIndex !== -1 && this.events[eventIndex]?.extendedProps?.session) {
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
      const session = this.events[eventIndex]?.extendedProps?.session;
      if (!session) {
        // Si no hay sesión asociada, hacer un refetch seguro y salir
        try { this.calendarComponent?.getApi?.().refetchEvents(); } catch {}
        return;
      }
      const classTypeName = this.getClassTypeName(session.class_type_id);
      const capacity = `${bookingCount}/${session.capacity}`;
      
      // Actualizar el título del evento con formato simple
      this.events[eventIndex].title = `${session.schedule_time} • ${classTypeName} • (${capacity})`;
      if (this.events[eventIndex].extendedProps) {
        this.events[eventIndex].extendedProps.bookings = bookingCount;
      }
      
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
