import { Component } from '@angular/core';
import { RouterModule } from '@angular/router';
import { CommonModule } from '@angular/common';
import { SupabaseService } from '../services/supabase-admin.service';

@Component({
  selector: 'app-menu',
  standalone: true,
  imports: [RouterModule, CommonModule],
  template: `
    <nav class="navbar navbar-expand-lg navbar-dark bg-dark">
      <div class="container-fluid">
        <a class="navbar-brand" href="#">MarsStudio</a>
        <button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#navbarNav">
          <span class="navbar-toggler-icon"></span>
        </button>
        <div class="collapse navbar-collapse" id="navbarNav">
          <ul class="navbar-nav">
            <li class="nav-item">
              <a routerLink="/login" class="nav-link" routerLinkActive="active">Login</a>
            </li>
            <li class="nav-item">
              <a routerLink="/forgot-password" class="nav-link" routerLinkActive="active">Recuperar contraseña</a>
            </li>
            <li class="nav-item">
              <a routerLink="/reset-password" class="nav-link" routerLinkActive="active">Restablecer contraseña</a>
            </li>
            <li class="nav-item">
              <a routerLink="/calendario" class="nav-link" routerLinkActive="active">Calendario</a>
            </li>
            <li class="nav-item" *ngIf="isAdmin">
              <a routerLink="/admin" class="nav-link" routerLinkActive="active">Admin</a>
            </li>
          </ul>
        </div>
      </div>
    </nav>
  `,
  styles: [`
    .navbar { margin-bottom: 20px; }
  `]
})
export class MenuComponent {
  isAdmin = false;

  constructor(private supabase: SupabaseService) {
    this.supabase.getCurrentUserRole().subscribe(role => {
      this.isAdmin = role === 'admin';
      console.log('MenuComponent: Detected role', role);
    });
  }
}