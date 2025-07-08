import { Component, LOCALE_ID } from '@angular/core';
import { CommonModule, registerLocaleData } from '@angular/common';
import localeEs from '@angular/common/locales/es';
import { CalendarModule, CalendarView, DateAdapter, CalendarUtils, CalendarA11y, CalendarDateFormatter, DAYS_OF_WEEK } from 'angular-calendar';
import { adapterFactory } from 'angular-calendar/date-adapters/date-fns';
import { CustomDateFormatter } from './custom-date-formatter.provider';

registerLocaleData(localeEs);

@Component({
  selector: 'app-calendar',
  standalone: true,
  imports: [CommonModule, CalendarModule],
  providers: [
    { provide: DateAdapter, useFactory: adapterFactory },
    { provide: LOCALE_ID, useValue: 'es' },
    CalendarUtils,
    CalendarA11y,
    { provide: CalendarDateFormatter, useClass: CustomDateFormatter }
  ],
  templateUrl: './calendar.component.html',
  styleUrls: ['./calendar.component.css'],
})
export class CalendarComponent {
  view: CalendarView = CalendarView.Week;
  CalendarView = CalendarView;
  viewDate: Date = new Date();
  excludeDays: number[] = [0, 6]; // 0: domingo, 6: sábado
  hourSegments = 1;
  dayStartHour = 9;
  dayEndHour = 19;
  weekStartsOn = DAYS_OF_WEEK.MONDAY;
  daysInWeek = 5;
  DAYS_OF_WEEK = DAYS_OF_WEEK;

  ngOnInit() {
    this.viewDate = new Date();
    this.weekStartsOn = this.viewDate.getDay(); // El día actual será el primero
  }

  setView(view: CalendarView) {
    this.view = view;
  }
}