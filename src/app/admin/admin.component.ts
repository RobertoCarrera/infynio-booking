import { Component, OnInit } from '@angular/core';
import { Router, RouterModule, NavigationEnd } from '@angular/router';
import { CommonModule } from '@angular/common';
import { filter } from 'rxjs/operators';

@Component({
  selector: 'app-admin',
  imports: [RouterModule, CommonModule],
  templateUrl: './admin.component.html',
  styleUrls: ['./admin.component.css']
})
export class AdminComponent implements OnInit {
  activeTab = 'users';

  constructor(private router: Router) {}

  ngOnInit() {
    // Detectar cambios de ruta para actualizar la pestaña activa
    this.router.events.pipe(
      filter(event => event instanceof NavigationEnd)
    ).subscribe((event: NavigationEnd) => {
      const url = event.urlAfterRedirects;
      // Generic admin route marker so CSS can target any admin page
      if (url.startsWith('/admin')) {
        document.body.classList.add('route-admin');
      } else {
        document.body.classList.remove('route-admin');
      }

      if (url.includes('/admin/users')) {
        this.activeTab = 'users';
      } else if (url.includes('/admin/invite')) {
        this.activeTab = 'invite';
      } else if (url.includes('/admin/cartera')) {
        this.activeTab = 'cartera';
      }
    });

    // Establecer pestaña inicial basada en la URL actual
    const currentUrl = this.router.url;
    if (currentUrl.startsWith('/admin')) {
      document.body.classList.add('route-admin');
    }
    if (currentUrl.includes('/admin/users')) {
      this.activeTab = 'users';
    } else if (currentUrl.includes('/admin/invite')) {
      this.activeTab = 'invite';
    } else if (currentUrl.includes('/admin/cartera')) {
      this.activeTab = 'cartera';
    }
  }
}
