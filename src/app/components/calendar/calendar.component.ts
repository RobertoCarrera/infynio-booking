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
  calendarOptions = FULLCALENDAR_OPTIONS;
  classSessions: CalendarClassSession[] = [];

  constructor(private supabaseService: SupabaseService) {}

  async ngOnInit() {
    this.classSessions = await this.supabaseService.getClassSessionsWithTypes();
  }
}