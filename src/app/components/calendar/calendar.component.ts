import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { FullCalendarModule } from '@fullcalendar/angular';
import { FULLCALENDAR_OPTIONS } from './fullcalendar-config';
import { SupabaseService } from '../../services/supabase.service';
import { ClassSessionsService, ClassSession, CreateBookingRequest } from '../../services/class-sessions.service';
import { WaitingListService } from '../../services/waiting-list.service';
import { CreateWaitingListRequest } from '../../models/waiting-list';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-calendar',
  standalone: true,
  imports: [CommonModule, FormsModule, FullCalendarModule],
  templateUrl: './calendar.component.html',
  styleUrls: ['./calendar.component.css']
})
export class CalendarComponent implements OnInit, OnDestroy {
  currentUserId: number | null = null;
  private subscriptions: Subscription[] = [];
  
  // Modal states
  showReserveModal = false;
  selectedSession: ClassSession | null = null;
  
  // Calendar config
  calendarOptions: any = { 
    ...FULLCALENDAR_OPTIONS, 
    events: [],
    eventClick: (info: any) => this.onEventClick(info)
  };
  
  // Data
  classSessions: ClassSession[] = [];
  filteredClassSessions: ClassSession[] = []; // Para las clases filtradas
  classTypes: any[] = [
    { name: 'Barre', active: true },
    { name: 'Mat', active: true },
    { name: 'Reformer', active: true },
    { name: 'Personalizada', active: true },
    { name: 'Funcional', active: true }
  ];
  userPackages: any[] = []; // Para almacenar los paquetes del usuario
  
  // Estados de lista de espera
  isInWaitingList = false;
  waitingListPosition = 0;
  waitingListCount = 0;
  
  // UI states
  loading = false;
  error = '';
  successMessage = '';

  constructor(
    private supabaseService: SupabaseService,
    private classSessionsService: ClassSessionsService,
    private waitingListService: WaitingListService
  ) {}

  async ngOnInit() {
    await this.loadCurrentUser();
    await this.loadClassSessions();
    await this.loadUserPackages();
  }

  ngOnDestroy() {
    this.subscriptions.forEach(sub => sub.unsubscribe());
  }

  private async loadCurrentUser() {
    const sub = this.supabaseService.getCurrentUser().subscribe(async user => {
      if (user) {
        const { data: userData } = await this.supabaseService.supabase
          .from('users')
          .select('id')
          .eq('auth_user_id', user.id)
          .single();
        this.currentUserId = userData?.id ?? null;
      }
    });
    this.subscriptions.push(sub);
  }

  private async loadClassSessions() {
    this.loading = true;
    try {
      const sub = this.classSessionsService.getClassSessions().subscribe({
        next: (sessions) => {
          this.classSessions = sessions;
          this.applyFilters(); // Aplicar filtros y actualizar calendario
          this.loading = false;
        },
        error: (error) => {
          console.error('Error loading class sessions:', error);
          this.error = 'Error cargando las clases disponibles';
          this.loading = false;
        }
      });
      this.subscriptions.push(sub);
    } catch (error) {
      console.error('Error loading class sessions:', error);
      this.error = 'Error cargando las clases disponibles';
      this.loading = false;
    }
  }

  private async loadUserPackages() {
    if (!this.currentUserId) return;
    
    try {
      const { data, error } = await this.supabaseService.supabase
        .from('user_packages')
        .select(`
          *,
          packages (
            id,
            name,
            class_type,
            class_count,
            price
          )
        `)
        .eq('user_id', this.currentUserId)
        .eq('is_active', true);

      if (error) {
        console.error('Error loading user packages:', error);
        return;
      }

      this.userPackages = data || [];
      console.log('User packages loaded:', this.userPackages);
    } catch (error) {
      console.error('Error loading user packages:', error);
    }
  }

  private updateCalendarEvents() {
    const events = this.filteredClassSessions.map(session => {
      const availableSpots = this.classSessionsService.getAvailableSpots(session);
      const isAvailable = this.classSessionsService.isSessionAvailable(session);
      const hasPackageForClass = this.hasAvailablePackageForClass(session.class_type_name || '');
      const colors = this.classSessionsService.getEventColors(session);
      
      // Si no tiene paquete disponible, usar colores desaturados
      const finalColors = hasPackageForClass ? colors : {
        background: '#94a3b8', // Gris para clases sin paquete
        border: '#64748b'
      };
      
      return {
        id: session.id.toString(),
        title: `${session.class_type_name} (${availableSpots}/${session.capacity})`,
        start: `${session.schedule_date}T${session.schedule_time}`,
        extendedProps: {
          sessionId: session.id,
          sessionData: session,
          availableSpots,
          isAvailable,
          classType: session.class_type_name,
          hasPackageForClass
        },
        backgroundColor: finalColors.background,
        borderColor: finalColors.border,
        textColor: '#ffffff', // Texto blanco para mejor contraste
        classNames: [
          isAvailable ? 'available-class' : 'full-class',
          `class-type-${session.class_type_name?.toLowerCase().replace(/[^a-z0-9]/g, '-') || 'default'}`
        ]
      };
    });

    this.calendarOptions = {
      ...this.calendarOptions,
      events
    };
  }

