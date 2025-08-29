import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FullCalendarModule } from '@fullcalendar/angular';
import { CalendarOptions } from '@fullcalendar/core';
import { FULLCALENDAR_OPTIONS } from './fullcalendar-config';
import { ClassSessionsService, ClassSession } from '../../services/class-sessions.service';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-calendar',
  standalone: true,
  imports: [CommonModule, FullCalendarModule],
  templateUrl: './calendar.component.html',
  styleUrls: ['./calendar.component.css']
})
export class CalendarComponent implements OnInit, OnDestroy {
  // Use shared default config; component can extend/override if needed
  calendarOptions: CalendarOptions = { ...FULLCALENDAR_OPTIONS, events: [] };
  private subs: Subscription[] = [];

  constructor(private classSessions: ClassSessionsService) {}

  ngOnInit(): void {
    const sub = this.classSessions.getClassSessions().subscribe({
      next: (sessions: ClassSession[]) => this.applySessionsToCalendar(sessions),
      error: (err) => console.error('Error loading class sessions for calendar', err)
    });
    this.subs.push(sub);
  }

  ngOnDestroy(): void {
    this.subs.forEach(s => s.unsubscribe());
  }

  private applySessionsToCalendar(sessions: ClassSession[]) {
    const events = sessions.map(s => {
      const start = this.dateTimeToISO(s.schedule_date, s.schedule_time);
      // duration from class_type_duration (minutes) or fallback to 60
      const durationMinutes = s.class_type_duration || 60;
      const end = new Date(new Date(start).getTime() + durationMinutes * 60000).toISOString();
      return {
        id: String(s.id),
        title: s.class_type_name || 'Clase',
        start,
        end,
        extendedProps: {
          capacity: s.capacity,
          confirmed_bookings_count: s.confirmed_bookings_count,
          available_spots: s.available_spots,
          is_self_booked: s.is_self_booked
        }
      };
    });
    // replace events array in options so FullCalendar picks them up
    this.calendarOptions = { ...this.calendarOptions, events };
  }

  private dateTimeToISO(dateStr: string, timeStr: string): string {
    // dateStr expected 'YYYY-MM-DD', timeStr 'HH:MM:SS' or 'HH:MM'
    const t = (timeStr || '').split(':').slice(0,3).map((v,i)=> v || (i===1? '00':'00'));
    const hh = t[0] || '00';
    const mm = t[1] || '00';
    const ss = t[2] || '00';
    return new Date(`${dateStr}T${hh.padStart(2,'0')}:${mm.padStart(2,'0')}:${ss.padStart(2,'0')}`).toISOString();
  }
}