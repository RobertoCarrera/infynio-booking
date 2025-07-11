import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { MenuComponent } from './utils/menu.component';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, MenuComponent, CommonModule],
  template: `
    <app-menu></app-menu>
    <div class="container">
      <!-- Agregamos un mensaje de depuración -->
      <div class="alert alert-info mb-4" *ngIf="showDebug">
        Área de contenido principal - Debug Mode
        <button class="btn btn-sm btn-secondary ms-2" (click)="toggleDebug()">Ocultar</button>
      </div>
      <!-- Router outlet para cargar los componentes según la ruta -->
      <router-outlet></router-outlet>
    </div>
  `,
  styles: [`
    .container { padding-top: 20px; }
  `]
})
export class AppComponent {
  title = 'mars-studio';
  showDebug = true;
  
  toggleDebug() {
    this.showDebug = !this.showDebug;
  }
}