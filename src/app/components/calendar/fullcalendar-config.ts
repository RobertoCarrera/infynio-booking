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

const isMobile = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(max-width: 600px)').matches;

// Función para formatear fechas personalizadas
const formatDayHeader = (date: Date): string => {
  const today = new Date();
  const isToday = date.toDateString() === today.toDateString();
  
  if (isToday) {
    return 'Hoy';
  }
  
  // Formato: "Lun 01" (weekday + day number, sin mes)
  const dayNames = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
  const dayName = dayNames[date.getDay()];
  const day = String(date.getDate()).padStart(2, '0');
  return `${dayName} ${day}`;
};

export const FULLCALENDAR_OPTIONS: CalendarOptions = {
  plugins: [timeGridPlugin, dayGridPlugin, interactionPlugin],
  locale: esLocale,
  // We use a custom toolbar component; disable FullCalendar's built-in header
  headerToolbar: false,
  // Formatos personalizados de fecha
  dayHeaderFormat: {
    weekday: 'short',
    day: '2-digit'
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
  // Horario visible total: 07:00 a 21:00
  slotMinTime: '07:00:00',
  slotMaxTime: '21:00:00',
  hiddenDays: [0, 6], // Oculta domingos y sábados
  allDaySlot: false,
  // Slots por hora (marcas cada 60 minutos)
  slotDuration: '01:00:00',
  // Horario laboral: 07:00–14:00 y 16:00–21:00 (L-V)
  businessHours: [
    { daysOfWeek: [1,2,3,4,5], startTime: '07:00', endTime: '14:00' },
    { daysOfWeek: [1,2,3,4,5], startTime: '16:00', endTime: '21:00' }
  ],
  // Selección habilitada en el calendario de admin (configurada en el componente)
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
