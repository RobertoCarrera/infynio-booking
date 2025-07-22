import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FullCalendarModule } from '@fullcalendar/angular';
import { FULLCALENDAR_OPTIONS } from './fullcalendar-config';
import { SupabaseService } from '../../services/supabase.service';

export interface CalendarClassSession {
  id: number;
  class_type_id: number;
  capacity: number;
  schedule_date: string;
  schedule_time: string;
  name: string;
  description: string;
  duration_minutes: number;
}

@Component({
  selector: 'app-calendar',
  standalone: true,
  imports: [CommonModule, FullCalendarModule],
  templateUrl: './calendar.component.html',
  styleUrls: ['./calendar.component.css'],
})
export class CalendarComponent implements OnInit {
  calendarOptions: any = { ...FULLCALENDAR_OPTIONS, events: [] };
  classSessions: CalendarClassSession[] = [];

  constructor(private supabaseService: SupabaseService) {}

  async ngOnInit() {
    this.classSessions = await this.supabaseService.getClassSessionsWithTypes();
    this.calendarOptions.events = this.classSessions.map(session => ({
      title: session.name,
      start: session.schedule_date + 'T' + session.schedule_time,
      end: this.getEndDateTime(session.schedule_date, session.schedule_time, session.duration_minutes),
      extendedProps: {
        description: session.description,
        capacity: session.capacity,
        classTypeId: session.class_type_id
      }
    }));
  }

  getEndDateTime(date: string, time: string, duration: number): string {
    const start = new Date(date + 'T' + time);
    start.setMinutes(start.getMinutes() + duration);
    return start.toISOString().slice(0,16);
  }
}