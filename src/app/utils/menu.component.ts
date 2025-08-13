import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router, RouterModule, NavigationEnd } from '@angular/router';
import { CommonModule } from '@angular/common';
import { SupabaseService } from '../services/supabase.service';
import { AuthService } from '../services/auth.service';
import { Subscription, of } from 'rxjs';
import { distinctUntilChanged, switchMap } from 'rxjs/operators';

@Component({
  selector: 'app-menu',
  standalone: true,
  imports: [RouterModule, CommonModule],
  templateUrl: './menu.component.html',
  styleUrls: ['./menu.component.css']
})
export class MenuComponent implements OnInit, OnDestroy {
  isAdmin = false;
  isLoggedIn = false;
  isMenuOpen = false;
  private subscriptions: Subscription[] = [];

  constructor(private supabase: SupabaseService, private auth: AuthService, private router: Router) {}

  ngOnInit() {
    // Primer observable: estado de autenticación del usuario
    const userSubscription = this.auth.currentUser$.pipe(
      distinctUntilChanged()
    ).subscribe(user => {
      this.isLoggedIn = !!user;
      // Al cambiar a loggeado, aseguramos el menú cerrado
      if (this.isLoggedIn) {
        this.closeMenu();
      }
      
      // Si no hay usuario, resetear isAdmin inmediatamente
      if (!user) {
        this.isAdmin = false;
        this.closeMenu();
      }
    });

    // Segundo observable: rol del usuario (solo cuando está loggeado)
    const roleSubscription = this.auth.currentUser$.pipe(
      distinctUntilChanged(),
      switchMap(user => {
        if (!user) {
          return of(null);
        }
        return this.supabase.getCurrentUserRole();
      }),
      distinctUntilChanged()
    ).subscribe(role => {
      if (role !== null) {
        const wasAdmin = this.isAdmin;
        this.isAdmin = role === 'admin';
      }
    });

    this.subscriptions.push(userSubscription, roleSubscription);

    // Cerrar menú en cualquier navegación (evita que quede abierto al entrar en calendario)
    const navSub = this.router.events.subscribe(event => {
      if (event instanceof NavigationEnd) {
        this.closeMenu();
      }
    });
    this.subscriptions.push(navSub);
  }

  ngOnDestroy() {
    this.subscriptions.forEach(sub => sub.unsubscribe());
  }

  logout() {
    this.auth.logout().subscribe(() => {
      // Asegurar que los valores se reseteen inmediatamente
      this.isLoggedIn = false;
      this.isAdmin = false;
      this.closeMenu();
    });
  }

  toggleMenu() {
    this.isMenuOpen = !this.isMenuOpen;
    const navCollapse = document.getElementById('navbarNav');
    if (navCollapse) {
      navCollapse.classList.toggle('show', this.isMenuOpen);
    }
  }

  closeMenu() {
    this.isMenuOpen = false;
    const navCollapse = document.getElementById('navbarNav');
    if (navCollapse) {
      navCollapse.classList.remove('show');
    }
  }
}