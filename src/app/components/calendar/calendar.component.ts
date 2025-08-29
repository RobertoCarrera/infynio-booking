import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FullCalendarModule } from '@fullcalendar/angular';
import { CalendarOptions } from '@fullcalendar/core';
import { FULLCALENDAR_OPTIONS } from './fullcalendar-config';

@Component({
  selector: 'app-calendar',
  standalone: true,
  imports: [CommonModule, FullCalendarModule],
  templateUrl: './calendar.component.html',
  styleUrls: ['./calendar.component.css']
})
export class CalendarComponent {
  // Use shared default config; component can extend/override if needed
  calendarOptions: CalendarOptions = { ...FULLCALENDAR_OPTIONS };
}