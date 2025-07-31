import { Component, OnInit, OnDestroy } from '@angular/core';
import { RouterModule } from '@angular/router';
import { CommonModule } from '@angular/common';
import { SupabaseService } from '../services/supabase.service';
import { AuthService } from '../services/auth.service';
<<<<<<< HEAD
import { CarteraInfoComponent } from '../components/cartera-info/cartera-info.component';
=======
import { Subscription, of } from 'rxjs';
import { distinctUntilChanged, switchMap } from 'rxjs/operators';
>>>>>>> fix-backend

@Component({
  selector: 'app-menu',
  standalone: true,
  imports: [RouterModule, CommonModule, CarteraInfoComponent],
  templateUrl: './menu.component.html',
  styleUrls: ['./menu.component.css']
})
export class MenuComponent implements OnInit, OnDestroy {
  isAdmin = false;
  isLoggedIn = false;
<<<<<<< HEAD
  showCartera = false;
=======
  private subscriptions: Subscription[] = [];
>>>>>>> fix-backend

  constructor(private supabase: SupabaseService, private auth: AuthService) {}

  ngOnInit() {
    // Primer observable: estado de autenticación del usuario
    const userSubscription = this.auth.currentUser$.pipe(
      distinctUntilChanged()
    ).subscribe(user => {
      console.log('MenuComponent: User state changed', { user: !!user });
      this.isLoggedIn = !!user;
      
      // Si no hay usuario, resetear isAdmin inmediatamente
      if (!user) {
        this.isAdmin = false;
        console.log('MenuComponent: No user, isAdmin set to false');
      }
    });

    // Segundo observable: rol del usuario (solo cuando está loggeado)
    const roleSubscription = this.auth.currentUser$.pipe(
      distinctUntilChanged(),
      switchMap(user => {
        if (!user) {
          return of(null);
        }
        console.log('MenuComponent: User found, checking role...');
        return this.supabase.getCurrentUserRole();
      }),
      distinctUntilChanged()
    ).subscribe(role => {
      if (role !== null) {
        const wasAdmin = this.isAdmin;
        this.isAdmin = role === 'admin';
        console.log('MenuComponent: Role updated', { role, isAdmin: this.isAdmin, wasAdmin });
        
        // Forzar detección de cambios si el estado de admin cambió
        if (wasAdmin !== this.isAdmin) {
          console.log('MenuComponent: Admin status changed, forcing update');
        }
      }
    });

    this.subscriptions.push(userSubscription, roleSubscription);
  }

  ngOnDestroy() {
    this.subscriptions.forEach(sub => sub.unsubscribe());
  }

  logout() {
    this.auth.logout().subscribe(() => {
      // Asegurar que los valores se reseteen inmediatamente
      this.isLoggedIn = false;
      this.isAdmin = false;
    });
  }

  toggleCartera() {
    this.showCartera = !this.showCartera;
  }

  closeCartera() {
    this.showCartera = false;
  }
}