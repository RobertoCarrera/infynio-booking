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

const isMobile = window.matchMedia && window.matchMedia('(max-width: 600px)').matches;

export const FULLCALENDAR_OPTIONS: CalendarOptions = {
  plugins: [timeGridPlugin, dayGridPlugin, interactionPlugin],
  locale: esLocale,
  headerToolbar: isMobile
    ? {
        left: 'prev,next today',
        center: 'title',
        right: 'timeGridDay,timeGridThreeDay,dayGridMonth'
      }
    : {
        left: 'prev,next today',
        center: 'title',
        right: 'timeGridWeek,dayGridMonth'
      },
  slotMinTime: isMobile ? '08:00:00' : '08:00:00',
  slotMaxTime: isMobile ? '20:00:00' : '20:00:00',
  hiddenDays: [0, 6], // Oculta domingos y sábados
  allDaySlot: false,
  slotDuration: '01:00:00',
  businessHours: [
    { daysOfWeek: [1,2,3,4,5], startTime: '08:00', endTime: '13:00' },
    { daysOfWeek: [1,2,3,4,5], startTime: '16:00', endTime: '20:00' }
  ],
  selectable: true,
  selectMirror: true,
  selectOverlap: false,
  selectConstraint: {
    start: '08:00',
    end: '20:00',
  },
  selectLongPressDelay: 0, // Permite seleccionar con tap corto en móvil
  selectMinDistance: 0, // Permite seleccionar con el mínimo movimiento
  selectAllow: (selectInfo) => {
    const start = selectInfo.start;
    const end = selectInfo.end;
    const now = new Date();
    // No permitir seleccionar entre 13:00 y 16:00
    const startHour = start.getHours();
    const endHour = end.getHours();
    if ((startHour < 13 && endHour > 13) || (startHour >= 13 && startHour < 16)) {
      return false;
    }
    // No permitir seleccionar en días pasados
    if (start.setHours(0,0,0,0) < now.setHours(0,0,0,0)) {
      return false;
    }
    return true;
  },
  // No sobrescribas el handler de select, deja el comportamiento por defecto para que se muestre el highlight

  dateClick: function(info) {
    const calendarApi = info.view.calendar;
    if (isMobile) {
      if (info.view.type === 'dayGridMonth' || info.view.type === 'timeGridThreeDay') {
        calendarApi.changeView('timeGridDay', info.date);
      }
    } else {
      if (info.view.type === 'dayGridMonth') {
        calendarApi.changeView('timeGridWeek', info.date);
      }
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
  initialView: isMobile ? 'timeGridDay' : 'timeGridWeek',
  views: {
    timeGridThreeDay: {
      type: 'timeGrid',
      duration: { days: 3 },
      buttonText: '3 días',
    },
  },
};
