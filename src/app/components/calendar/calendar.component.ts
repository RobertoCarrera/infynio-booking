import { Component, OnInit, OnDestroy, ChangeDetectorRef, signal, HostListener, ElementRef, ViewChild, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { FullCalendarModule, FullCalendarComponent } from '@fullcalendar/angular';
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
  @ViewChild('calendar', { static: false }) calendarComponent!: FullCalendarComponent;
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

  // Toast notification state
  showToast = false;
  toastMessage = '';
  toastType: 'success' | 'error' = 'success';
  
  private subscriptions: Subscription[] = [];
  private isAdmin = false;
  private eventsLoaded = false;
  // Indica si ya se han obtenido los tipos de clase para poder renderizar el calendario
  public typesLoaded = false;
  // store previous document overflow to restore on destroy
  private _prevHtmlOverflow: string | null = null;
  private _prevBodyOverflow: string | null = null;

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
  // Desktop: allow collapsing the filters column to give more space to the calendar
  desktopFiltersCollapsed = false;
  // After the collapse transition completes we set this to true to fully hide from layout
  desktopFiltersHidden = false;
  // Desktop offcanvas open state
  desktopFiltersOpen = false;
  private mobileFiltersTimeout: any = null;
  // Observers for dynamic UI elements that affect available height
  private _resizeObservers: ResizeObserver[] = [];
  private _boundTransitionHandlers: Array<{ el: Element; handler: (e: Event)=>void }>=[];
  private _mutationObserver: MutationObserver | null = null;
  private _vvHandlers: Array<{ type: string; handler: any }> = [];
  // touch bindings added at runtime (so they can be removed cleanly)
  // use a permissive handler type to avoid strict Event vs TouchEvent mismatch
  private _touchBindings: Array<{ el: Element; name: string; handler: any }> = [];
  // Escape key handler for desktop offcanvas
  private _escapeListener = (e: KeyboardEvent) => {
    try {
      if (e.key === 'Escape' && this.desktopFiltersOpen) {
        this.desktopFiltersOpen = false;
        try { this.adjustCalendarHeight(); } catch {}
      }
    } catch {}
  };

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

  // userRenderEventContent: renderer used by the user-facing calendar to
  // prepend a small level badge (color + name) when level metadata is
  // present on the session's extendedProps. Kept lightweight and uses
  // notranslate attributes to avoid machine-translation of level names.
  userRenderEventContent(arg: any) {
    try {
      const ev = arg?.event;
      const session = ev?.extendedProps?.session;
      const levelName = ev?.extendedProps?.level_name || session?.level_name || null;
      const levelColor = ev?.extendedProps?.level_color || session?.level_color || null;
      const confirmed = ev?.extendedProps?.session?.confirmed_bookings_count ?? ev?.extendedProps?.confirmed_bookings_count ?? null;
      const capacity = ev?.extendedProps?.session?.capacity ?? ev?.extendedProps?.capacity ?? ev?.extendedProps?.session?.capacity ?? null;
      // Debug overlay toggle — Set to true during diagnosis and revert to false afterwards
      const debugCalendarEvents = false;
      let badge = '';
      if (levelName) {
        const color = levelColor || '#6b7280';
        const textColor = this.getContrastColor(color);
        // On mobile week view, shorten level name to 4 characters
        const pillText = (this.isMobile && this.currentView === 'week')
          ? String(levelName).slice(0, 4)
          : levelName;
        badge = `<span class="level-badge notranslate" translate="no" title="${levelName}" style="display:inline-block;margin-right:6px;padding:1px 6px;border-radius:10px;font-size:11px;line-height:16px;background:${color};color:${textColor}">${pillText}</span>`;
      }
      const debugLine = debugCalendarEvents ? `<div style="font-size:10px;color:#333;opacity:0.9;margin-top:4px">lvl:${levelName || '-'} col:${levelColor || '-'} confirmed:${confirmed ?? '-'} cap:${capacity ?? '-'}</div>` : '';
      return { html: `<div class="custom-event-content notranslate" translate="no">${badge}${ev?.title || ''}${debugLine}</div>` };
    } catch (e) {
      return { html: arg?.event?.title || '' };
    }
  }

  ngAfterViewInit() {
    // mark the main app container as calendar-active (for layout CSS)
    try {
      const main = document.getElementById('mainContent');
      if (main) main.classList.add('calendar-active');
    } catch {}
    // detect mobile based on viewport width
    try { this.isMobile = (typeof window !== 'undefined') && window.innerWidth < 992; } catch {}
    // Ensure FullCalendar shows full weekday names where requested:
    try {
      const longWeekday = { weekday: 'long' } as any;
      const views = { ...(this.calendarOptions.views || {}) } as any;
      // Renderer that outputs full weekday names (and day/month). We vary month style by context.
      const weekdayContent = (arg: any) => {
        try {
          const d = (arg && arg.date) ? new Date(arg.date) : new Date();
          // Produce: "Lunes 25" (weekday + day number), no month, no comma
          const parts = new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric' }).formatToParts(d);
          let weekday = '';
          let daynum = '';
          for (const p of parts) {
            if (p.type === 'weekday') weekday = p.value || '';
            if (p.type === 'day') daynum = p.value || '';
          }
          if (!weekday) return '';
          const cap = weekday.charAt(0).toUpperCase() + weekday.slice(1);
          const dayStr = daynum ? String(daynum).padStart(2, '0') : '';
          return `${cap}${dayStr ? ' ' + dayStr : ''}`;
        } catch (e) { return ''; }
      };
      // Short weekday for mobile week view: by default 3 letters + day number,
      // but map miércoles to the special 'Miérco.' label per UX request.
      const weekdayShortContent = (arg: any) => {
        try {
          const d = (arg && arg.date) ? new Date(arg.date) : new Date();
          const parts = new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric' }).formatToParts(d);
          let weekday = '';
          let daynum = '';
          for (const p of parts) {
            if (p.type === 'weekday') weekday = p.value || '';
            if (p.type === 'day') daynum = p.value || '';
          }
          if (!weekday) return '';
          const low = weekday.toLowerCase();
          // Special-case miércoles -> Miérco.
          if (low.startsWith('miér') || low.startsWith('mier')) {
            const dayStr = daynum ? ' ' + String(daynum).padStart(2, '0') : '';
            return `Miérco.${dayStr}`;
          }
          const short = weekday.slice(0, 3);
          const cap = short.charAt(0).toUpperCase() + short.slice(1);
          const dayStr = daynum ? String(daynum).padStart(2, '0') : '';
          return `${cap}${dayStr ? ' ' + dayStr : ''}`;
        } catch (e) { return ''; }
      };

      // Day name only (no numeric day) for mobile single-day view
      const weekdayNameOnly = (arg: any) => {
        try {
          const d = (arg && arg.date) ? new Date(arg.date) : new Date();
          const parts = new Intl.DateTimeFormat('es-ES', { weekday: 'long' }).formatToParts(d);
          let weekday = '';
          for (const p of parts) if (p.type === 'weekday') weekday = p.value || '';
          if (!weekday) return '';
          const low = weekday.toLowerCase();
          if (low.startsWith('miér') || low.startsWith('mier')) return 'Miérco.';
          const cap = weekday.charAt(0).toUpperCase() + weekday.slice(1);
          return cap;
        } catch (e) { return ''; }
      };
      // Always show full weekday in single-day view (mobile and desktop)
  // On single-day view, show only the weekday name on mobile (the toolbar already shows the date)
  views.timeGridDay = { ...(views.timeGridDay || {}), dayHeaderContent: (this.isMobile ? weekdayNameOnly : weekdayContent) };
  // On week view: on mobile show just the weekday name (no numeric day), on desktop show full weekday+day
  views.timeGridWeek = { ...(views.timeGridWeek || {}), dayHeaderContent: (this.isMobile ? weekdayNameOnly : weekdayContent) };
      if (!this.isMobile) {
        // On desktop use full weekday names in month view as well
        views.dayGridMonth = { ...(views.dayGridMonth || {}), dayHeaderContent: weekdayContent };
      }
      this.calendarOptions = { ...this.calendarOptions, views };
      try { this.cdr.detectChanges(); } catch {}
    } catch (e) {}
    // attempt to attach swipe handlers to FullCalendar's internal scroller
    try {
      // try immediately and again after short delays to cope with async rendering
      const tryAttach = () => { try { this.findAndAttachScrollEl(); } catch {} };
      tryAttach();
      setTimeout(tryAttach, 120);
      setTimeout(tryAttach, 420);
      // if after a short delay there are still no scroller-specific bindings,
      // attach a global document-level handler that activates only when the
      // touchstart originates inside the calendar container. This is a robust
      // fallback for FullCalendar builds that render scrollers outside the
      // wrapper element.
      setTimeout(() => {
        try {
          if (this._touchBindings.length === 0) {
            try { this.attachGlobalTouchHandlers(); } catch {}
          }
        } catch {}
      }, 600);
    } catch (e) {}
    // listen to resize to update isMobile
    try {
      if (typeof window !== 'undefined') {
        window.addEventListener('resize', this.onResizeBound as any);
  // escape handler for offcanvas
  window.addEventListener('keydown', this._escapeListener as any);
      }
    } catch {}

    // Prevent the outer page from scrolling while the calendar component is active
    try {
      if (typeof document !== 'undefined') {
        const html = document.documentElement as HTMLElement;
        const body = document.body as HTMLElement;
        this._prevHtmlOverflow = html.style.overflow || null;
        this._prevBodyOverflow = body.style.overflow || null;
        html.style.overflow = 'hidden';
        body.style.overflow = 'hidden';
      }
    } catch (e) {}

    // try to adjust calendar height a few times to handle FullCalendar async rendering
    try {
      setTimeout(() => { try { this.adjustCalendarHeight(); } catch {} }, 60);
      setTimeout(() => { try { this.adjustCalendarHeight(); } catch {} }, 220);
      setTimeout(() => { try { this.adjustCalendarHeight(); } catch {} }, 520);
    } catch {}

    // Watch top menu, toolbar and bottom nav for size changes to recompute height
    try {
      if (typeof window !== 'undefined' && 'ResizeObserver' in window) {
        const ro = new ResizeObserver(() => { try { this.adjustCalendarHeight(); } catch {} });
        const menu = document.querySelector('.menu-navbar');
        const bottom = document.querySelector('.mobile-bottom-nav');
        const toolbar = document.querySelector('.calendar-toolbar');
        if (menu) ro.observe(menu);
        if (bottom) ro.observe(bottom);
        if (toolbar) ro.observe(toolbar);
        this._resizeObservers.push(ro);
      }
      // Watch for late insertion/removal of the mobile bottom nav or toolbar
      if (typeof MutationObserver !== 'undefined') {
        this._mutationObserver = new MutationObserver((records) => {
          // On first appearance of bottom nav or toolbar, recalc
          const hasBottom = !!document.querySelector('.mobile-bottom-nav');
          const hasToolbar = !!document.querySelector('.calendar-toolbar');
          if (hasBottom || hasToolbar) {
            setTimeout(() => { try { this.adjustCalendarHeight(); } catch {} }, 20);
          }
        });
        try {
          this._mutationObserver.observe(document.body, { childList: true, subtree: true });
        } catch {}
      }
      // On mobile Safari/Chrome UI show/hide, visualViewport height changes
      try {
        const vv = (window as any).visualViewport;
        if (vv && typeof vv.addEventListener === 'function') {
          const onVvResize = () => { try { this.adjustCalendarHeight(); } catch {} };
          vv.addEventListener('resize', onVvResize);
          vv.addEventListener('scroll', onVvResize);
          this._vvHandlers.push({ type: 'resize', handler: onVvResize });
          this._vvHandlers.push({ type: 'scroll', handler: onVvResize });
        }
      } catch {}
      // Also listen to transition end for overlays that may slide in/out
      const watchTransition = (selector: string) => {
        const el = document.querySelector(selector);
        if (!el) return;
        const handler = () => { try { this.adjustCalendarHeight(); } catch {} };
        el.addEventListener('transitionend', handler);
        this._boundTransitionHandlers.push({ el, handler });
      };
  watchTransition('.mobile-filters-panel');
  watchTransition('.modal-backdrop');
      watchTransition('.offcanvas');
    } catch {}
  }

  // Attach global handlers on document as a fallback. They only trigger when
  // the initial touch occurs inside our calendar content element.
  private attachGlobalTouchHandlers() {
    try {
      if (!this.isMobile) return;
      const doc = document as any;
      let startX: number | null = null;
      let startY: number | null = null;
      let tracking = false;

      const onStart = (ev: TouchEvent) => {
        try {
          if (!ev.touches || ev.touches.length !== 1) return;
          const t = ev.touches[0];
          const targetEl = (ev.target as HTMLElement) || null;
          if (!targetEl) return;
          // determine if the touch started inside the calendar area. We support
          // several selectors because FullCalendar can render slightly different
          // wrappers depending on version or runtime.
          const selectors = ['.calendar-content', '.p-wrapper .fc', '.fc', 'full-calendar'];
          const isInside = selectors.some(sel => {
            try {
              const node = targetEl.closest(sel);
              return !!node;
            } catch { return false; }
          });
          if (isInside) {
            startX = t.clientX; startY = t.clientY; tracking = true;
          }
        } catch {}
      };

      const onMove = (ev: TouchEvent) => {
        try {
          if (!tracking || startX == null || startY == null) return;
          const tx = ev.touches[0].clientX;
          const ty = ev.touches[0].clientY;
          const dx = tx - startX;
          const dy = ty - startY;
          if (Math.abs(dy) > 12 && Math.abs(dy) > Math.abs(dx)) { tracking = false; return; }
          if (Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy)) { try { ev.preventDefault(); } catch {} }
        } catch {}
      };

      const onEnd = (ev: TouchEvent) => {
        try {
          if (!tracking || startX == null || startY == null) { startX = null; startY = null; tracking = false; return; }
          const endX = ev.changedTouches[0].clientX;
          const endY = ev.changedTouches[0].clientY;
          const dx = endX - startX;
          const dy = endY - startY;
          const absDx = Math.abs(dx);
          const absDy = Math.abs(dy);
          if (absDx > 40 && absDx > absDy) { if (dx < 0) this.onNext(); else this.onPrev(); }
        } catch {}
        startX = null; startY = null; tracking = false;
      };

      const onCancel = () => { startX = null; startY = null; tracking = false; };

      doc.addEventListener('touchstart', onStart, { passive: true });
      doc.addEventListener('touchmove', onMove, { passive: false });
      doc.addEventListener('touchend', onEnd, { passive: true });
      doc.addEventListener('touchcancel', onCancel, { passive: true });

      this._touchBindings.push({ el: doc, name: 'touchstart', handler: onStart });
      this._touchBindings.push({ el: doc, name: 'touchmove', handler: onMove });
      this._touchBindings.push({ el: doc, name: 'touchend', handler: onEnd });
      this._touchBindings.push({ el: doc, name: 'touchcancel', handler: onCancel });
    } catch (e) {}
  }

  // clear touch bindings helper
  private clearTouchBindings() {
    try {
      for (const t of this._touchBindings) {
        try { t.el.removeEventListener(t.name, t.handler as any); } catch {}
      }
    } catch {}
    this._touchBindings = [];
  }

  // attach touch handlers to a target element (scroller or fallback)
  private attachTouchHandlersTo(target: HTMLElement) {
    try {
      if (!target || !this.isMobile) return;
      // remove any previously attached handlers
      this.clearTouchBindings();

      let startX: number | null = null;
      let startY: number | null = null;
      let tracking = false;

      const onTouchStart = (ev: TouchEvent) => {
        if (ev.touches && ev.touches.length === 1) {
          startX = ev.touches[0].clientX;
          startY = ev.touches[0].clientY;
          tracking = true;
        }
      };

      const onTouchMove = (ev: TouchEvent) => {
        if (!tracking || startX == null || startY == null) return;
        const tx = ev.touches[0].clientX;
        const ty = ev.touches[0].clientY;
        const dx = tx - startX;
        const dy = ty - startY;
        if (Math.abs(dy) > 12 && Math.abs(dy) > Math.abs(dx)) {
          tracking = false; return;
        }
        if (Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy)) {
          try { ev.preventDefault(); } catch {}
        }
      };

      const onTouchEnd = (ev: TouchEvent) => {
        if (!tracking || startX == null || startY == null) { startX = null; startY = null; tracking = false; return; }
        const endX = ev.changedTouches[0].clientX;
        const endY = ev.changedTouches[0].clientY;
        const dx = endX - startX;
        const dy = endY - startY;
        const absDx = Math.abs(dx);
        const absDy = Math.abs(dy);
        if (absDx > 40 && absDx > absDy) {
          if (dx < 0) this.onNext(); else this.onPrev();
        }
        startX = null; startY = null; tracking = false;
      };

      const onTouchCancel = () => { startX = null; startY = null; tracking = false; };

      // attach with appropriate passive settings
      target.addEventListener('touchstart', onTouchStart, { passive: true });
      target.addEventListener('touchmove', onTouchMove, { passive: false });
      target.addEventListener('touchend', onTouchEnd, { passive: true });
      target.addEventListener('touchcancel', onTouchCancel, { passive: true });

      this._touchBindings.push({ el: target, name: 'touchstart', handler: onTouchStart });
      this._touchBindings.push({ el: target, name: 'touchmove', handler: onTouchMove });
      this._touchBindings.push({ el: target, name: 'touchend', handler: onTouchEnd });
      this._touchBindings.push({ el: target, name: 'touchcancel', handler: onTouchCancel });
    } catch (e) {}
  }

  // Attach pointer event handlers (more reliable across devices) to a target element
  private attachPointerHandlersTo(target: HTMLElement) {
    try {
      if (!target || !this.isMobile) return;
      // don't clear existing handlers here — touch handlers may already exist
      let startX: number | null = null;
      let startY: number | null = null;
      let tracking = false;
      let activePointerId: number | null = null;

      const onDown = (ev: PointerEvent) => {
        if (!ev.isPrimary) return;
        startX = ev.clientX; startY = ev.clientY; tracking = true; activePointerId = ev.pointerId;
      };

      const onMove = (ev: PointerEvent) => {
        if (!tracking || activePointerId !== ev.pointerId || startX == null || startY == null) return;
        const dx = ev.clientX - startX;
        const dy = ev.clientY - startY;
        if (Math.abs(dy) > 12 && Math.abs(dy) > Math.abs(dx)) { tracking = false; return; }
        if (Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy)) {
          try { ev.preventDefault(); } catch {}
        }
      };

      const onUp = (ev: PointerEvent) => {
        if (!tracking || activePointerId !== ev.pointerId || startX == null || startY == null) { startX = null; startY = null; tracking = false; activePointerId = null; return; }
        const dx = ev.clientX - startX;
        const dy = ev.clientY - startY;
        const absDx = Math.abs(dx);
        const absDy = Math.abs(dy);
        if (absDx > 40 && absDx > absDy) { if (dx < 0) this.onNext(); else this.onPrev(); }
        startX = null; startY = null; tracking = false; activePointerId = null;
      };

      const onCancel = () => { startX = null; startY = null; tracking = false; activePointerId = null; };

      target.addEventListener('pointerdown', onDown as any, { passive: false });
      target.addEventListener('pointermove', onMove as any, { passive: false });
      target.addEventListener('pointerup', onUp as any, { passive: false });
      target.addEventListener('pointercancel', onCancel as any, { passive: false });

      this._touchBindings.push({ el: target, name: 'pointerdown', handler: onDown });
      this._touchBindings.push({ el: target, name: 'pointermove', handler: onMove });
      this._touchBindings.push({ el: target, name: 'pointerup', handler: onUp });
      this._touchBindings.push({ el: target, name: 'pointercancel', handler: onCancel });
    } catch (e) {}
  }

  // find the internal scroll element used by FullCalendar and attach handlers to it
  private findAndAttachScrollEl() {
    try {
      const root = this.calendarContentRef?.nativeElement as HTMLElement | null;
      if (!root || !this.isMobile) return;
      // look for common scroller selectors used by FullCalendar
      const selectors = ['.fc-scroller', '.fc-timegrid-body', '.fc-scrollgrid-section-liquid'];
      let found: HTMLElement | null = null;
      for (const s of selectors) {
        const q = root.querySelector(s) as HTMLElement | null;
        if (q) { found = q; break; }
      }
      // fallback: try the calendar element itself
      if (!found) {
        const fcEl = root.querySelector('full-calendar, .fc') as HTMLElement | null;
        found = fcEl || root;
      }
      if (found) {
        this.attachTouchHandlersTo(found);
        this.attachPointerHandlersTo(found);
      }
    } catch (e) {}
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

  // Format a date as 'day month' with the month capitalized. monthStyle: 'short'|'long'
  private formatDayAndMonth(date: Date, monthStyle: 'short' | 'long'): string {
    try {
      const parts = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: monthStyle }).formatToParts(date);
      // Capitalize the month part only
      const out = parts.map(p => {
        if (p.type === 'month') {
          const v = p.value || '';
          return v.charAt(0).toUpperCase() + v.slice(1);
        }
        return p.value || '';
      }).join('');
      return out;
    } catch (e) {
      try { return date.toLocaleDateString('es-ES'); } catch { return String(date); }
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
    // On mobile, prefer day view by default if nothing saved
    try {
      if (typeof window !== 'undefined' && window.innerWidth < 992) {
        const saved = localStorage.getItem('calendar:view');
        if (!saved) {
          this.currentView = 'day';
          try { this.setCalendarView('day'); } catch {}
        }
      }
    } catch (e) {}
    // keyboard handlers
    if (typeof window !== 'undefined' && !this.keyboardHandlerBound) {
      window.addEventListener('keydown', this.globalKeyHandler as any);
      this.keyboardHandlerBound = true;
    }
    this.getCurrentUser();
    // Attach user renderer if not present (admin calendar overrides separately)
    try {
      if (!this.calendarOptions.eventContent) {
        this.calendarOptions = { ...this.calendarOptions, eventContent: this.userRenderEventContent.bind(this) };
      }
    } catch (e) {}
  }

  ngOnDestroy() {
    // remove the calendar-active marker from main container
    try {
      const main = document.getElementById('mainContent');
      if (main) main.classList.remove('calendar-active');
    } catch (e) {}

    // unsubscribe all subscriptions
    try { this.subscriptions.forEach(sub => sub.unsubscribe()); } catch (e) {}

    // Remove global handlers
    try {
      if (typeof window !== 'undefined') {
        try { window.removeEventListener('resize', this.onResizeBound as any); } catch (e) {}
        try { window.removeEventListener('keydown', this.globalKeyHandler as any); } catch (e) {}
        try { window.removeEventListener('keydown', this._escapeListener as any); } catch (e) {}
      }
    } catch (e) {}

    // Disconnect ResizeObservers and MutationObserver
    try {
      for (const ro of this._resizeObservers) {
        try { ro.disconnect(); } catch (e) {}
      }
      this._resizeObservers = [];
    } catch (e) {}
    try {
      if (this._mutationObserver) { try { this._mutationObserver.disconnect(); } catch (e) {} this._mutationObserver = null; }
    } catch (e) {}

    // Remove any visualViewport handlers
    try {
      const vv = (window as any).visualViewport;
      if (vv && this._vvHandlers && this._vvHandlers.length) {
        for (const h of this._vvHandlers) {
          try { vv.removeEventListener(h.type, h.handler); } catch (e) {}
        }
        this._vvHandlers = [];
      }
    } catch (e) {}

    // Remove any touch/pointer listeners we registered
    try {
      for (const t of this._touchBindings) {
        try { t.el.removeEventListener(t.name, t.handler as any); } catch (e) {}
      }
      this._touchBindings = [];
    } catch (e) {}

    // Remove bound transitionend handlers
    try {
      for (const b of this._boundTransitionHandlers) {
        try { b.el.removeEventListener('transitionend', b.handler as any); } catch (e) {}
      }
      this._boundTransitionHandlers = [];
    } catch (e) {}

    // Restore document overflow and clear inline sizing
    try {
      if (typeof document !== 'undefined') {
        const html = document.documentElement as HTMLElement;
        const body = document.body as HTMLElement;
        if (this._prevHtmlOverflow !== null) html.style.overflow = this._prevHtmlOverflow; else html.style.removeProperty('overflow');
        if (this._prevBodyOverflow !== null) body.style.overflow = this._prevBodyOverflow; else body.style.removeProperty('overflow');
        try {
          const container = this.calendarContentRef?.nativeElement as HTMLElement | null;
          if (container) {
            container.style.removeProperty('height');
            container.style.removeProperty('padding-bottom');
          }
        } catch (e) {}
      }
    } catch (e) {}
  }

  // resize handler (bound) to update isMobile dynamically
  private onResizeBound = () => {
    try {
      const wasMobile = this.isMobile;
      this.isMobile = (typeof window !== 'undefined') && window.innerWidth < 992;
      // if we transitioned to desktop, close mobile panel
      if (wasMobile && !this.isMobile) this.setMobileFiltersOpen(false);
  // adjust calendar internal height on resize
  try { this.adjustCalendarHeight(); } catch {}
  } catch (e) {}
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
      // animate as a backward navigation
      const container = this.calendarContentRef?.nativeElement as HTMLElement | null;
      if (container) container.classList.add('transition-active');
      // use calendar API where available but orchestrate via triggerViewTransition for smoothness
      if (this.calendarApi && typeof this.calendarApi.prev === 'function') {
        // determine target view: prev keeps same view, so just call prev and let onDatesSet handle the in animation
        this.calendarApi.prev();
        setTimeout(() => { try { if (container) container.classList.remove('transition-active'); } catch {} }, 420);
        return;
      }
      const fallback = (this.calendarOptions as any).calendarApi;
      if (fallback && typeof fallback.prev === 'function') {
        fallback.prev();
        setTimeout(() => { try { if (container) container.classList.remove('transition-active'); } catch {} }, 420);
        return;
      }
    } catch {}
  }

  onNext() {
    try {
      const container = this.calendarContentRef?.nativeElement as HTMLElement | null;
      if (container) container.classList.add('transition-active');
      if (this.calendarApi && typeof this.calendarApi.next === 'function') {
        this.calendarApi.next();
        setTimeout(() => { try { if (container) container.classList.remove('transition-active'); } catch {} }, 420);
        return;
      }
      const fallback = (this.calendarOptions as any).calendarApi;
      if (fallback && typeof fallback.next === 'function') {
        fallback.next();
        setTimeout(() => { try { if (container) container.classList.remove('transition-active'); } catch {} }, 420);
        return;
      }
    } catch {}
  }

  goToday() {
    try {
      const container = this.calendarContentRef?.nativeElement as HTMLElement | null;
      if (container) container.classList.add('transition-active');
      if (this.calendarApi && typeof this.calendarApi.today === 'function') {
        this.calendarApi.today();
        setTimeout(() => { try { if (container) container.classList.remove('transition-active'); } catch {} }, 420);
        return;
      }
      const fallback = (this.calendarOptions as any).calendarApi;
      if (fallback && typeof fallback.today === 'function') {
        fallback.today();
        setTimeout(() => { try { if (container) container.classList.remove('transition-active'); } catch {} }, 420);
        return;
      }
    } catch {}
  }

  setView(view: string) {
    // accept any string from template; validate and apply
    if (view !== 'day' && view !== 'week' && view !== 'month') return;
    // if same view, no-op
    if (view === this.currentView) return;
    const prev = this.currentView;
    this.currentView = view as any;
    try { this.triggerViewTransition(prev, view); } catch (e) { try { this.setCalendarView(view); } catch {} }
    try { localStorage.setItem('calendar:view', view); } catch {}
    this.closeFilters();
  }

  // orchestrates a small out/in animation when changing FullCalendar views
  private triggerViewTransition(fromView: string, toView: string) {
    const container = this.calendarContentRef?.nativeElement as HTMLElement | null;
    // mapping to determine direction
    const idx = (v: string) => (v === 'day' ? 0 : v === 'week' ? 1 : 2);
    const direction = Math.sign(idx(toView) - idx(fromView));
    if (!container || !this.calendarApi) {
      // fallback: direct change
      this.setCalendarView(toView);
      return;
    }

    // clear any existing classes
    container.classList.remove('view-in', 'view-out-left', 'view-out-right');
    // apply out animation
    const outClass = direction >= 0 ? 'view-out-left' : 'view-out-right';
    container.classList.add(outClass);

    // after out animation, change view and animate in
    const outDuration = 200; // ms, should match CSS
    setTimeout(() => {
      try {
        this.setCalendarView(toView);
      } catch {}
      // small tick to allow FC to render then animate in via onDatesSet
    }, outDuration);
  }

  toggleFiltersPanel() {
    this.setMobileFiltersOpen(!this.mobileFiltersOpen);
  }

  // Handler called from toolbar; toggles mobile overlay on mobile, collapses desktop filters on desktop
  onToolbarToggleFilters() {
    try {
      if (this.isMobile) {
        this.toggleFiltersPanel();
        return;
      }
      // On desktop open the offcanvas drawer from the left
      this.desktopFiltersOpen = !this.desktopFiltersOpen;
      if (this.desktopFiltersOpen) {
        setTimeout(() => {
          try {
            const btn = document.querySelector('.offcanvas .btn-close') as HTMLElement | null;
            if (btn) btn.focus();
          } catch {}
        }, 60);
      }
      // apply a small shrink class briefly to help visual fit testing
      try {
        const el = this.calendarContentRef?.nativeElement as HTMLElement | null;
        if (el) {
          el.classList.add('calendar-shrink');
          setTimeout(() => { try { el.classList.remove('calendar-shrink'); } catch {} }, 500);
        }
      } catch {}
      // pulse the calendar mask briefly to give visual feedback
      try {
        const container = this.calendarContentRef?.nativeElement as HTMLElement | null;
        if (container) {
          container.classList.add('transition-active');
          setTimeout(() => { try { container.classList.remove('transition-active'); } catch {} }, 240);
        }
      } catch (e) {}
      // after layout change, recalculate calendar height multiple times to avoid race
      try {
        const run = () => { try { this.adjustCalendarHeight(); } catch {} };
        setTimeout(run, 120);
        setTimeout(run, 320);
        setTimeout(run, 720);
      } catch {}
    } catch (e) {}
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

  // Close any filters overlay (desktop or mobile)
  closeFilters() {
    try {
      this.desktopFiltersOpen = false;
      this.setMobileFiltersOpen(false);
      this.adjustCalendarHeight();
    } catch {}
  }

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
  // While fetching, mark types as not yet loaded so UI can show a spinner
  this.typesLoaded = false;
    if (!this.userNumericId) return;
    if (this.isAdmin) {
      // Admin: keep wide fetch once
      const startDate = this.rangeStartDate || new Date().toISOString().split('T')[0];
      const endDate = this.rangeEndDate || new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const sub = this.classSessionsService.getSessionsForCalendar(this.userNumericId, startDate, endDate).subscribe({
        next: (sessions) => {
          this.events = this.transformSessionsToEvents(sessions);
          this.extractClassTypes(sessions);
            this.eventsLoaded = true;
            this.updateCalendarEvents();
        },
        error: (error) => {
          console.warn('Fallo get_sessions_for_calendar, fallback a contadores:', error);
          const sub2 = this.classSessionsService.getSessionsWithBookingCounts(startDate, endDate).subscribe({
            next: (sessions) => {
              this.events = this.transformSessionsToEvents(sessions);
              this.extractClassTypes(sessions);
              this.eventsLoaded = true;
              this.updateCalendarEvents();
            },
            error: (err2) => {
              console.error('Error loading events (fallback):', err2);
              // avoid leaving the UI blocked forever if fallback fails
              try { this.typesLoaded = true; } catch {}
            }
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
      // Use an "effective now" that advances to next Monday when it's weekend
      // or after the studio's last working hour on Friday (19:00).
      const now = this.getEffectiveNowForWeek();
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
  // Use effective now so users visiting on weekend (or after Friday 19:00)
  // see the upcoming week instead of the past/ending week.
  const now = this.getEffectiveNowForWeek();
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
  // Keep our toolbar view state in sync with FullCalendar's actual view type.
  // This fixes an issue on mobile where the component thought the view was 'week'
  // but FullCalendar started in 'timeGridDay', making the "Semana" button appear
  // to do nothing until the user toggled the day view first.
  try {
    const fcType = arg?.view?.type;
    if (fcType) {
      const mapped = fcType === 'timeGridDay' ? 'day' : (fcType === 'timeGridWeek' ? 'week' : (fcType === 'dayGridMonth' ? 'month' : this.currentView));
      if (mapped && mapped !== this.currentView) {
        this.currentView = mapped as any;
        // ensure stored preference isn't overwritten incorrectly
        try { localStorage.setItem('calendar:view', this.currentView); } catch {}
      }
    }
  } catch (e) {}
  // Usar fechas locales para evitar saltos por zona horaria
  const startStr = this.formatDate(new Date(arg.start));
    // arg.endStr is exclusive in FullCalendar; subtract one day for inclusive logic
    let endDate = new Date(arg.end);
    endDate.setDate(endDate.getDate() - 1);
  const endStr = this.formatDate(endDate);
    this.lastVisibleStart = startStr;
    this.lastVisibleEnd = endStr;
    this.fetchAndRenderRange(startStr, endStr);
  // do not force update here; fetchAndRenderRange will update when data arrives
    // update toolbar label
    try {
      const s = new Date(arg.start);
      const e = new Date(arg.end);
  // Choose month format: if we're in single-day view show full month; otherwise mobile uses short, desktop uses full
  const monthStyle: 'short' | 'long' = (this.currentView === 'day') ? 'long' : (this.isMobile ? 'short' : 'long');
      let label: string;
      if (this.currentView === 'day') {
        label = this.formatDayAndMonth(s, monthStyle);
      } else {
        const left = this.formatDayAndMonth(s, monthStyle);
        const right = this.formatDayAndMonth(new Date(e.getTime() - 1), monthStyle);
        label = `${left} - ${right}`;
      }
      // assign in next tick to avoid ExpressionChangedAfterItHasBeenCheckedError
      setTimeout(() => { try { this.currentRangeLabel = label; } catch {} }, 0);
    } catch {}
    // if our triggerViewTransition added an out-class to animate, switch to 'in' so the incoming view fades/slides in
    try {
      const container = this.calendarContentRef?.nativeElement as HTMLElement | null;
      if (container) {
        // remove out classes and add 'view-in' to animate the incoming view
        container.classList.remove('view-out-left', 'view-out-right');
        // force a reflow then add view-in to trigger transition
        // eslint-disable-next-line @typescript-eslint/no-unused-expressions
        container.offsetHeight; // trigger reflow
        container.classList.add('view-in');
        // remove view-in after animation completes
        setTimeout(() => {
          try { container.classList.remove('view-in'); } catch {}
        }, 300);
      }
    } catch (e) {}
    // Ensure the internal FullCalendar scroller height matches available space
    try { setTimeout(() => { this.adjustCalendarHeight(); }, 50); } catch {}
  }

  /**
   * Return an effective "now" used to compute the visible week for users.
   * Rules:
   * - If today is Saturday or Sunday, return next Monday (so the UI shows next week).
   * - If today is Friday and local time is >= 19:00, treat it as next Monday.
   * - Otherwise return actual now.
   */
  private getEffectiveNowForWeek(): Date {
    try {
      const now = new Date();
      const localDay = now.getDay(); // 0 Sun .. 6 Sat
      const localHour = now.getHours();
      // If weekend -> jump to next Monday
      if (localDay === 6 || localDay === 0) {
        // compute next Monday
        const daysToMonday = (8 - localDay) % 7 || 1;
        const nextMon = new Date(now);
        nextMon.setDate(now.getDate() + daysToMonday);
        nextMon.setHours(9, 0, 0, 0); // morning of that Monday
        return nextMon;
      }
      // If Friday after or equal to 19:00 -> jump to next Monday
      if (localDay === 5 && localHour >= 19) {
        const daysToMonday = 3; // Fri -> Mon
        const nextMon = new Date(now);
        nextMon.setDate(now.getDate() + daysToMonday);
        nextMon.setHours(9, 0, 0, 0);
        return nextMon;
      }
      return now;
    } catch (e) {
      return new Date();
    }
  }

  // Return '#000' or '#fff' depending on which has better contrast on the provided color (hex or rgb)
  getContrastColor(color: string): string {
    try {
      if (!color) return '#000';
      let r = 255, g = 255, b = 255;
      color = color.trim();
      if (color.startsWith('#')) {
        const hex = color.substring(1);
        if (hex.length === 3) {
          r = parseInt(hex[0] + hex[0], 16);
          g = parseInt(hex[1] + hex[1], 16);
          b = parseInt(hex[2] + hex[2], 16);
        } else if (hex.length === 6) {
          r = parseInt(hex.substring(0, 2), 16);
          g = parseInt(hex.substring(2, 4), 16);
          b = parseInt(hex.substring(4, 6), 16);
        }
      } else if (color.startsWith('rgb')) {
        const nums = color.replace(/[rgba\(\)\s]/g, '').split(',').map(s => parseFloat(s));
        [r, g, b] = nums;
      }
      // relative luminance
      const srgb = [r, g, b].map(v => {
        v = v / 255;
        return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
      });
      const lum = 0.2126 * srgb[0] + 0.7152 * srgb[1] + 0.0722 * srgb[2];
      return lum > 0.5 ? '#000' : '#fff';
    } catch (e) {
      return '#000';
    }
  }

  // Adjust FullCalendar's contentHeight to match the available height inside our layout.
  // Tweak: reserve minimal bottom space so the calendar can grow vertically and avoid large gaps.
  private adjustCalendarHeight() {
    try {
      // resolve calendar API if not already
      if (!this.calendarApi && this.fullCalRef && this.fullCalRef.nativeElement && typeof this.fullCalRef.nativeElement.getApi === 'function') {
        try { this.calendarApi = this.fullCalRef.nativeElement.getApi(); } catch {}
      }
      const container = this.calendarContentRef?.nativeElement as HTMLElement | null;
      if (!container) return;

      // Determine viewport height (prefer visualViewport when available on mobile)
      let viewportH = 0;
      try {
        const vv = (window as any).visualViewport;
        viewportH = (vv && typeof vv.height === 'number') ? Math.floor(vv.height) : 0;
      } catch {}
      if (!viewportH) viewportH = (typeof window !== 'undefined' && window.innerHeight) ? window.innerHeight : (document.documentElement.clientHeight || 0);

      const crect = container.getBoundingClientRect();
      // Base available is viewport height minus distance from top of viewport to calendar top
      let available = Math.floor(Math.max(0, viewportH - (crect.top || 0)));

      // We will compute overlaps but keep the final bottom reserve small so calendar can expand.
      let padBottom = 0;
      try {
        const elems = Array.from(document.querySelectorAll('body *')) as HTMLElement[];
        let totalOverlap = 0;
        const containerBottom = crect.top + available;
        for (const el of elems) {
          try {
            if (!el || el === container || container.contains(el)) continue;
            if (!(el.offsetWidth || el.offsetHeight)) continue;
            const style = (typeof window !== 'undefined') ? window.getComputedStyle(el) : null;
            if (!style) continue;
            const pos = style.position;
            if (pos !== 'fixed' && pos !== 'sticky' && pos !== 'absolute') continue;
            if (el.classList && el.classList.contains('mobile-bottom-nav')) continue;
            const er = el.getBoundingClientRect();
            const overlap = Math.max(0, Math.min(er.bottom, containerBottom) - Math.max(er.top, crect.top));
            if (overlap > 0) totalOverlap += overlap;
          } catch {}
        }
        if (totalOverlap > 0) {
          // Subtract overlaps but do not allow huge pad values. We convert overlap into a small breathing pad.
          available = Math.max(120, Math.floor(available - totalOverlap));
          padBottom = Math.min(Math.ceil(totalOverlap * 0.25) + 8, 40); // keep pad modest (max 40px)
        }
      } catch {}

      // If a mobile bottom nav exists, reserve a small fixed amount (don't over-reserve)
      try {
        const bottomNav = document.querySelector('.mobile-bottom-nav') as HTMLElement | null;
        if (bottomNav) {
          const navRect = bottomNav.getBoundingClientRect();
          const navH = Math.ceil(navRect && navRect.height ? navRect.height : (bottomNav as any).offsetHeight || 0);
          if (navH > 0) {
            // Reserve only a small portion of nav height; prefer letting calendar extend behind it slightly
            const reserve = Math.min(navH, 20);
            available = Math.max(120, available - reserve);
            padBottom = Math.max(padBottom, 8);
          } else {
            padBottom = Math.max(padBottom, 8);
          }
        }
      } catch {}

  // Apply only a small bottom padding so the last slot is readable.
  try { container.style.paddingBottom = (padBottom && padBottom > 0 ? padBottom : 8) + 'px'; } catch {}
  // Do not force container height or FullCalendar contentHeight: allow CSS to size the outer container
  // and let FullCalendar compute its internal sizes automatically.
    } catch (e) {
      // swallow errors
    }
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
        try {
          // DEBUG: confirm RPC payload on user calendar path includes level metadata
          console.debug('[calendar:user] getSessionsForCalendar returned', sessions && sessions.length ? sessions.slice(0, 20) : sessions);
        } catch (e) {}
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

  // Returns a CSS-safe value for the modal accent. Prefer the selected session's class color.
  getModalAccent(): string {
    try {
      const s = this.selectedSession as any;
      // class color may be available on the session via extended properties or via service
      // First try common paths
      if (s && s.class_type_id) {
        // try to find a matching availableClassTypes entry
  const found = this.availableClassTypes.find(t => t.name === s.class_type_name);
        if (found && found.color && found.color.background) return found.color.background;
      }
      // fallback: if event extendedProps were stored in last clicked event, try that
      if (s && (s.color || s.backgroundColor)) return s.color || s.backgroundColor;
    } catch {}
    // final fallback: return the fallback gradient as a CSS value (must be a string)
    return 'linear-gradient(90deg, #3b82f6, #10b981, #f59e0b, #ef4444)';
  }

  // Given current modal accent, choose readable text color (black/white)
  getBadgeTextColor(): string {
    try {
      const accent = this.getModalAccent();
      // if it's a gradient fallback, return white
      if (accent.includes('gradient') || accent.includes(',')) return '#ffffff';
      // simple hex parse
      const hex = accent.replace('#','').trim();
      if (hex.length === 3) {
        const r = parseInt(hex[0]+hex[0], 16);
        const g = parseInt(hex[1]+hex[1], 16);
        const b = parseInt(hex[2]+hex[2], 16);
        const yiq = (r*299 + g*587 + b*114) / 1000;
        return yiq >= 128 ? '#000000' : '#ffffff';
      }
      if (hex.length >= 6) {
        const r = parseInt(hex.substring(0,2), 16);
        const g = parseInt(hex.substring(2,4), 16);
        const b = parseInt(hex.substring(4,6), 16);
        const yiq = (r*299 + g*587 + b*114) / 1000;
        return yiq >= 128 ? '#000000' : '#ffffff';
      }
    } catch {}
    return '#ffffff';
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

      const shortName = (this.isMobile && this.currentView === 'week')
        ? this.shortenClassType(session.class_type_name || '')
        : (session.class_type_name || '');
  return {
        id: session.id.toString(),
        title: `${shortName}${selfTag} (${confirmedCount}/${session.capacity})`,
        start: `${session.schedule_date}T${session.schedule_time}`,
  backgroundColor: colors.background,
  borderColor: colors.border,
  textColor: this.getContrastColor(colors.background || colors.border || '#ffffff'),
        extendedProps: {
          session: session,
          // surface level metadata returned by RPC into extendedProps so
          // the renderer can display the level pill on the user calendar.
          level_id: (session as any).level_id ?? null,
          level_name: (session as any).level_name ?? null,
          level_color: (session as any).level_color ?? null,
          available: !isFull,
          availableSpots: availableSpots
        },
        classNames: [
  'notranslate',
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

  // Shorten a class type name for compact display on small screens.
  // Example: "Mat Personalizada" -> "Mat Per."
  private shortenClassType(name: string): string {
    try {
      if (!name) return '';
      return name
        .split(/\s+/)
        .map(w => (w.length <= 3 ? (w.charAt(0).toUpperCase() + w.slice(1)) : (w.substring(0,3).replace(/\W+$/,'') + '.')))
        .join(' ');
    } catch (e) { return name; }
  }

  private extractClassTypes(sessions: ClassSession[]) {
    const typeSet = new Set<string>();
    const typeColorsMap = new Map<string, { background: string, border: string }>();
    const typePersonal = new Map<string, boolean>();

    // Detect whether a class type should be considered 'personal' by
    // heuristics: explicit is_personal flag, presence of personal_user_id,
    // name containing 'personal'|'individual', or known personal type ids.
    const KNOWN_PERSONAL_TYPE_IDS = new Set<number>([4, 22, 23]);

    sessions.forEach(session => {
      const name = session.class_type_name;
      if (!name) return;
      const ctId = Number(session.class_type_id || -1);
      const assignedIsValid = Number.isFinite(Number(session.personal_user_id));
      const isPersonalFlag = !!(session as any).is_personal;
      const personalByName = /personal|individual/i.test(String(name));
      const isPersonal = isPersonalFlag || assignedIsValid || personalByName || KNOWN_PERSONAL_TYPE_IDS.has(ctId);

      typeSet.add(name);
      if (!typeColorsMap.has(name)) {
        typeColorsMap.set(name, this.classSessionsService.getClassTypeColors(name));
      }
      // If any session for this type is personal, mark the type as personal
      if (!typePersonal.has(name)) typePersonal.set(name, isPersonal);
      else if (isPersonal) typePersonal.set(name, true);
    });

    // Build availableClassTypes excluding personal types
    this.availableClassTypes = Array.from(typeSet)
      .filter(tn => !typePersonal.get(tn))
      .map(typeName => ({
        name: typeName,
        color: typeColorsMap.get(typeName) || { background: '#6b7280', border: '#4b5563' }
      }));

    // Inicializar con todos los tipos visibles (no incluir los personales)
    this.filteredClassTypes.set(new Set(this.availableClassTypes.map(t => t.name)));
    // Marca que ya cargamos tipos para permitir renderizar el calendario
    try { this.typesLoaded = true; } catch {}
  }

  private updateCalendarEvents() {
    const filteredTypes = this.filteredClassTypes();
    // If no filters are set (empty set) treat it as "show all" to avoid
    // briefly clearing events when types haven't been extracted yet.
    const noFilter = !(filteredTypes && filteredTypes.size > 0);
    const filteredEvents = (this.events || [])
      .filter(Boolean)
      .filter(event => {
        if (!event || !event.extendedProps) return false;
        const session = event.extendedProps.session as any;
        // If we don't have a session, keep event only if no filter
        if (!session) return noFilter;

        // Detect personal sessions (same heuristics as extractClassTypes)
        const KNOWN_PERSONAL_TYPE_IDS = new Set<number>([4, 22, 23]);
        const ctId = Number(session.class_type_id || -1);
        const assignedIsValid = Number.isFinite(Number(session.personal_user_id));
        const isPersonalFlag = !!session.is_personal;
        const personalByName = /personal|individual/i.test(String(session.class_type_name || ''));
        const sessionIsPersonal = isPersonalFlag || assignedIsValid || personalByName || KNOWN_PERSONAL_TYPE_IDS.has(ctId);

        // Always include personal sessions so users can see occupied hours.
        if (sessionIsPersonal) return true;

        if (noFilter) return true;
        return !!session.class_type_name && filteredTypes.has(session.class_type_name);
      });
    this.calendarOptions = {
      ...this.calendarOptions,
      events: filteredEvents
    };
    // If FullCalendar API is available, push events directly so the UI updates
    try {
      const api = this.calendarComponent?.getApi?.() as any || this.calendarApi as any;
      if (api) {
        // Remove all current events and add our filtered set to ensure consistency
        try { if (typeof api.removeAllEvents === 'function') api.removeAllEvents(); } catch (e) {}
        try {
          if (Array.isArray(filteredEvents) && filteredEvents.length) {
            for (const ev of filteredEvents) {
              try { api.addEvent(ev); } catch (e) { /* best-effort */ }
            }
          }
          // Last resort: ask API to refetch (if using eventSources)
          try { if (typeof api.refetchEvents === 'function') api.refetchEvents(); } catch (e) {}
        } catch (e) {}
      }
    } catch (e) {
      // non-fatal
    }
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
    
    
  // Validar estructura antes de acceder
  if (!eventInfo || !eventInfo.event || !eventInfo.event.extendedProps || !eventInfo.event.extendedProps.session) {
      console.warn('[calendar] Click en evento sin sesión asociada, ignorando');
      return;
    }
  // Siempre obtener la versión más reciente del objeto sesión del evento
  const session = eventInfo.event.extendedProps.session as ClassSession;
    const confirmedCount = this.getConfirmedCount(session);
    
    

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
  // Determine if class type is personal using loaded metadata (availableClassTypes/classTypes) or name heuristic
  let isPersonalClass = false;
  try {
  // Use session.class_type_name when explicit metadata isn't available for the calendar
  isPersonalClass = /personal|individual/i.test(String(session.class_type_name || ''));
  } catch (e) {
    isPersonalClass = /personal|individual/i.test(String(session.class_type_name || ''));
  }
  // Determine definitively whether the session should be treated as "personal".
  // Some sessions may not include a class_type_name but will have personal_user_id or is_personal flag.
  let sessionIsPersonal = isPersonalClass;
  try {
    // DEBUG: grouped info to diagnose personal session access
  // debug logging removed
  // Normalize assigned user id to a Number when present; treat missing/invalid as NaN
  const assignedRaw = (session as any).personal_user_id;
  const assignedUserNumericId = Number.isFinite(Number(assignedRaw)) ? Number(assignedRaw) : NaN;
    const isPersonalFlag = !!(session as any).is_personal;
    const ctId = Number((session as any).class_type_id || -1);
    // Known personal class_type ids (legacy + current): 4, 22, 23 (and others may exist); treat presence of personal_user_id as definitive
    const knownPersonalType = [4, 22, 23].includes(ctId);
    sessionIsPersonal = sessionIsPersonal || !!assignedUserNumericId || isPersonalFlag || knownPersonalType;

    // If session is personal, require the assigned user numeric id to match the current user.
    // If assignedUserNumericId is missing/NaN, deny access to non-admins (defensive).
    const currentUserNum = Number(this.userNumericId);
    const assignedIsValid = Number.isFinite(assignedUserNumericId);
    if (sessionIsPersonal && (!assignedIsValid || assignedUserNumericId !== currentUserNum) && !this.isAdmin) {
      // Don't open modal; show a clear error to the user
      this.selectedSession = null;
      this.showBookingModal = false;
      this.loadingModal = false;
      this.modalError = 'No estás autorizado para ver los detalles de esta sesión personalizada.';
      console.warn('[calendar] Acceso denegado a sesión personalizada para usuario', this.userNumericId, 'asignado:', assignedUserNumericId);
      return;
    }
  } catch (e) {
    // ignore and continue if something unexpected
  }
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
  let isPersonal = false;
  isPersonal = /personal|individual/i.test(String(session.class_type_name || ''));

    

  // Verificar si el usuario tiene clases disponibles del tipo y que caducan en el mismo mes de la sesión
    const sub = this.carteraService.tienePaqueteYCoincideMes(this.userNumericId, classTypeId, isPersonal, session.schedule_date)
      .subscribe({
        next: (res: { hasAny: boolean; matchesMonth: boolean } | any) => {
          const hasAny = !!res?.hasAny;
          const matchesMonth = !!res?.matchesMonth;

          this.userCanBook = matchesMonth;
          this.loadingModal = false;

          if (!matchesMonth) {
            const d = new Date(session.schedule_date);
            const month = d.toLocaleString('es-ES', { month: 'long' });
            const monthCap = month.charAt(0).toUpperCase() + month.slice(1);
            // If user has any package but not for this month, message explains month mismatch.
            // If user has no applicable package at all, we still show the same guidance.
            this.modalError = `No tienes un bono para ${monthCap} para clases de tipo "${session.class_type_name}".`;
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
  public getConfirmedCount(session: ClassSession): number {
    if (typeof session.confirmed_bookings_count === 'number') return session.confirmed_bookings_count;
    // As a weak fallback, infer from available_spots only if present and numeric.
    if (typeof session.available_spots === 'number' && typeof session.capacity === 'number') {
      return Math.max(0, session.capacity - session.available_spots);
    }
    // Last resort: derive from bookings array (may be RLS-limited in some envs)
    const confirmed = session.bookings?.filter(b => (b.status || '').toUpperCase() === 'CONFIRMED').length || 0;
    return confirmed;
  }

  // Helper expuesto para la plantilla: calcula plazas disponibles de forma segura
  public availableSpotsForTemplate(session: ClassSession): number | null {
    if (!session) return null;
    if (typeof session.available_spots === 'number') return session.available_spots;
    if (typeof session.capacity === 'number') return Math.max(0, (session.capacity || 0) - this.getConfirmedCount(session));
    return null;
  }

  // Template helpers to safely read optional or differently-named fields
  public sessionDuration(session: any): string | number {
    try {
      if (!session) return '—';
      return session.duration_minutes ?? session.class_type_duration ?? '—';
    } catch { return '—'; }
  }

  public sessionDescription(session: any): string | null {
    try { return session?.description ?? null; } catch { return null; }
  }

  public sessionCapacity(session: any): number | string {
    try { return session?.capacity ?? '—'; } catch { return '—'; }
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

    

    const sub = this.classSessionsService.createBooking(bookingRequest)
      .subscribe({
        next: (result) => {
          
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
            // If this was a personal session, the session row is deleted on the server.
            // Close the modal and show a toast notifying the user of the successful cancellation.
            const isPersonal = !!(this.selectedSession && ((this.selectedSession as any).personal_user_id || /personal|individual/i.test(String(this.selectedSession.class_type_name || ''))));
            if (isPersonal) {
                // Capture id before clearing selectedSession in closeBookingModal
                const sessionId = this.selectedSession?.id;
                // Close modal first to avoid UI race
                this.closeBookingModal();

                // Attempt to delete the entire personal session on the server so it disappears
                // (admin flow uses safeDeleteSession RPC to remove bookings then the session).
                try {
                  const subDel = this.classSessionsService.safeDeleteSession(sessionId!)
                    .subscribe({
                      next: (delRes: any) => {
                        // If RPC returned truthy, remove event from calendar and show success
                        if (delRes) {
                          try {
                            const compApi = this.calendarComponent?.getApi?.() as any;
                            const api = compApi || this.calendarApi || (this.calendarOptions as any).calendarApi;
                            const fcEvent = api?.getEventById?.(String(sessionId));
                            if (fcEvent && typeof fcEvent.remove === 'function') fcEvent.remove();
                            if (typeof api?.refetchEvents === 'function') api.refetchEvents();
                          } catch (e) {}
                          // Also remove locally from events so the Angular bindings update
                          try {
                            this.events = (this.events || []).filter(e => e && e.id !== String(sessionId));
                            // trigger calendar update
                            this.updateCalendarEvents();
                          } catch (e) {}
                          this.showToastNotification('Has cancelado la clase personalizada correctamente', 'success');
                        } else {
                          // RPC returned falsy: show error and reload events to reflect server state
                          this.showToastNotification('No se pudo eliminar la sesión personalizada en servidor. Se recargará el calendario.', 'error');
                          setTimeout(() => { try { this.loadEvents(); } catch {} }, 250);
                        }
                      },
                      error: (rpcErr) => {
                        this.showToastNotification('Error eliminando la sesión en servidor. Intenta recargar.', 'error');
                        setTimeout(() => { try { this.loadEvents(); } catch {} }, 250);
                      },
                      complete: () => { try { subDel.unsubscribe(); } catch {} }
                    });
                  this.subscriptions.push(subDel);
                } catch (e) {
                  // If RPC call failed synchronously for some reason, fallback to refresh
                  try { this.showToastNotification('Error intentando eliminar la sesión personalizada.', 'error'); } catch {}
                  setTimeout(() => { try { this.loadEvents(); } catch {} }, 250);
                }
            }
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
  return !!this.selectedSession && /personal|individual/i.test(String(this.selectedSession.class_type_name || ''));
  }

  // Método para unirse a la lista de espera
  joinWaitingList() {
    if (!this.selectedSession || !this.userNumericId) return;
    // Ensure user has a valid bono for this month
    if (!this.userCanBook) {
      this.modalError = 'No tienes un bono válido para esta sesión; no puedes unirte a la lista de espera.';
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

  // Small toast notification helpers
  showToastNotification(message: string, type: 'success' | 'error' = 'success', duration = 3000) {
    try {
      this.toastMessage = message;
      this.toastType = type;
      this.showToast = true;
  try { this.cdr.detectChanges(); } catch {}
      setTimeout(() => {
        this.hideToast();
      }, duration);
      // Also create a DOM-level toast as a robust fallback to avoid stacking/context issues
      try {
        this.showDomToast(message, type, duration);
      } catch (e) {}
    } catch (e) { }
  }

  hideToast() {
    try {
      this.showToast = false;
  try { this.cdr.detectChanges(); } catch {}
      setTimeout(() => { this.toastMessage = ''; }, 240);
    } catch (e) { }
  }

  // Fallback: create a toast element directly in document.body to avoid any component stacking context issues
  private showDomToast(message: string, type: 'success' | 'error' = 'success', duration = 3000) {
    if (typeof document === 'undefined') return;
    try {
      // Create a host element and attach a shadow root to isolate styles
      const host = document.createElement('div');
      const shadow = host.attachShadow({ mode: 'open' });

      // wrapper that will be fixed to the viewport with an ultra-high z-index
      const wrap = document.createElement('div');
      wrap.className = 'toast-wrap';
      wrap.setAttribute('role', 'status');
      wrap.setAttribute('aria-live', 'polite');

      // toast element
      const toast = document.createElement('div');
      toast.className = 'toast';

      // content
      const content = document.createElement('div');
      content.className = 'toast-content';
      content.innerHTML = `<div>${message}</div>`;

      // close button
      const closeBtn = document.createElement('button');
      closeBtn.className = 'toast-close';
      closeBtn.type = 'button';
      closeBtn.setAttribute('aria-label', 'Cerrar');
      closeBtn.textContent = '✕';
      closeBtn.addEventListener('click', () => {
        try { toast.classList.remove('show'); } catch (e) {}
        setTimeout(() => { try { host.remove(); } catch (e) {} }, 260);
      });

      toast.appendChild(content);
      toast.appendChild(closeBtn);
      wrap.appendChild(toast);

      // Inline styles inside the shadow root to avoid any page CSS interference
      const style = document.createElement('style');
      style.textContent = `
        :host { all: initial; }
        .toast-wrap {
          position: fixed !important;
          right: 16px !important;
          bottom: 16px !important;
          z-index: 2147483647 !important; /* max 32-bit signed int */
          pointer-events: auto !important;
          display: flex;
          flex-direction: column;
          gap: 8px;
          align-items: flex-end;
          isolation: isolate !important;
          font-family: system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial;
        }
        .toast {
          min-width: 240px;
          max-width: 520px;
          color: #fff;
          padding: 12px 14px;
          border-radius: 10px;
          box-shadow: 0 8px 30px rgba(0,0,0,0.35);
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          transform: translateY(10px);
          opacity: 0;
          transition: transform 220ms ease, opacity 220ms ease;
          font-size: 13px;
        }
        .toast.show { transform: translateY(0); opacity: 1; }
        .toast-close {
          background: transparent;
          border: none;
          color: inherit;
          font-size: 14px;
          cursor: pointer;
          padding: 6px;
        }
      `;

      // apply background color according to type (set via inline style to avoid cascade)
      if (type === 'success') {
        toast.style.background = '#1a7f37';
      } else {
        toast.style.background = '#b00020';
      }

      shadow.appendChild(style);
      shadow.appendChild(wrap);
      wrap.appendChild(toast);

      // Append host to body (outside any app stacking context)
      document.body.appendChild(host);

      // show animation on next frame
      requestAnimationFrame(() => { try { toast.classList.add('show'); } catch (e) {} });

      // auto-remove
      setTimeout(() => {
        try { toast.classList.remove('show'); } catch (e) {}
        setTimeout(() => { try { host.remove(); } catch (e) {} }, 260);
      }, duration);
    } catch (e) {
      // best-effort: ignore errors here since toast shouldn't block main flow
    }
  }

  // Método para reservar clase (llamado desde el template)
  reserveClass() {
    this.confirmBooking();
  }
}