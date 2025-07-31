import { Component, OnInit, OnDestroy, ChangeDetectorRef, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { FullCalendarModule } from '@fullcalendar/angular';
import { CalendarOptions } from '@fullcalendar/core';
import { ClassSessionsService, ClassSession } from '../../services/class-sessions.service';
import { CarteraClasesService } from '../../services/cartera-clases.service';
import { WaitingListService } from '../../services/waiting-list.service';
import { SupabaseService } from '../../services/supabase.service';
import { FULLCALENDAR_OPTIONS } from './fullcalendar-config';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-calendar',
  standalone: true,
  imports: [CommonModule, FormsModule, FullCalendarModule],
  templateUrl: './calendar.component.html',
  styleUrls: ['./calendar.component.css']
})
export class CalendarComponent implements OnInit, OnDestroy {
  calendarOptions: CalendarOptions;
  events: any[] = [];
  filteredClassTypes = signal<Set<string>>(new Set());
  availableClassTypes: { name: string, color: { background: string, border: string } }[] = [];
  
  // Propiedades para el modal de reservas
  selectedSession: ClassSession | null = null;
  showBookingModal = false;
  loadingModal = false;
  modalError = '';
  modalSuccess = '';
  userCanBook = false;
  
  // Propiedades del usuario
  currentUserId: number | null = null;
  
  // Propiedades para lista de espera
  isInWaitingList = false;
  waitingListPosition = 0;
  waitingListCount = 0;
  
  private subscriptions: Subscription[] = [];

  constructor(
    private classSessionsService: ClassSessionsService,
    private carteraService: CarteraClasesService,
    private waitingListService: WaitingListService,
    private supabaseService: SupabaseService,
    private cdr: ChangeDetectorRef
  ) {
    this.calendarOptions = {
      ...FULLCALENDAR_OPTIONS,
      eventClick: this.onEventClick.bind(this),
      events: this.events
    };
  }

  ngOnInit() {
    this.getCurrentUser();
    this.loadEvents();
  }

  ngOnDestroy() {
    this.subscriptions.forEach(sub => sub.unsubscribe());
  }

  private getCurrentUser() {
    const sub = this.supabaseService.getCurrentUser().subscribe({
      next: (user) => {
        if (user) {
          // Obtener el ID del usuario desde la tabla users
          this.supabaseService.supabase
            .from('users')
            .select('id')
            .eq('auth_user_id', user.id)
            .single()
            .then(({ data, error }) => {
              if (!error && data) {
                this.currentUserId = data.id;
                console.log('Current user ID:', this.currentUserId);
              }
            });
        }
      },
      error: (error) => {
        console.error('Error getting current user:', error);
      }
    });
    this.subscriptions.push(sub);
  }

