import { CalendarOptions } from '@fullcalendar/core';
import esLocale from '@fullcalendar/core/locales/es';
import timeGridPlugin from '@fullcalendar/timegrid';
import dayGridPlugin from '@fullcalendar/daygrid';
import interactionPlugin from '@fullcalendar/interaction';

const isMobile = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(max-width: 600px)').matches;

// Previously we set a fixed numeric contentHeight to avoid layout thrashing.
// Prefer CSS-driven responsive sizing now: let FullCalendar use 'auto' so the
// calendar fills the container controlled by CSS.

export const FULLCALENDAR_OPTIONS: CalendarOptions = {
  plugins: [timeGridPlugin, dayGridPlugin, interactionPlugin],
  locale: esLocale,
  // headerToolbar removed — using custom toolbar component instead
  headerToolbar: false,
  // Ajuste: en móvil ahora iniciamos en vista semanal para mayor contexto
  initialView: 'timeGridWeek',
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
  // Let FullCalendar compute height based on its container; CSS controls
  // the outer container sizing so use 'auto' for internal content height.
  contentHeight: 'auto'
};
