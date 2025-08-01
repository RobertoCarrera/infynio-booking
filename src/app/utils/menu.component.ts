import { Component, OnInit, OnDestroy } from '@angular/core';
import { RouterModule } from '@angular/router';
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
  private subscriptions: Subscription[] = [];

  constructor(private supabase: SupabaseService, private auth: AuthService) {}

  ngOnInit() {
    // Primer observable: estado de autenticación del usuario
    const userSubscription = this.auth.currentUser$.pipe(
      distinctUntilChanged()
    ).subscribe(user => {
      this.isLoggedIn = !!user;
      
      // Si no hay usuario, resetear isAdmin inmediatamente
      if (!user) {
        this.isAdmin = false;
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
}