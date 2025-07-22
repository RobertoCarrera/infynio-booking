import { Component } from '@angular/core';
import { RouterModule } from '@angular/router';
import { CommonModule } from '@angular/common';
import { SupabaseService } from '../services/supabase.service';
import { AuthService } from '../services/auth.service';
import { CarteraInfoComponent } from '../components/cartera-info/cartera-info.component';

@Component({
  selector: 'app-menu',
  standalone: true,
  imports: [RouterModule, CommonModule, CarteraInfoComponent],
  templateUrl: './menu.component.html',
  styleUrls: ['./menu.component.css']
})
export class MenuComponent {
  isAdmin = false;
  isLoggedIn = false;
  showCartera = false;

  constructor(private supabase: SupabaseService, private auth: AuthService) {
    this.supabase.getCurrentUserRole().subscribe(role => {
      this.isAdmin = role === 'admin';
    });
    this.auth.currentUser$.subscribe(user => {
      this.isLoggedIn = !!user;
    });
  }

  logout() {
    this.auth.logout().subscribe();
  }

  toggleCartera() {
    this.showCartera = !this.showCartera;
  }

  closeCartera() {
    this.showCartera = false;
  }
}