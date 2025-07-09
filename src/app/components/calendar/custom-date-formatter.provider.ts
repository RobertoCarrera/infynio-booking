import { CalendarDateFormatter, DateFormatterParams } from 'angular-calendar';
import { Injectable } from '@angular/core';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

@Injectable()
export class CustomDateFormatter extends CalendarDateFormatter {
  public override weekViewHour({ date, locale }: DateFormatterParams): string {
    return format(date, 'HH:mm', { locale: es });
  }

  public override dayViewHour({ date, locale }: DateFormatterParams): string {
    return format(date, 'HH:mm', { locale: es });
  }

  public override weekViewColumnHeader({ date, locale }: DateFormatterParams): string {
    // Ejemplo: 'Lunes'
    const day = format(date, 'EEEE', { locale: es });
    return day.charAt(0).toUpperCase() + day.slice(1);
  }

  public override weekViewTitle({ date, locale }: DateFormatterParams): string {
    // Ejemplo: 'Julio 2025'
    const month = format(date, 'LLLL', { locale: es });
    const year = format(date, 'yyyy', { locale: es });
    const capitalizedMonth = month.charAt(0).toUpperCase() + month.slice(1);
    return `${capitalizedMonth} ${year}`;
  }

  public override weekViewColumnSubHeader({ date, locale }: DateFormatterParams): string {
    // Ejemplo: 'Jul 7'
    const month = format(date, 'LLL', { locale: es });
    const day = format(date, 'd', { locale: es });
    const capitalizedMonth = month.charAt(0).toUpperCase() + month.slice(1);
    return `${capitalizedMonth} ${day}`;
  }
}