  loadEvents() {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 7);
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + 90);

    const sub = this.classSessionsService.getClassSessionsByDateRange(
      startDate.toISOString().split('T')[0],
      endDate.toISOString().split('T')[0]
    ).subscribe({
      next: (sessions) => {
        this.events = this.transformSessionsToEvents(sessions);
        this.extractClassTypes(sessions);
        this.updateCalendarEvents();
      },
      error: (error) => {
        console.error('Error loading events:', error);
      }
    });
    this.subscriptions.push(sub);
  }

  private transformSessionsToEvents(sessions: ClassSession[]): any[] {
    return sessions.map(session => {
      const isAvailable = this.classSessionsService.isSessionAvailable(session);
      const colors = this.classSessionsService.getEventColors(session);
      const availableSpots = this.classSessionsService.getAvailableSpots(session);

      return {
        id: session.id.toString(),
        title: `${session.class_type_name} (${availableSpots}/${session.capacity})`,
        start: `${session.schedule_date}T${session.schedule_time}`,
        backgroundColor: colors.background,
        borderColor: colors.border,
        textColor: '#ffffff',
        extendedProps: {
          session: session,
          available: isAvailable,
          availableSpots: availableSpots
        },
        classNames: [
          isAvailable ? 'available-class' : 'full-class',
          `class-type-${session.class_type_name?.toLowerCase().replace(/\s+/g, '-')}`
        ]
      };
    });
  }

  private extractClassTypes(sessions: ClassSession[]) {
    const typeSet = new Set<string>();
    const typeColorsMap = new Map<string, { background: string, border: string }>();

    sessions.forEach(session => {
      if (session.class_type_name) {
        typeSet.add(session.class_type_name);
        if (!typeColorsMap.has(session.class_type_name)) {
          typeColorsMap.set(session.class_type_name, this.classSessionsService.getClassTypeColors(session.class_type_name));
        }
      }
    });

    this.availableClassTypes = Array.from(typeSet).map(typeName => ({
      name: typeName,
      color: typeColorsMap.get(typeName) || { background: '#6b7280', border: '#4b5563' }
    }));

    // Inicializar con todos los tipos visibles
    this.filteredClassTypes.set(new Set(Array.from(typeSet)));
  }

  private updateCalendarEvents() {
    const filteredTypes = this.filteredClassTypes();
    const filteredEvents = this.events.filter(event => 
      filteredTypes.has(event.extendedProps.session.class_type_name)
    );
    
    this.calendarOptions = {
      ...this.calendarOptions,
      events: filteredEvents
    };
  }

  toggleClassTypeFilter(typeName: string) {
    const current = new Set(this.filteredClassTypes());
    if (current.has(typeName)) {
      current.delete(typeName);
    } else {
      current.add(typeName);
    }
    this.filteredClassTypes.set(current);
    this.updateCalendarEvents();
  }

  isClassTypeVisible(typeName: string): boolean {
    return this.filteredClassTypes().has(typeName);
  }

  // FUNCIÓN CORREGIDA - Manejo de click en eventos del calendario
  onEventClick(eventInfo: any) {
    console.log('🔄 Event clicked:', eventInfo.event);
    
    const session = eventInfo.event.extendedProps.session;
    const availableSpots = this.classSessionsService.getAvailableSpots(session);
    
    console.log('📊 Session data:', {
      session,
      availableSpots,
      classTypeName: session.class_type_name,
      classTypeId: session.class_type_id
    });

    if (availableSpots <= 0) {
      this.handleWaitingList(session);
      return;
    }

    this.selectedSession = session;
    this.loadingModal = true;
    this.showBookingModal = true;
    this.modalError = '';
    this.modalSuccess = '';

    // Verificar disponibilidad usando el ID numérico de class_type
    this.checkUserClassAvailability(session);
  }

  // NUEVA FUNCIÓN - Verificar disponibilidad de clases del usuario
  private checkUserClassAvailability(session: any) {
    if (!this.currentUserId) {
      this.modalError = 'Error: Usuario no identificado';
      this.loadingModal = false;
      return;
    }

    const classTypeId = session.class_type_id; // Usar el ID numérico
    const isPersonal = session.class_type_name?.toLowerCase().includes('personalizada') || false;

    console.log('🔍 Verificando disponibilidad:', {
      userId: this.currentUserId,
      classTypeId,
      classTypeName: session.class_type_name,
      isPersonal
    });

    // Verificar si el usuario tiene clases disponibles de este tipo
    const sub = this.carteraService.tieneClasesDisponibles(this.currentUserId, classTypeId, isPersonal)
      .subscribe({
        next: (hasClasses: boolean) => {
          console.log('✅ Resultado verificación:', hasClasses);
          
          this.userCanBook = hasClasses;
          this.loadingModal = false;

          if (!hasClasses) {
            this.modalError = `No tienes un paquete disponible para clases de tipo "${session.class_type_name}". Contacta con recepción para adquirir un paquete.`;
          }
        },
        error: (error: any) => {
          console.error('❌ Error verificando disponibilidad:', error);
          this.userCanBook = false;
          this.loadingModal = false;
          this.modalError = 'Error verificando la disponibilidad de tus clases.';
        }
      });
    this.subscriptions.push(sub);
  }

  // FUNCIÓN CORREGIDA - Confirmar reserva
  confirmBooking() {
    if (!this.selectedSession || !this.currentUserId) {
      return;
    }

    this.loadingModal = true;
    this.modalError = '';

    // Usar el ID numérico del tipo de clase
    const bookingRequest = {
      user_id: this.currentUserId,
      class_session_id: this.selectedSession.id,
      class_type: this.selectedSession.class_type_name || ''
    };

    console.log('🔄 Creando reserva:', bookingRequest);

    const sub = this.classSessionsService.createBooking(bookingRequest)
      .subscribe({
        next: (result) => {
          console.log('✅ Reserva creada:', result);
          this.modalSuccess = 'Reserva confirmada exitosamente';
          this.loadingModal = false;
          
          // Recargar eventos para mostrar la nueva reserva
          this.loadEvents();
          
          // Cerrar modal después de 2 segundos
          setTimeout(() => {
            this.closeBookingModal();
          }, 2000);
        },
        error: (error) => {
          console.error('❌ Error creando reserva:', error);
          this.loadingModal = false;
          this.modalError = error.message || 'Error al crear la reserva';
        }
      });
    this.subscriptions.push(sub);
  }

  // Método para manejar lista de espera
  handleWaitingList(session: ClassSession) {
    if (!this.currentUserId) {
      console.error('Usuario no identificado');
      return;
    }

    this.selectedSession = session;
    this.showBookingModal = true;
    this.loadingModal = true;
    this.modalError = '';
    this.modalSuccess = '';
    this.userCanBook = false;

    // Verificar si el usuario ya está en la lista de espera
    const sub1 = this.waitingListService.isUserInWaitingList(this.currentUserId, session.id)
      .subscribe({
        next: (isInList) => {
          this.isInWaitingList = isInList;
          if (isInList) {
            // Obtener posición en la lista
            const sub2 = this.waitingListService.getUserWaitingListPosition(this.currentUserId!, session.id)
              .subscribe({
                next: (position) => {
                  this.waitingListPosition = position;
                  this.loadingModal = false;
                },
                error: (error) => {
                  console.error('Error obteniendo posición en lista de espera:', error);
                  this.loadingModal = false;
                }
              });
            this.subscriptions.push(sub2);
          } else {
            this.loadingModal = false;
          }
        },
        error: (error) => {
          console.error('Error verificando lista de espera:', error);
          this.loadingModal = false;
          this.modalError = 'Error verificando tu estado en la lista de espera';
        }
      });
    this.subscriptions.push(sub1);

    // Obtener total de personas en lista de espera
    const sub3 = this.waitingListService.getWaitingListCount(session.id)
      .subscribe({
        next: (count) => {
          this.waitingListCount = count;
        },
        error: (error) => {
          console.error('Error obteniendo conteo de lista de espera:', error);
        }
      });
    this.subscriptions.push(sub3);
  }

  // Método para unirse a la lista de espera
  joinWaitingList() {
    if (!this.selectedSession || !this.currentUserId) {
      return;
    }

    this.loadingModal = true;
    this.modalError = '';

    const request = {
      user_id: this.currentUserId,
      class_session_id: this.selectedSession.id,
      status: 'waiting'
    };

    const sub = this.waitingListService.joinWaitingList(request)
      .subscribe({
        next: () => {
          this.modalSuccess = 'Te has unido a la lista de espera exitosamente';
          this.isInWaitingList = true;
          this.loadingModal = false;
          
          // Actualizar posición
          const sub2 = this.waitingListService.getUserWaitingListPosition(this.currentUserId!, this.selectedSession!.id)
            .subscribe({
              next: (position) => {
                this.waitingListPosition = position;
              }
            });
          this.subscriptions.push(sub2);
          
          setTimeout(() => {
            this.closeBookingModal();
          }, 2000);
        },
        error: (error) => {
          console.error('Error uniéndose a lista de espera:', error);
          this.loadingModal = false;
          this.modalError = error.message || 'Error al unirse a la lista de espera';
        }
      });
    this.subscriptions.push(sub);
  }

  // Método para cancelar lista de espera
  async cancelWaitingList() {
    if (!this.selectedSession || !this.currentUserId) {
      return;
    }

    this.loadingModal = true;
    this.modalError = '';

    const sub = this.waitingListService.cancelWaitingList(this.currentUserId, this.selectedSession.id)
      .subscribe({
        next: () => {
          this.modalSuccess = 'Has salido de la lista de espera';
          this.isInWaitingList = false;
          this.waitingListPosition = 0;
          this.loadingModal = false;
          
          setTimeout(() => {
            this.closeBookingModal();
          }, 2000);
        },
        error: (error) => {
          console.error('Error cancelando lista de espera:', error);
          this.loadingModal = false;
          this.modalError = error.message || 'Error al salir de la lista de espera';
        }
      });
    this.subscriptions.push(sub);
  }

  // Método para cerrar el modal
  closeBookingModal() {
    this.showBookingModal = false;
    this.selectedSession = null;
    this.modalError = '';
    this.modalSuccess = '';
    this.userCanBook = false;
    this.isInWaitingList = false;
    this.waitingListPosition = 0;
    this.loadingModal = false;
  }

  // Método para reservar clase (llamado desde el template)
  reserveClass() {
    this.confirmBooking();
  }
}