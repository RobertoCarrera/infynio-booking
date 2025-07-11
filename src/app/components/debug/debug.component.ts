import { Component, Inject, PLATFORM_ID } from '@angular/core';
import { CommonModule, isPlatformBrowser, isPlatformServer } from '@angular/common';
import { RouterModule } from '@angular/router';

@Component({
  selector: 'app-debug',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
    <div class="container">
      <div class="card">
        <div class="card-header bg-primary text-white">
          Información de Diagnóstico
        </div>
        <div class="card-body">
          <h5>Entorno de ejecución</h5>
          <ul class="list-group mb-3">
            <li class="list-group-item">Plataforma: {{ platformType }}</li>
            <li class="list-group-item">Modo: {{ isProduction ? 'Producción' : 'Desarrollo' }}</li>
          </ul>
          
          <h5>Navegación</h5>
          <div class="mb-3">
            <a routerLink="/login" class="btn btn-outline-primary me-2">Login</a>
            <a routerLink="/forgot-password" class="btn btn-outline-primary me-2">Recuperar contraseña</a>
            <a routerLink="/reset-password" class="btn btn-outline-primary me-2">Restablecer contraseña</a>
            <a routerLink="/calendario" class="btn btn-outline-primary me-2">Calendario</a>
          </div>
          
          <h5>Estado de la aplicación</h5>
          <div *ngIf="isBrowser">
            <p><strong>URL actual:</strong> {{ currentUrl }}</p>
            <p><strong>Hash:</strong> {{ currentHash || 'No hay hash' }}</p>
            <p><strong>User Agent:</strong> {{ userAgent }}</p>
          </div>
          <div *ngIf="!isBrowser">
            <p>Información no disponible en renderizado del servidor</p>
          </div>
        </div>
      </div>
    </div>
  `
})
export class DebugComponent {
  platformType: string;
  isBrowser: boolean;
  isProduction = false;
  currentUrl: string = '';
  currentHash: string = '';
  userAgent: string = '';

  constructor(@Inject(PLATFORM_ID) private platformId: Object) {
    this.isBrowser = isPlatformBrowser(platformId);
    this.platformType = this.isBrowser ? 'Navegador' : 'Servidor';
    
    if (this.isBrowser) {
      this.currentUrl = window.location.href;
      this.currentHash = window.location.hash;
      this.userAgent = window.navigator.userAgent;
    }
    
    console.log('DebugComponent inicializado');
    console.log('Plataforma:', this.platformType);
  }
}