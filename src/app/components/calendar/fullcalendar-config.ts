// Configuración y utilidades para FullCalendar en español y con horarios laborales personalizados
import { CalendarOptions } from '@fullcalendar/core';
import esLocale from '@fullcalendar/core/locales/es';
import timeGridPlugin from '@fullcalendar/timegrid';
import dayGridPlugin from '@fullcalendar/daygrid';
import interactionPlugin from '@fullcalendar/interaction';

const today = new Date();
const startOfWeek = new Date(today);
startOfWeek.setDate(today.getDate() - today.getDay() + 1); // Lunes de la semana actual
startOfWeek.setHours(0,0,0,0);

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
  selectAllow: (selectInfo) => {
    const start = selectInfo.start;
    const end = selectInfo.end;
    const now = new Date();
    // No permitir seleccionar entre 13:00 y 17:00
    const startHour = start.getHours();
    const endHour = end.getHours();
    if ((startHour < 13 && endHour > 13) || (startHour >= 13 && startHour < 17)) {
      return false;
    }
    // No permitir seleccionar en días pasados
    if (start.setHours(0,0,0,0) < now.setHours(0,0,0,0)) {
      return false;
    }
    return true;
  },
  select: (info) => {
    // Solo mostrar el alert si NO estamos en la vista mensual
    if (info.view.type !== 'dayGridMonth') {
      alert(`Reservar clase para ${info.startStr}`);
    }
  },
  eventClick: (info) => {
    alert(`Evento: ${info.event.title}`);
  },
  dateClick: function(info) {
    const calendarApi = info.view.calendar;
    if (info.view.type === 'dayGridMonth') {
      calendarApi.changeView('timeGridWeek', info.date);
    }
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
  validRange: {
    start: startOfWeek,
  },
};
