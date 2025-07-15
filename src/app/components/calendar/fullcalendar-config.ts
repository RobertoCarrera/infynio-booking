// Configuración y utilidades para FullCalendar en español y con horarios laborales personalizados
import { CalendarOptions } from '@fullcalendar/core';
import esLocale from '@fullcalendar/core/locales/es';
import timeGridPlugin from '@fullcalendar/timegrid';
import dayGridPlugin from '@fullcalendar/daygrid';
import interactionPlugin from '@fullcalendar/interaction';

export const FULLCALENDAR_OPTIONS: CalendarOptions = {
  plugins: [timeGridPlugin, dayGridPlugin, interactionPlugin],
  initialView: 'timeGridWeek',
  locale: esLocale,
  headerToolbar: {
    left: 'prev,next today',
    center: 'title',
    right: 'timeGridWeek,dayGridMonth'
  },
  slotMinTime: '09:00:00',
  slotMaxTime: '20:00:00',
  hiddenDays: [0, 6], // Oculta domingos y sábados
  allDaySlot: false,
  slotDuration: '01:00:00',
  businessHours: [
    { daysOfWeek: [1,2,3,4,5], startTime: '09:00', endTime: '13:00' },
    { daysOfWeek: [1,2,3,4,5], startTime: '17:00', endTime: '20:00' }
  ],
  selectable: true,
  selectMirror: true,
  select: (info) => {
    alert(`Reservar clase para ${info.startStr}`);
  },
  eventClick: (info) => {
    alert(`Evento: ${info.event.title}`);
  },
  events: [], // Aquí puedes cargar tus reservas
  height: '100%',
  expandRows: true,
  slotLabelFormat: {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  },
  slotLabelInterval: { hours: 1 },
};
