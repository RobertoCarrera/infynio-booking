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
  const main = document.getElementById('mainContent') as HTMLElement | null;
  // If the calendar is active on the page, let the calendar component
  // manage bottom padding/height itself to avoid double adjustments
  const hasCalendar = !!document.querySelector('app-calendar, .fc');
      if (!main) return;
  if (mobileNav && window.innerWidth < 992 && !hasCalendar) {
        const height = mobileNav.offsetHeight + 12; // small extra gap
        // expose bottom nav height as a CSS variable for pages to consume
        try { document.documentElement.style.setProperty('--bottom-nav-height', `${height}px`); } catch (e) {}

        // Prefer applying padding to scrollable elements inside main so we don't
        // mutate heights globally (safer for libraries like FullCalendar).
        const scrollers = Array.from(main.querySelectorAll<HTMLElement>('*')) as HTMLElement[];

        // Always include the main container itself as a fallback target
        scrollers.unshift(main);

        scrollers.forEach(el => {
          // Skip any element that is part of a FullCalendar instance. FullCalendar
          // manages its own scrollers and we must not mutate its inline styles
          // (it was adding `padding-bottom: calc(...)` which causes layout issues).
          // We detect FullCalendar by the presence of a parent/ancestor with
          // the root `.fc` class.
          if (el.closest && el.closest('.fc')) {
            return; // don't touch FullCalendar internals
          }
          try {
            const cs = window.getComputedStyle(el);
            const overflowY = (cs.overflowY || '').toLowerCase();
            const isScrollable = overflowY === 'auto' || overflowY === 'scroll' || el.scrollHeight > el.clientHeight + 1;
            if (!isScrollable) return;

            // store original inline padding-bottom if not stored
            if (!el.dataset['origPaddingBottom']) {
              // store under dataset.origPaddingBottom -> attribute becomes data-orig-padding-bottom
              el.dataset['origPaddingBottom'] = el.style.paddingBottom || '';
            }

            const computedPadding = window.getComputedStyle(el).paddingBottom || '0px';
            // Set padding-bottom to ensure content isn't hidden behind the bottom nav.
            // Use calc to preserve existing computed padding.
            el.style.paddingBottom = `calc(${height}px + ${computedPadding})`;
          } catch (e) {
            // ignore individual element errors
          }
        });

        // Also set a minimal fallback on the main element's inline padding so
        // simple pages without inner scrollers are protected. Use the same
        // dataset key as other adjusted elements (`origPaddingBottom`).
        if (!main.dataset['origPaddingBottom']) {
          main.dataset['origPaddingBottom'] = main.style.paddingBottom || '';
        }
        main.style.paddingBottom = `${height}px`;

        // If the document itself is the primary scroller (common in simple
        // pages where window scrolls), ensure we also apply padding to the
        // scrolling element (html/body) so content doesn't flow under the
        // bottom nav. We check scrollHeight to decide if document scrolling is
        // active and apply a similar padding there.
        try {
          const docScroller = (document.scrollingElement || document.documentElement) as HTMLElement | null;
          if (docScroller) {
            const isDocScrollable = docScroller.scrollHeight > docScroller.clientHeight + 1;
            if (isDocScrollable) {
              if (!docScroller.dataset['origPaddingBottom']) {
                docScroller.dataset['origPaddingBottom'] = docScroller.style.paddingBottom || '';
              }
              const docComputed = window.getComputedStyle(docScroller).paddingBottom || '0px';
              docScroller.style.paddingBottom = `calc(${height}px + ${docComputed})`;
            }
          }
        } catch (e) {}
      } else {
        // clear the CSS variable when no mobile nav is present
        try { document.documentElement.style.removeProperty('--bottom-nav-height'); } catch (e) {}
        // restore inline padding-bottom on any elements we modified
        const adjusted = Array.from(document.querySelectorAll<HTMLElement>('[data-orig-padding-bottom]')) as HTMLElement[];
        adjusted.forEach(el => {
          try {
            el.style.paddingBottom = el.dataset['origPaddingBottom'] || '';
            delete el.dataset['origPaddingBottom'];
          } catch (e) {}
        });

        // ensure main also gets restored
        if (main && main.dataset['origPaddingBottom']) {
          main.style.paddingBottom = main.dataset['origPaddingBottom'] || '';
          delete main.dataset['origPaddingBottom'];
        } else if (main) {
          main.style.paddingBottom = '';
        }

        // restore padding on document scroller if we modified it
        try {
          const docScroller = (document.scrollingElement || document.documentElement) as HTMLElement | null;
          if (docScroller && docScroller.dataset['origPaddingBottom']) {
            docScroller.style.paddingBottom = docScroller.dataset['origPaddingBottom'] || '';
            delete docScroller.dataset['origPaddingBottom'];
          }
        } catch (e) {}
      }
    } catch (e) {
      // ignore DOM errors
    }
  }
}