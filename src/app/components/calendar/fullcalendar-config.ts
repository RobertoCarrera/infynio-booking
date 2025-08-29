import { CalendarOptions } from '@fullcalendar/core';
import esLocale from '@fullcalendar/core/locales/es';
import timeGridPlugin from '@fullcalendar/timegrid';
import dayGridPlugin from '@fullcalendar/daygrid';
import interactionPlugin from '@fullcalendar/interaction';

const isMobile = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(max-width: 600px)').matches;

// calculate a stable numeric content height (in px) to avoid continuous layout
// recalculation caused by 'auto' height combined with complex CSS and nowIndicator
const CONTENT_HEIGHT = typeof window !== 'undefined' ? Math.max(400, Math.round(window.innerHeight * 0.7)) : 700;

export const FULLCALENDAR_OPTIONS: CalendarOptions = {
  plugins: [timeGridPlugin, dayGridPlugin, interactionPlugin],
  locale: esLocale,
  // headerToolbar removed — using custom toolbar component instead
  headerToolbar: false,
  initialView: isMobile ? 'timeGridDay' : 'timeGridWeek',
  slotMinTime: '07:00:00',
  slotMaxTime: '21:00:00',
  hiddenDays: [0, 6],
  allDaySlot: false,
  slotDuration: '01:00:00',
  slotLabelFormat: { hour: '2-digit', minute: '2-digit', hour12: false },
  businessHours: [{ daysOfWeek: [1, 2, 3, 4, 5], startTime: '07:00', endTime: '21:00' }],
  navLinks: true,
  selectable: true,
  editable: false,
  events: [],
  // disable the moving "now" indicator and auto row expansion to reduce
  // continuous reflows that can overload the browser
  nowIndicator: false,
  expandRows: false,
  // provide a numeric contentHeight to avoid 'auto' sizing thrashing when the
  // page uses complex flex/vh css rules
  contentHeight: CONTENT_HEIGHT
};
