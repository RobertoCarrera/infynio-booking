import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./components/calendar/calendar.component').then(m => m.CalendarComponent)
  },
  {
    path: 'login',
    loadComponent: () => import('./components/login/login.component').then(m => m.LoginComponent)
  },
  {
    path: 'clases',
    loadComponent: () => import('./components/class-types/class-types.component').then(m => m.ClassTypesComponent)
  },
  {
    path: 'perfil',
    loadComponent: () => import('./components/profile/profile.component').then(m => m.ProfileComponent)
  },
  {
    path: 'calendario',
    loadComponent: () => import('./components/calendar/calendar.component').then(m => m.CalendarComponent)
  },
  {
    path: '**',
    redirectTo: 'login',
    pathMatch: 'full'
  }
];
