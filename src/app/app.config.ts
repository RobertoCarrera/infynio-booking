import { ApplicationConfig, LOCALE_ID } from '@angular/core';
import { provideRouter, withViewTransitions } from '@angular/router';
import { routes } from './app.routes';
import { provideClientHydration, withNoHttpTransferCache } from '@angular/platform-browser';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { provideAnimations } from '@angular/platform-browser/animations';
import { registerLocaleData } from '@angular/common';
import localeEs from '@angular/common/locales/es';

registerLocaleData(localeEs);

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes, withViewTransitions()),
    provideClientHydration(withNoHttpTransferCache()),
    provideHttpClient(withFetch()),
  provideAnimations(),
  { provide: LOCALE_ID, useValue: 'es-ES' }
  ]
};