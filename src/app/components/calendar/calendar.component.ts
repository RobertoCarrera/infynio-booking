import { Component, OnInit, OnDestroy, ChangeDetectorRef, signal, HostListener, ElementRef, ViewChild, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { FullCalendarModule } from '@fullcalendar/angular';
import { CalendarOptions } from '@fullcalendar/core';
import { ClassSessionsService, ClassSession } from '../../services/class-sessions.service';
import { CarteraClasesService } from '../../services/cartera-clases.service';
import { WaitingListService } from '../../services/waiting-list.service';
import { SupabaseService } from '../../services/supabase.service';
import { FULLCALENDAR_OPTIONS } from './fullcalendar-config';
import { CalendarToolbarComponent } from './calendar-toolbar.component';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-calendar',
  standalone: true,
  imports: [CommonModule, FormsModule, FullCalendarModule, CalendarToolbarComponent],
  templateUrl: './calendar.component.html',
  styleUrls: ['./calendar.component.css']
})
export class CalendarComponent implements OnInit, OnDestroy, AfterViewInit {
  @ViewChild('fullCal', { static: false }) fullCalRef!: ElementRef<any>;
  @ViewChild('calendarContent', { static: false }) calendarContentRef!: ElementRef<HTMLElement>;
  // store a direct calendar API reference when available
  private calendarApi: any = null;
  isMobile = false;
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
  currentUserId: string | null = null; // UUID
  userNumericId: number | null = null; // id numérico
  
  // Propiedades para lista de espera
  isInWaitingList = false;
  waitingListPosition = 0;
  waitingListCount = 0;
  
  private subscriptions: Subscription[] = [];
  private isAdmin = false;
  private eventsLoaded = false;

  // Cached range for data loading and validRange
  private rangeStartDate: string | null = null;
  private rangeEndDate: string | null = null;
  // Lazy-load helpers
  private cacheByDate = new Map<string, ClassSession[]>();
  private fetchedWindows: Array<{ start: string; end: string }>=[]; // inclusive dates (YYYY-MM-DD)
  private lastVisibleStart: string | null = null;
  private lastVisibleEnd: string | null = null;

