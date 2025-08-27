import { Component, OnInit, OnDestroy, AfterViewInit } from '@angular/core';
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
export class MenuComponent implements OnInit, AfterViewInit, OnDestroy {
  isAdmin = false;
  isLoggedIn = false;
  isMenuOpen = false;
  needsOnboarding = false;
  private subscriptions: Subscription[] = [];
  private resizeHandler: any;
  private _vvResizeHandler: any;
  private _vvScrollHandler: any;

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
        this.needsOnboarding = false;
        this.closeMenu();
      } else {
        // Comprobar si requiere onboarding (ocultar menú hasta completar)
        this.supabase.supabase
          .rpc('needs_onboarding', { uid: user.id })
          .then((res: any) => {
            const data = res?.data;
            const error = res?.error;
            if (error) {
              this.needsOnboarding = true;
            } else {
              this.needsOnboarding = !!data;
            }
          }, () => {
            this.needsOnboarding = true;
          });
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

  ngAfterViewInit() {
    // apply padding based on mobile nav height immediately and on resize
    this.syncMobileNavPadding();
    this.resizeHandler = () => this.syncMobileNavPadding();
    window.addEventListener('resize', this.resizeHandler);
    // visualViewport handling: keep a CSS var with the usable viewport height
    try {
      const updateViewportVar = () => {
        try {
          const vv = (window as any).visualViewport;
          const h = vv && vv.height ? Math.round(vv.height) : window.innerHeight;
          document.documentElement.style.setProperty('--app-viewport-height', `${h}px`);
          // keep padding synced when viewport changes (URL bar / keyboard)
          this.syncMobileNavPadding();
        } catch (e) {}
      };
      updateViewportVar();
      const vv = (window as any).visualViewport;
      if (vv) {
        this._vvResizeHandler = () => updateViewportVar();
        this._vvScrollHandler = () => updateViewportVar();
        vv.addEventListener('resize', this._vvResizeHandler);
        vv.addEventListener('scroll', this._vvScrollHandler);
      } else {
        // fallback: update on orientation change
        window.addEventListener('orientationchange', updateViewportVar);
      }
    } catch (e) {}
  }

  ngOnDestroy() {
    this.subscriptions.forEach(sub => sub.unsubscribe());
    if (this.resizeHandler) {
      window.removeEventListener('resize', this.resizeHandler);
    }
    try {
      const vv = (window as any).visualViewport;
      if (vv) {
        if (this._vvResizeHandler) vv.removeEventListener('resize', this._vvResizeHandler);
        if (this._vvScrollHandler) vv.removeEventListener('scroll', this._vvScrollHandler);
      } else {
        window.removeEventListener('orientationchange', () => {});
      }
    } catch (e) {}
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
    // keep padding in sync if the menu affects layout
    setTimeout(() => this.syncMobileNavPadding(), 50);
  }

  closeMenu() {
    this.isMenuOpen = false;
    const navCollapse = document.getElementById('navbarNav');
    if (navCollapse) {
      navCollapse.classList.remove('show');
    }
    setTimeout(() => this.syncMobileNavPadding(), 50);
  }

  private syncMobileNavPadding() {
    try {
      const mobileNav = document.querySelector('.mobile-bottom-nav') as HTMLElement | null;
      if (mobileNav && window.innerWidth < 992) {
        const height = mobileNav.offsetHeight; // real nav height
        try { document.documentElement.style.setProperty('--bottom-nav-height', `${height}px`); } catch {}
      } else {
        try { document.documentElement.style.removeProperty('--bottom-nav-height'); } catch {}
      }
    } catch (e) {
      // ignore DOM errors
    }
  }
}