  onEventClick(info: any) {
    const sessionData = info.event.extendedProps.sessionData as ClassSession;
    const hasPackageForClass = info.event.extendedProps.hasPackageForClass;
    
    this.selectedSession = sessionData;
    
    // Si no tiene paquete para esta clase, mostrar mensaje informativo
    if (!hasPackageForClass) {
      this.error = `No tienes un paquete disponible para clases de tipo "${sessionData.class_type_name}". Contacta con recepción para adquirir un paquete.`;
      return;
    }
    
    this.showReserveModal = true;
    this.clearMessages();
    this.loadWaitingListStatus(); // Cargar estado de lista de espera
  }

  async reserveClass() {
    if (!this.selectedSession || !this.currentUserId) {
      this.error = 'Error: No se pudo procesar la reserva';
      return;
    }

    // Verificar disponibilidad de espacios
    if (!this.classSessionsService.isSessionAvailable(this.selectedSession)) {
      this.error = 'Esta clase ya está completa';
      return;
    }

    // Verificar disponibilidad de paquete
    if (!this.canReserveClass()) {
      this.error = 'No tienes un paquete disponible para este tipo de clase';
      return;
    }

    this.loading = true;
    this.clearMessages();

    try {
      const bookingRequest: CreateBookingRequest = {
        user_id: this.currentUserId,
        class_session_id: this.selectedSession.id,
        class_type: this.selectedSession.class_type_name || ''
      };

      const sub = this.classSessionsService.createBooking(bookingRequest).subscribe({
        next: () => {
          this.successMessage = 'Reserva realizada exitosamente';
          this.closeModal();
          this.loadClassSessions(); // Recargar para actualizar disponibilidad
          this.loadUserPackages(); // Recargar paquetes para actualizar clases restantes
          this.loading = false;
        },
        error: (error) => {
          console.error('Error creating booking:', error);
          this.error = error.message || 'Error al crear la reserva';
          this.loading = false;
        }
      });
      this.subscriptions.push(sub);
    } catch (error: any) {
      console.error('Error creating booking:', error);
      this.error = error.message || 'Error al crear la reserva';
      this.loading = false;
    }
  }

  closeModal() {
    this.showReserveModal = false;
    this.selectedSession = null;
    this.clearMessages();
  }

  clearMessages() {
    this.error = '';
    this.successMessage = '';
  }

  getClassTypeDescription(): string {
    return this.selectedSession?.class_type_description || 'Descripción no disponible';
  }

  getClassDuration(): string {
    const duration = this.selectedSession?.class_type_duration || 60;
    return `${duration} minutos`;
  }