  // Toolbar state
  currentRangeLabel: string | null = null;
  currentView: 'day' | 'week' | 'month' = 'week';
  private keyboardHandlerBound = false;
  mobileFiltersOpen = false;
  private mobileFiltersTimeout: any = null;

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
  datesSet: this.onDatesSet.bind(this),
  events: this.events
    };
  }

  ngAfterViewInit() {
    // detect mobile based on viewport width
    try { this.isMobile = (typeof window !== 'undefined') && window.innerWidth < 992; } catch {}
    // attach touch listeners for swipe navigation on mobile
    try {
      const el = this.calendarContentRef?.nativeElement;
      if (el && this.isMobile) {
        let startX: number | null = null;
        let startY: number | null = null;
        const onTouchStart = (ev: TouchEvent) => {
          if (ev.touches && ev.touches.length === 1) {
            startX = ev.touches[0].clientX;
            startY = ev.touches[0].clientY;
          }
        };
        const onTouchEnd = (ev: TouchEvent) => {
          if (startX == null || startY == null) return;
          const endX = ev.changedTouches[0].clientX;
          const endY = ev.changedTouches[0].clientY;
          const dx = endX - startX;
          const dy = endY - startY;
          // require horizontal swipe with sufficient magnitude and mostly horizontal
          if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) {
            if (dx < 0) this.onNext(); else this.onPrev();
          }
          startX = null; startY = null;
        };
        el.addEventListener('touchstart', onTouchStart, { passive: true });
        el.addEventListener('touchend', onTouchEnd, { passive: true });
      }
    } catch (e) {
      // non-critical
    }
    // listen to resize to update isMobile
    try {
      if (typeof window !== 'undefined') {
        window.addEventListener('resize', this.onResizeBound as any);
      }
    } catch {}
  }

  // Devuelve una versión corta del nombre para móviles: 3 letras por palabra
  getMobileShortName(fullName: string | undefined | null): string {
    if (!fullName) return '';
    try {
      // Solo aplicar truncado en pantallas pequeñas
      if (typeof window !== 'undefined' && window.innerWidth >= 992) return fullName;
      return fullName
        .split(/\s+/)
        .map(w => w.substring(0, 3))
        .join(' ');
    } catch (e) {
      return fullName;
    }
  }

  ngOnInit() {
    // restore view from localStorage if present
    try {
      const savedView = localStorage.getItem('calendar:view');
      if (savedView === 'day' || savedView === 'week' || savedView === 'month') {
        this.currentView = savedView as any;
        this.setCalendarView(this.currentView);
      }
    } catch (e) {}
    // keyboard handlers
    if (typeof window !== 'undefined' && !this.keyboardHandlerBound) {
      window.addEventListener('keydown', this.globalKeyHandler as any);
      this.keyboardHandlerBound = true;
    }
    this.getCurrentUser();
  }

  ngOnDestroy() {
    this.subscriptions.forEach(sub => sub.unsubscribe());
    if (typeof window !== 'undefined' && this.keyboardHandlerBound) {
      window.removeEventListener('keydown', this.globalKeyHandler as any);
      this.keyboardHandlerBound = false;
    }
    try { if (typeof window !== 'undefined') window.removeEventListener('resize', this.onResizeBound as any); } catch {}
  }

  // resize handler (bound) to update isMobile dynamically
  private onResizeBound = () => {
    try {
      const wasMobile = this.isMobile;
      this.isMobile = (typeof window !== 'undefined') && window.innerWidth < 992;
      // if we transitioned to desktop, close mobile panel
      if (wasMobile && !this.isMobile) this.setMobileFiltersOpen(false);
    } catch {}
  }

  // global keyboard shortcuts
  private globalKeyHandler = (e: KeyboardEvent) => {
    if ((e.target as HTMLElement)?.tagName === 'INPUT' || (e.target as HTMLElement)?.tagName === 'TEXTAREA') return;
    const key = e.key;
    if (key === 'ArrowLeft') {
      this.onPrev();
      e.preventDefault();
    } else if (key === 'ArrowRight') {
      this.onNext();
      e.preventDefault();
    } else if (key.toLowerCase() === 't') {
      this.goToday();
      e.preventDefault();
    } else if (key === '1') {
      this.setView('day');
      e.preventDefault();
    } else if (key === '2') {
      this.setView('week');
      e.preventDefault();
    } else if (key === '3') {
      this.setView('month');
      e.preventDefault();
    }
  }

  // Toolbar exposed handlers
  onPrev() {
    try {
      if (this.calendarApi && typeof this.calendarApi.prev === 'function') return this.calendarApi.prev();
      const fallback = (this.calendarOptions as any).calendarApi;
      if (fallback && typeof fallback.prev === 'function') return fallback.prev();
    } catch {}
  }

  onNext() {
    try {
      if (this.calendarApi && typeof this.calendarApi.next === 'function') return this.calendarApi.next();
      const fallback = (this.calendarOptions as any).calendarApi;
      if (fallback && typeof fallback.next === 'function') return fallback.next();
    } catch {}
  }

  goToday() {
    try {
      if (this.calendarApi && typeof this.calendarApi.today === 'function') return this.calendarApi.today();
      const fallback = (this.calendarOptions as any).calendarApi;
      if (fallback && typeof fallback.today === 'function') return fallback.today();
    } catch {}
  }

  setView(view: string) {
    // accept any string from template; validate and apply
    if (view !== 'day' && view !== 'week' && view !== 'month') return;
    this.currentView = view as any;
    try { this.setCalendarView(view); } catch {}
    try { localStorage.setItem('calendar:view', view); } catch {}
  }

  toggleFiltersPanel() {
    this.setMobileFiltersOpen(!this.mobileFiltersOpen);
  }

  setMobileFiltersOpen(open: boolean) {
    // small debounce to allow transition to start
    try { if (this.mobileFiltersTimeout) clearTimeout(this.mobileFiltersTimeout); } catch {}
    this.mobileFiltersOpen = open;
    if (open) {
      this.mobileFiltersTimeout = setTimeout(() => {
        const first = document.querySelector('.mobile-filters-panel .filter-item') as HTMLElement | null;
        if (first) first.focus();
      }, 200);
    }
  }

  closeMobileFilters() { this.setMobileFiltersOpen(false); }

  private setCalendarView(view: string) {
  // prevent month view on mobile
  if (this.isMobile && view === 'month') return;
  const api = this.calendarApi || (this.calendarOptions as any).calendarApi;
  if (!api) return;
  if (view === 'day') api.changeView('timeGridDay');
  if (view === 'week') api.changeView('timeGridWeek');
  if (view === 'month') api.changeView('dayGridMonth');
  }

  private getCurrentUser() {
    const sub = this.supabaseService.getCurrentUser().subscribe({
      next: (user) => {
        if (user) {
          // Obtener el ID del usuario desde la tabla users
          this.supabaseService.supabase
            .from('users')
            .select('id, auth_user_id')
            .eq('auth_user_id', user.id)
            .single()
            .then(({ data, error }) => {
              if (!error && data) {
                this.currentUserId = data.auth_user_id;
                this.userNumericId = data.id;
                console.log('Current user UUID:', this.currentUserId, 'Numeric ID:', this.userNumericId);
                // Obtener rol y luego cargar eventos con el rango adecuado
                const roleSub = this.supabaseService.getCurrentUserRole().subscribe(role => {
                  this.isAdmin = (role === 'admin');
                  this.computeDateRange();
                  this.applyValidRangeOption();
                  this.loadEvents();
                });
                this.subscriptions.push(roleSub);
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
    if (!this.userNumericId) return;
    if (this.isAdmin) {
      // Admin: keep wide fetch once
      const startDate = this.rangeStartDate || new Date().toISOString().split('T')[0];
      const endDate = this.rangeEndDate || new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const sub = this.classSessionsService.getSessionsForCalendar(this.userNumericId, startDate, endDate).subscribe({
        next: (sessions) => {
          this.events = this.transformSessionsToEvents(sessions);
          this.extractClassTypes(sessions);
          this.updateCalendarEvents();
        },
        error: (error) => {
          console.warn('Fallo get_sessions_for_calendar, fallback a contadores:', error);
          const sub2 = this.classSessionsService.getSessionsWithBookingCounts(startDate, endDate).subscribe({
            next: (sessions) => {
              this.events = this.transformSessionsToEvents(sessions);
              this.extractClassTypes(sessions);
              this.updateCalendarEvents();
            },
            error: (err2) => console.error('Error loading events (fallback):', err2)
          });
          this.subscriptions.push(sub2);
        }
      });
      this.subscriptions.push(sub);
      return;
    }

    // Users: lazy load for current view range (or default to this week)
    let start = this.lastVisibleStart;
    let end = this.lastVisibleEnd;
    if (!start || !end) {
      const now = new Date();
      const day = now.getDay();
      const diffToMonday = (day + 6) % 7;
      const weekStart = new Date(now);
      weekStart.setDate(now.getDate() - diffToMonday);
      weekStart.setHours(0, 0, 0, 0);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 6);
      weekEnd.setHours(23, 59, 59, 999);
      start = weekStart.toISOString().split('T')[0];
      end = weekEnd.toISOString().split('T')[0];
    }
    this.fetchAndRenderRange(start, end, true);
  }

  private computeDateRange() {
    if (this.isAdmin) {
      // Admin sin límites: rango amplio (1 año hacia adelante)
      this.rangeStartDate = this.formatDate(new Date());
      this.rangeEndDate = this.formatDate(new Date(Date.now() + 365 * 24 * 60 * 60 * 1000));
      return;
    }
    const now = new Date();
    // Inicio: lunes de la semana actual (España)
    const day = now.getDay(); // 0-Domingo ... 6-Sábado
    const diffToMonday = (day + 6) % 7; // convierte lunes=0
    const start = new Date(now);
    start.setDate(now.getDate() - diffToMonday);
    start.setHours(0, 0, 0, 0);
    // Fin: último día del mes siguiente
    const end = new Date(now.getFullYear(), now.getMonth() + 2, 0);
    end.setHours(23, 59, 59, 999);
    this.rangeStartDate = this.formatDate(start);
    this.rangeEndDate = this.formatDate(end);
  }

  // FullCalendar datesSet callback
  private onDatesSet(arg: any) {
  if (this.isAdmin) return; // admins unaffected
  // capture calendar API reference when available
  try { if (arg && arg.view && arg.view.calendar) this.calendarApi = arg.view.calendar; } catch {}
  // Usar fechas locales para evitar saltos por zona horaria
  const startStr = this.formatDate(new Date(arg.start));
    // arg.endStr is exclusive in FullCalendar; subtract one day for inclusive logic
    let endDate = new Date(arg.end);
    endDate.setDate(endDate.getDate() - 1);
  const endStr = this.formatDate(endDate);
    this.lastVisibleStart = startStr;
    this.lastVisibleEnd = endStr;
    this.fetchAndRenderRange(startStr, endStr);
    // update toolbar label
    try {
      const s = new Date(arg.start);
      const e = new Date(arg.end);
      const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' } as any;
      const label = `${s.toLocaleDateString('es-ES', opts)} - ${new Date(e.getTime() - 1).toLocaleDateString('es-ES', opts)}`;
      this.currentRangeLabel = label;
    } catch {}
  }

  private clipToValidRange(start: string, end: string): { start: string; end: string } {
    const s = new Date(start);
    const e = new Date(end);
    const vrStart = new Date(this.rangeStartDate!);
    const vrEnd = new Date(this.rangeEndDate!);
    const clipStart = s < vrStart ? this.rangeStartDate! : start;
    const clipEnd = e > vrEnd ? this.rangeEndDate! : end;
    return { start: clipStart, end: clipEnd };
  }

  private isRangeFetched(start: string, end: string): boolean {
    // Simple check: if there exists a fetched window that fully covers [start,end]
    const s = new Date(start).getTime();
    const e = new Date(end).getTime();
    return this.fetchedWindows.some(w => new Date(w.start).getTime() <= s && new Date(w.end).getTime() >= e);
  }

  private markRangeFetched(start: string, end: string) {
    // Merge with overlapping windows to avoid fragmentation
    const newS = new Date(start).getTime();
    const newE = new Date(end).getTime();
    const kept: Array<{ start: string; end: string }> = [];
    let mergedStart = start;
    let mergedEnd = end;
    for (const w of this.fetchedWindows) {
      const ws = new Date(w.start).getTime();
      const we = new Date(w.end).getTime();
      const overlaps = !(we < newS || ws > newE);
      if (overlaps) {
        if (ws < new Date(mergedStart).getTime()) mergedStart = w.start;
        if (we > new Date(mergedEnd).getTime()) mergedEnd = w.end;
      } else {
        kept.push(w);
      }
    }
    kept.push({ start: mergedStart, end: mergedEnd });
    this.fetchedWindows = kept;
  }

  private sessionsInRange(start: string, end: string): ClassSession[] {
    const out: ClassSession[] = [];
    const s = new Date(start).getTime();
    const e = new Date(end).getTime();
    for (const [dateStr, sessions] of this.cacheByDate.entries()) {
      const d = new Date(dateStr).getTime();
      if (d >= s && d <= e) out.push(...sessions);
    }
    return out;
  }

  private addToCache(sessions: ClassSession[]) {
    for (const s of sessions) {
      const key = s.schedule_date;
      const arr = this.cacheByDate.get(key) || [];
      // Replace by id to ensure latest data (counts/self flags) are reflected
      const idx = arr.findIndex(x => x.id === s.id);
      if (idx >= 0) {
        arr[idx] = s;
      } else {
        arr.push(s);
      }
      this.cacheByDate.set(key, arr);
    }
  }

  private fetchAndRenderRange(start: string, end: string, force = false) {
    if (!this.userNumericId) return;
    // Clip to allowed validRange
    const { start: clipStart, end: clipEnd } = this.clipToValidRange(start, end);
    const needFetch = force || !this.isRangeFetched(clipStart, clipEnd);
    const renderFromCache = () => {
      const sessions = this.sessionsInRange(clipStart, clipEnd);
      this.events = this.transformSessionsToEvents(sessions);
      this.extractClassTypes(sessions);
      this.updateCalendarEvents();
    };
    if (!needFetch) {
      renderFromCache();
      return;
    }
    const sub = this.classSessionsService.getSessionsForCalendar(this.userNumericId, clipStart, clipEnd).subscribe({
      next: (sessions) => {
        this.addToCache(sessions);
        this.markRangeFetched(clipStart, clipEnd);
        renderFromCache();
        // Prefetch next week to make navigation snappy
        try {
          const endDate = new Date(clipEnd);
          const nextStartDate = new Date(endDate);
          nextStartDate.setDate(endDate.getDate() + 1);
          const nextEndDate = new Date(nextStartDate);
          nextEndDate.setDate(nextStartDate.getDate() + 6);
          const ns = this.formatDate(nextStartDate);
          const ne = this.formatDate(nextEndDate);
          const { start: pStart, end: pEnd } = this.clipToValidRange(ns, ne);
          if (!this.isRangeFetched(pStart, pEnd)) {
            this.classSessionsService.getSessionsForCalendar(this.userNumericId!, pStart, pEnd).subscribe({
              next: (nextSessions) => {
                this.addToCache(nextSessions);
                this.markRangeFetched(pStart, pEnd);
              },
              error: () => { /* silent prefetch failure */ }
            });
          }
        } catch {}
      },
      error: (error) => {
        console.warn('Fallo get_sessions_for_calendar, fallback a contadores:', error);
        const sub2 = this.classSessionsService.getSessionsWithBookingCounts(clipStart, clipEnd).subscribe({
          next: (sessions2) => {
            this.addToCache(sessions2);
            this.markRangeFetched(clipStart, clipEnd);
            renderFromCache();
          },
          error: (err2) => console.error('Error loading events (fallback):', err2)
        });
        this.subscriptions.push(sub2);
      }
    });
    this.subscriptions.push(sub);
  }

  // Formatea fecha local a YYYY-MM-DD sin cambios por zona horaria
  private formatDate(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  // Format a date-like input into "weekday, d de Month" with Month capitalized (es-ES)
  formatDateCapitalMonth(input: string | Date | null | undefined): string {
    if (!input) return '';
    try {
      const d = (typeof input === 'string') ? (input.includes('T') ? new Date(input) : new Date(input + 'T00:00:00')) : new Date(input);
  let formatted = new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric', month: 'long' }).format(d);
  // Capitalize the first character (weekday) and the last token (month) initial letter
  formatted = formatted.charAt(0).toUpperCase() + formatted.slice(1);
  formatted = formatted.replace(/([^,\s]+)\s*$/u, (m) => m.charAt(0).toUpperCase() + m.slice(1));
  return formatted;
    } catch (e) {
      return String(input);
    }
  }

  // Format time part as HH:MM from either a time string (HH:MM[:SS]) or a Date/ISO string
  formatTimeHHMM(input: string | Date | null | undefined): string {
    if (!input) return '';
    try {
      if (typeof input === 'string') {
        // If ISO datetime
        if (input.includes('T')) {
          const d = new Date(input);
          return d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
        }
        // If time like HH:MM:SS or HH:MM
        const m = input.match(/^(\d{2}:\d{2})/);
        if (m) return m[1];
      }
      const d = (input instanceof Date) ? input : new Date(String(input));
      return d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
    } catch (e) {
      return String(input).slice(0,5);
    }
  }

  // Format date+time: capitalized month + HH:MM
  formatDateCapitalMonthWithTime(input: string | Date | null | undefined): string {
    if (!input) return '';
    try {
      const datePart = this.formatDateCapitalMonth(input);
      const timePart = this.formatTimeHHMM(input);
      return timePart ? `${datePart}, ${timePart}` : datePart;
    } catch (e) { return this.formatDateCapitalMonth(input); }
  }
  private applyValidRangeOption() {
    if (this.isAdmin) {
      // Admin: sin validRange
      this.calendarOptions = {
        ...this.calendarOptions,
        validRange: undefined
      };
      return;
    }
    // Usuarios: limitar navegación al rango calculado
    const start = this.rangeStartDate!;
    // validRange.end es exclusivo; sumar un día para permitir el último día completo
    const endDateObj = new Date(this.rangeEndDate!);
    const endPlusOne = new Date(endDateObj.getFullYear(), endDateObj.getMonth(), endDateObj.getDate() + 1)
      .toISOString()
      .split('T')[0];
    this.calendarOptions = {
      ...this.calendarOptions,
      validRange: { start, end: endPlusOne }
    };
  }

  private transformSessionsToEvents(sessions: ClassSession[]): any[] {
    try {
      const safeSessions = (sessions || []).filter((session: any) => session && session.id != null && session.schedule_date && session.schedule_time);
      return safeSessions.map(session => {
    const colors = this.classSessionsService.getEventColors(session);
    const availableSpots = this.classSessionsService.getAvailableSpots(session);
  const confirmedCount = this.getConfirmedCount(session);
    const isFull = confirmedCount >= (session.capacity || 0);
    const isAvailable = !isFull;
      const selfTag = session.is_self_booked ? ' (Tú)' : '';

      return {
        id: session.id.toString(),
        title: `${session.class_type_name}${selfTag} (${confirmedCount}/${session.capacity})`,
        start: `${session.schedule_date}T${session.schedule_time}`,
        backgroundColor: colors.background,
        borderColor: colors.border,
        textColor: '#ffffff',
        extendedProps: {
          session: session,
      available: !isFull,
          availableSpots: availableSpots
        },
        classNames: [
      isFull ? 'full-class' : 'available-class',
          `class-type-${session.class_type_name?.toLowerCase().replace(/\s+/g, '-')}`
        ]
      };
      });
    } catch (e) {
      console.error('[calendar] transformSessionsToEvents error', e);
      return [];
    }
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
    const filteredEvents = (this.events || [])
      .filter(Boolean)
      .filter(event => event?.extendedProps?.session?.class_type_name && filteredTypes.has(event.extendedProps.session.class_type_name));
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
    
  // Validar estructura antes de acceder
  if (!eventInfo || !eventInfo.event || !eventInfo.event.extendedProps || !eventInfo.event.extendedProps.session) {
      console.warn('[calendar] Click en evento sin sesión asociada, ignorando');
      return;
    }
  // Siempre obtener la versión más reciente del objeto sesión del evento
  const session = eventInfo.event.extendedProps.session as ClassSession;
    const confirmedCount = this.getConfirmedCount(session);
    
    console.log('📊 Session data:', {
      session,
      confirmedCount,
      classTypeName: session.class_type_name,
      classTypeId: session.class_type_id
    });

  // Si ya estás reservado, abrir modal directamente para opción de cancelar
  if (session.is_self_booked) {
      this.selectedSession = session;
      this.showBookingModal = true;
      this.loadingModal = false;
      this.modalError = '';
      this.modalSuccess = '';
      this.userCanBook = false;
      return;
    }

  // Si está completa y no está reservado => lista de espera (excepto personalizadas)
  const isPersonalClass = [4, 22, 23].includes(session.class_type_id);
  if (confirmedCount >= (session.capacity || 0) && !isPersonalClass && !session.is_self_booked) {
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
    if (!this.userNumericId) {
      this.modalError = 'Error: Usuario no identificado';
      this.loadingModal = false;
      return;
    }

  const classTypeId = session.class_type_id; // Usar el ID numérico
  // Detectar personal por IDs conocidos (4, 22, 23) en lugar del nombre
  const isPersonal = [4, 22, 23].includes(classTypeId);

    console.log('🔍 Verificando disponibilidad:', {
      userId: this.userNumericId,
      classTypeId,
      classTypeName: session.class_type_name,
      isPersonal
    });

    // Verificar si el usuario tiene clases disponibles de este tipo
    const sub = this.carteraService.tieneClasesDisponibles(this.userNumericId, classTypeId, isPersonal)
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

  // Contador robusto de confirmados, evitando depender de available_spots
  private getConfirmedCount(session: ClassSession): number {
    if (typeof session.confirmed_bookings_count === 'number') return session.confirmed_bookings_count;
    // As a weak fallback, infer from available_spots only if present and numeric.
    if (typeof session.available_spots === 'number' && typeof session.capacity === 'number') {
      return Math.max(0, session.capacity - session.available_spots);
    }
    // Last resort: derive from bookings array (may be RLS-limited in some envs)
    const confirmed = session.bookings?.filter(b => (b.status || '').toUpperCase() === 'CONFIRMED').length || 0;
    return confirmed;
  }

  // FUNCIÓN CORREGIDA - Confirmar reserva
  confirmBooking() {
    if (!this.selectedSession || !this.userNumericId) {
      return;
    }

    this.loadingModal = true;
    this.modalError = '';

    // Usar el ID numérico del tipo de clase
    const bookingRequest = {
      user_id: this.userNumericId,
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
          // Forzar modo cancelación en el mismo modal inmediatamente
          if (this.selectedSession) {
            this.selectedSession.is_self_booked = true;
            this.selectedSession.self_booking_id = result.booking_id || this.selectedSession.self_booking_id || 0;
            // Si la API devolvió el deadline, úsalo; si no, recarga eventos (lo recalcula en BD)
            if (!this.selectedSession.self_cancellation_time) {
              // Recalcular al recargar eventos; mientras, deshabilitar cancel si no hay dato
              // but we call loadEvents right away
            }
          }
          
          // Recargar eventos para mostrar la nueva reserva
          this.loadEvents();
          
          // No cerrar el modal: transformar a estado de cancelación
        },
        error: (error) => {
          console.error('❌ Error creando reserva:', error);
          this.loadingModal = false;
          const msg = (error?.message || '').toString();
          // Si la clase está completa, pasar a modo lista de espera
          if (msg.toLowerCase().includes('completa')) {
            this.modalError = '';
            if (this.selectedSession) {
              this.handleWaitingList(this.selectedSession);
            }
          } else {
            this.modalError = msg || 'Error al crear la reserva';
          }
        }
      });
    this.subscriptions.push(sub);
  }

  // ¿Puede cancelar su reserva según la hora límite?
  canCancelSelectedBooking(): boolean {
    if (!this.selectedSession || !this.selectedSession.is_self_booked) return false;
    // Si no hay self_cancellation_time, calcular 12h antes localmente como respaldo
    let cutoff = 0;
    if (this.selectedSession.self_cancellation_time) {
      cutoff = new Date(this.selectedSession.self_cancellation_time).getTime();
    } else if (this.selectedSession.schedule_date && this.selectedSession.schedule_time) {
      const start = new Date(`${this.selectedSession.schedule_date}T${this.selectedSession.schedule_time}`);
      cutoff = start.getTime() - 12 * 60 * 60 * 1000;
    }
    return Date.now() <= cutoff;
  }

  // Cancelar la reserva propia
  cancelOwnBooking() {
    if (!this.selectedSession || !this.userNumericId || !this.selectedSession.self_booking_id) return;
    if (!this.canCancelSelectedBooking()) {
      this.modalError = 'No se puede cancelar: fuera de plazo (menos de 12 horas).';
      return;
    }
    this.loadingModal = true;
    this.modalError = '';
    const bookingId = this.selectedSession.self_booking_id;
    const sub = this.classSessionsService.cancelBooking(bookingId, this.userNumericId)
      .subscribe({
        next: () => {
          this.modalSuccess = 'Reserva cancelada correctamente';
          this.loadingModal = false;
          // Refrescar estado local inmediatamente: ya no está reservado
          if (this.selectedSession) {
            this.selectedSession.is_self_booked = false;
            this.selectedSession.self_booking_id = null;
            this.selectedSession.self_cancellation_time = null;
          }
          // Permitir reservar de nuevo (bono devuelto en backend)
          this.userCanBook = true;
          // Recargar eventos para reflejar plazas
          this.loadEvents();
          // No cerrar automáticamente: dejar que el usuario decida
        },
        error: (err) => {
          this.loadingModal = false;
          this.modalError = err.message || 'Error al cancelar la reserva';
        }
      });
    this.subscriptions.push(sub);
  }

  // Método para manejar lista de espera
  handleWaitingList(session: ClassSession) {
    if (!this.userNumericId) {
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
    const sub1 = this.waitingListService.isUserInWaitingList(this.userNumericId, session.id)
      .subscribe({
        next: (isInList) => {
          this.isInWaitingList = isInList;
          if (isInList) {
            // Obtener posición en la lista
            const sub2 = this.waitingListService.getUserWaitingListPosition(this.userNumericId!, session.id)
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

  // ¿Está llena la sesión seleccionada?
  isSelectedSessionFull(): boolean {
  if (!this.selectedSession) return false;
  // Si ya estoy reservado, no considerar "llena" para efectos de UI (oculta lista de espera)
  if (this.selectedSession.is_self_booked) return false;
  return this.getConfirmedCount(this.selectedSession) >= (this.selectedSession.capacity || 0);
  }

  // ¿Es personalizada la sesión seleccionada?
  isSelectedSessionPersonal(): boolean {
    return !!this.selectedSession && [4, 22, 23].includes(this.selectedSession.class_type_id);
  }

  // Método para unirse a la lista de espera
  joinWaitingList() {
    if (!this.selectedSession || !this.userNumericId) {
      return;
    }

    this.loadingModal = true;
    this.modalError = '';

    const request = {
      user_id: this.userNumericId,
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
          const sub2 = this.waitingListService.getUserWaitingListPosition(this.userNumericId!, this.selectedSession!.id)
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
    if (!this.selectedSession || !this.userNumericId) {
      return;
    }

    this.loadingModal = true;
    this.modalError = '';

    const sub = this.waitingListService.cancelWaitingList(this.userNumericId, this.selectedSession.id)
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