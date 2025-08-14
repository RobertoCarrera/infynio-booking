import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { AppComponent } from './app/app.component';

bootstrapApplication(AppComponent, appConfig)
  .catch((err) => console.error(err));

// Register Service Worker for PWA (only in production and if supported)
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    const isLocalhost = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
    const swUrl = '/sw.js';
    // Allow SW during local dev to test installability
    navigator.serviceWorker.register(swUrl).catch(console.error);
  });
}