  getClassDateTime(): string {
    if (!this.selectedSession) return '';
    
    const date = new Date(`${this.selectedSession.schedule_date}T${this.selectedSession.schedule_time}`);
    return date.toLocaleString('es-ES', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  getAvailableSpots(): number {
    if (!this.selectedSession) return 0;
    return this.classSessionsService.getAvailableSpots(this.selectedSession);
  }

  isClassAvailable(): boolean {
    if (!this.selectedSession) return false;
    return this.classSessionsService.isSessionAvailable(this.selectedSession);
  }

  // Métodos para verificar disponibilidad de paquetes
  hasAvailablePackageForClass(classType: string): boolean {
    if (!this.userPackages || this.userPackages.length === 0) return false;
    
    return this.userPackages.some(userPackage => {
      // Verificar que el paquete sea para este tipo de clase
      const isCorrectType = userPackage.packages?.class_type === classType;
      // Verificar que tenga clases restantes
      const hasRemainingClasses = userPackage.remaining_classes > 0;
      // Verificar que esté activo
      const isActive = userPackage.is_active;
      
      return isCorrectType && hasRemainingClasses && isActive;
    });
  }

  canReserveClass(): boolean {
    if (!this.selectedSession) return false;
    
    const hasSpots = this.isClassAvailable();
    const hasPackage = this.hasAvailablePackageForClass(this.selectedSession.class_type_name || '');
    
    return hasSpots && hasPackage;
  }

  // Métodos para la leyenda de colores
  getTypeColor(typeName: string): { background: string, border: string } {
    return this.classSessionsService.getClassTypeColors(typeName);
  }

  // =============================
  // MÉTODOS DE LISTA DE ESPERA
  // =============================

  /**
   * Carga el estado de la lista de espera para la sesión seleccionada
   */
  async loadWaitingListStatus() {
    if (!this.selectedSession || !this.currentUserId) return;

    try {
      // Verificar si el usuario está en la lista de espera
      const sub1 = this.waitingListService.isUserInWaitingList(
        this.currentUserId, 
        this.selectedSession.id
      ).subscribe({
        next: (isInList) => {
          this.isInWaitingList = isInList;
        },
        error: (error) => console.error('Error checking waiting list status:', error)
      });
      this.subscriptions.push(sub1);

      // Obtener posición si está en la lista
      if (this.isInWaitingList) {
        const sub2 = this.waitingListService.getUserWaitingListPosition(
          this.currentUserId,
          this.selectedSession.id
        ).subscribe({
          next: (position) => {
            this.waitingListPosition = position;
          },
          error: (error) => console.error('Error getting waiting list position:', error)
        });
        this.subscriptions.push(sub2);
      }

      // Obtener total de personas en lista de espera
      const sub3 = this.waitingListService.getWaitingListCount(this.selectedSession.id).subscribe({
        next: (count) => {
          this.waitingListCount = count;
        },
        error: (error) => console.error('Error getting waiting list count:', error)
      });
      this.subscriptions.push(sub3);

    } catch (error) {
      console.error('Error loading waiting list status:', error);
    }
  }

  /**
   * Agrega al usuario a la lista de espera
   */
  async joinWaitingList() {
    if (!this.selectedSession || !this.currentUserId) {
      this.error = 'Error: No se pudo procesar la solicitud';
      return;
    }

    // Verificar que tenga paquete para este tipo de clase
    if (!this.hasAvailablePackageForClass(this.selectedSession.class_type_name || '')) {
      this.error = 'No tienes un paquete disponible para este tipo de clase';
      return;
    }

    this.loading = true;
    this.clearMessages();

    try {
      const waitingListRequest: CreateWaitingListRequest = {
        user_id: this.currentUserId,
        class_session_id: this.selectedSession.id,
        status: 'waiting'
      };

      const sub = this.waitingListService.joinWaitingList(waitingListRequest).subscribe({
        next: () => {
          this.successMessage = '¡Te has unido a la lista de espera! Te notificaremos si se libera un lugar.';
          this.loadWaitingListStatus(); // Recargar estado
          this.loading = false;
        },
        error: (error) => {
          console.error('Error joining waiting list:', error);
          this.error = error.message || 'Error al unirse a la lista de espera';
          this.loading = false;
        }
      });
      this.subscriptions.push(sub);

    } catch (error: any) {
      console.error('Error joining waiting list:', error);
      this.error = error.message || 'Error al unirse a la lista de espera';
      this.loading = false;
    }
  }

  /**
   * Cancela la entrada del usuario en la lista de espera
   */
  async cancelWaitingList() {
    if (!this.selectedSession || !this.currentUserId) {
      this.error = 'Error: No se pudo procesar la solicitud';
      return;
    }

    this.loading = true;
    this.clearMessages();

    try {
      const sub = this.waitingListService.cancelWaitingList(
        this.currentUserId,
        this.selectedSession.id
      ).subscribe({
        next: () => {
          this.successMessage = 'Has sido removido de la lista de espera';
          this.loadWaitingListStatus(); // Recargar estado
          this.loading = false;
        },
        error: (error) => {
          console.error('Error cancelling waiting list:', error);
          this.error = error.message || 'Error al cancelar la lista de espera';
          this.loading = false;
        }
      });
      this.subscriptions.push(sub);

    } catch (error: any) {
      console.error('Error cancelling waiting list:', error);
      this.error = error.message || 'Error al cancelar la lista de espera';
      this.loading = false;
    }
  }

  /**
   * Verifica si puede unirse a la lista de espera
   */
  canJoinWaitingList(): boolean {
    if (!this.selectedSession) return false;
    
    const classIsFull = !this.isClassAvailable();
    const hasPackage = this.hasAvailablePackageForClass(this.selectedSession.class_type_name || '');
    const notInWaitingList = !this.isInWaitingList;
    
    return classIsFull && hasPackage && notInWaitingList;
  }

  // =============================
  // SISTEMA DE FILTROS
  // =============================

  /**
   * Alterna el estado de un filtro de tipo de clase
   */
  toggleFilter(typeName: string): void {
    const classType = this.classTypes.find(type => type.name === typeName);
    if (classType) {
      classType.active = !classType.active;
      this.applyFilters();
    }
  }

  /**
   * Aplica los filtros activos a las clases y actualiza el calendario
   */
  applyFilters(): void {
    const activeTypes = this.classTypes
      .filter(type => type.active)
      .map(type => type.name);

    this.filteredClassSessions = this.classSessions.filter(session => 
      activeTypes.includes(session.class_type_name || '')
    );

    this.updateCalendarEvents();
  }

  /**
   * Activa todos los filtros
   */
  showAllClasses(): void {
    this.classTypes.forEach(type => type.active = true);
    this.applyFilters();
  }

  /**
   * Desactiva todos los filtros excepto uno
   */
  showOnlyClass(typeName: string): void {
    this.classTypes.forEach(type => type.active = type.name === typeName);
    this.applyFilters();
  }

  /**
   * Obtiene el número de filtros activos
   */
  getActiveFiltersCount(): number {
    return this.classTypes.filter(type => type.active).length;
  }
}
