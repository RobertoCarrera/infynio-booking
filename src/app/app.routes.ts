import { Routes } from '@angular/router';
import { ClasesComponent } from './components/classes/clases.component';
import { CalendarComponent } from './components/calendar/calendar.component';
import { ProfileComponent } from './components/profile/profile.component';

export const routes: Routes = [
  { path: '', redirectTo: 'calendario', pathMatch: 'full' },
  { path: 'clases', component: ClasesComponent },
  { path: 'perfil', component: ProfileComponent },  
  { path: 'calendario', component: CalendarComponent },
];
