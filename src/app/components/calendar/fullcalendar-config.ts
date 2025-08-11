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

// Función para formatear fechas personalizadas
const formatDayHeader = (date: Date): string => {
  const today = new Date();
  const isToday = date.toDateString() === today.toDateString();
  
  if (isToday) {
    return 'Hoy';
  }
  
  // Formato: "Lun 01/09"
  const dayNames = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
  const dayName = dayNames[date.getDay()];
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  
  return `${dayName} ${day}/${month}`;
};

export const FULLCALENDAR_OPTIONS: CalendarOptions = {
  plugins: [timeGridPlugin, dayGridPlugin, interactionPlugin],
  locale: esLocale,
  headerToolbar: isMobile
    ? {
        left: 'prev,next today',
        center: 'title',
  right: 'timeGridDay,timeGridThreeDay'
      }
    : {
        left: 'prev,next today',
        center: 'title',
        right: 'timeGridWeek,dayGridMonth'
      },
  // Formatos personalizados de fecha
  dayHeaderFormat: {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit'
  },
  dayHeaderContent: (arg) => {
    return formatDayHeader(arg.date);
  },
  titleFormat: {
    year: 'numeric',
    month: 'long'
  },
  // Formato personalizado para fechas en vista mensual
  dayCellContent: (arg) => {
    return String(arg.dayNumberText).replace(/\D/g, ''); // Solo el número del día
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
  selectable: false,
  selectMirror: false,
  selectOverlap: false,
  // Desactivamos cualquier selección de celdas
  // Eliminamos el handler de dateClick para que no cambie la vista al hacer click en el fondo
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
