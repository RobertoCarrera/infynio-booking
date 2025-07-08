import { Routes } from '@angular/router';
import { InicioComponent } from './components/home/inicio.component';
import { ClasesComponent } from './components/classes/clases.component';
import { CalendarComponent } from './components/calendar/calendar.component';
import { ProfileComponent } from './components/profile/profile.component';

export const routes: Routes = [
  { path: '', redirectTo: 'inicio', pathMatch: 'full' },
  { path: 'inicio', component: InicioComponent },
  { path: 'clases', component: ClasesComponent },
  { path: 'perfil', component: ProfileComponent },  
  { path: 'calendario', component: CalendarComponent },
];
