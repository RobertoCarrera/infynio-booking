import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CarteraInfoComponent } from '../cartera-info/cartera-info.component';
import { CarteraClasesService } from '../../services/cartera-clases.service';
import { AuthService } from '../../services/auth.service';
import { Subscription } from 'rxjs';
import { CarteraBookingsComponent } from '../cartera-bookings/cartera-bookings.component';

@Component({
  selector: 'app-cartera-page',
  standalone: true,
  imports: [CommonModule, CarteraInfoComponent, CarteraBookingsComponent],
  template: `
    <div class="cartera-page p-wrapper">
  <div class="container pb-3 p-0 overflow-xl-hidden d-xl-flex flex-column align-items-stretch justify-content-around">

        <!-- Cartera Info Component -->
        <div class="top-section">
        <div class="row w-100 p-0 m-0 mt-xl-0">
          <div class="col-12 p-0 col-xl-6 pe-xl-2">
            <app-cartera-info></app-cartera-info>
          </div>
          <div class="col-12 p-0 col-xl-6 mt-4 ps-xl-2 mt-xl-0">
            <app-cartera-bookings></app-cartera-bookings>
          </div>
        </div>
        </div>
        <!-- Información adicional -->
        <div class="bottom-section">
        <div class="row w-100 m-0 mt-4 m-xl-0 p-0 d-flex align-items-stretch justify-content-between">
          <div class="col-12 col-xl-7 p-0">
            <div class="card">
              <div class="card-header">
                <h5 class="mb-0">
                  <i class="bi bi-info-circle me-2"></i>
                  Información sobre tus bonos
                </h5>
              </div>
              <div class="card-body">
                <div class="row">
                  <div class="col-12">
                    <h6>¿Cómo funcionan los bonos?</h6>
                    <ul class="list-unstyled">
                      <li><i class="fas fa-check text-success me-2"></i>Cada bono incluye un número específico de clases</li>
                      <li><i class="fas fa-check text-success me-2"></i>Las clases se consumen al confirmar tu reserva</li>
                      <li><i class="fas fa-check text-success me-2"></i>Puedes tener múltiples bonos activos al mismo tiempo</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div class="col-12 col-xl-3 p-0 mt-4 mt-xl-0">
            <div class="card bg-light">
              <div class="card-header">
                <h6 class="mb-0">
                  <i class="fas fa-phone me-2"></i>
                  ¿Necesitas ayuda?
                </h6>
              </div>
              <div class="card-body">
                <p class="small mb-2">Si tienes dudas sobre tus bonos o necesitas adquirir más clases:</p>
                <div class="d-grid gap-2">
                  <a href="tel:+34617377497" class="btn btn-outline-primary btn-sm">
                    <i class="fas fa-phone me-2"></i>
                    Llamar al estudio
                  </a>
                  <a href="mailto:info@mars-studio.es" class="btn btn-outline-secondary btn-sm">
                    <i class="fas fa-envelope me-2"></i>
                    Enviar email
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    :host {
      /* Ensure this route component fills the available height in app-main */
      display: block;
      height: 100%;
    }

    /* Use the shared .p-wrapper pattern (same as calendar) so the page-level
       wrapper controls viewport sizing and the inner .container becomes the
       single scrollable region. This mirrors the calendar implementation. */
    .cartera-page.p-wrapper {
      height: 100%;
      display: flex;
      flex-direction: column;
      background: transparent;
    }

    /* The Bootstrap container becomes the main scroller inside the p-wrapper.
       Keep min-height:0 so nested flex scrollers behave correctly. */
    .cartera-page.p-wrapper > .container {
      flex: 1 1 auto;
      min-height: 0; /* critical for nested flex scrollers */
      overflow-y: auto;
      -webkit-overflow-scrolling: touch;
    }

    /* Desktop: cap the whole cartera page to 90vh so the route never
       makes the document scroll; the inner .container fills that area. */
    @media (min-width: 992px) {
      /* On desktop, let the p-wrapper fill the available height of its
         parent (.app-main). Do NOT force 100vh here (that would exceed the
         available area because the app shell includes a sticky header). */
      .cartera-page.p-wrapper {
        height: 100%;
        max-height: 100%;
        margin-bottom: 0; /* neutralize global .p-wrapper margins */
        padding: 0; /* remove global padding so inner container fits exactly */
      }

      /* Make the container a column flex so its child rows can be sized
         and keep the layout inside the 100vh box. Reduce gap and cancel
         row margins on desktop so the two sections add up to the full
         viewport height without producing an outer scrollbar. */
      .cartera-page.p-wrapper > .container {
        display: flex;
        flex-direction: column;
        /* avoid extra gap because rows already use margins on mobile */
        gap: 0;
        height: 100%;
        overflow: hidden; /* keep the outer container fixed; inner regions scroll */
        /* Prevent horizontal overflow caused by wide children */
        overflow-x: hidden;
        width: 100%;
        box-sizing: border-box;
        /* remove bottom padding used on mobile */
        padding-bottom: 0 !important;
      }

      /* Dynamic layout: let the container distribute space between the
         top and bottom sections so the bottom cards sit at the lower edge
         of the available area. Top section grows, bottom section sizes to
         its content and is aligned to the bottom. */
      .cartera-page.p-wrapper > .container {
        /* small separation from the sticky menu */
        padding-top: 0.5rem;
        /* push top to the top and bottom to the bottom dynamically */
        justify-content: space-between;
  /* add a little breathing room from the viewport bottom on desktop */
  padding-bottom: 2rem;
      }

      .cartera-page.p-wrapper > .container > .top-section {
        /* flexible: take remaining space but cap its height so bottom area stays visible */
        flex: 1 1 auto;
        max-height: 55%;
        min-height: 0;
        overflow: hidden;
        display: flex;
        flex-direction: column;
        gap: 1rem;
      }

      /* Bottom section sizes to its content and is pushed to the bottom by
         the container's space-distribution above. Align its columns to the
         end so cards rest visually lower in the area. */
      .cartera-page.p-wrapper > .container > .bottom-section {
        flex: 0 0 auto;
        min-height: 0;
        overflow: visible;
        display: flex;
        align-items: flex-end;
      }

      /* Allow bottom columns and cards to size naturally (avoid forcing 100% heights) */
      .cartera-page.p-wrapper > .container > .bottom-section > .row > [class*="col-"] {
        height: auto;
        min-height: 0;
        overflow: visible;
      }

      /* Neutralize Bootstrap utility margins on desktop rows so we don't
         accumulate unexpected vertical space (mt-4 etc. used for mobile). */
      .cartera-page.p-wrapper > .container > .top-section > .row,
      .cartera-page.p-wrapper > .container > .bottom-section > .row {
        margin-top: 0;
        margin-bottom: 0;
      }

      /* Ensure cards fill their column height so .card-body can scroll
         correctly and no extra gaps are introduced by card sizing. */
      .cartera-page.p-wrapper > .container > .top-section > .row > [class*="col-"] .card,
      .cartera-page.p-wrapper > .container > .bottom-section > .row > [class*="col-"] .card {
        height: 100%;
        display: flex;
        flex-direction: column;
      }

      /* Make card body a true flex child that scrolls internally. */
      .cartera-page.p-wrapper > .container .card .card-body {
        flex: 1 1 auto;
        min-height: 0;
        overflow-y: auto;
        -webkit-overflow-scrolling: touch;
      }

      /* Make the columns inside the top section fill their vertical space */
      .cartera-page.p-wrapper > .container > .top-section > .row > [class*="col-"] {
        height: 100%;
        min-height: 0;
        overflow: hidden;
      }

      /* Ensure top-section cards don't expand beyond the capped height and
         their bodies scroll when content exceeds the space. */
      .cartera-page.p-wrapper > .container > .top-section > .row > [class*="col-"] .card {
        display: flex;
        flex-direction: column;
        max-height: 100%;
      }

      .cartera-page.p-wrapper > .container > .top-section > .row > [class*="col-"] .card .card-body {
        overflow-y: auto;
        -webkit-overflow-scrolling: touch;
        flex: 1 1 auto;
        min-height: 0;
      }

      /* Desktop: explicitly cap the visible height of the 'Tus bonos' list
         and the 'Tus próximas reservas' body so they get internal scrollbars
         and you can reach all items (e.g. 4 bonos). Adjust the px value if
         you prefer a different visible area. */
      .cartera-page.p-wrapper > .container > .top-section .cartera-info .card .card-body {
        max-height: 420px;
        overflow-y: auto;
      }

      .cartera-page.p-wrapper > .container > .top-section .cartera-bookings .card .card-body {
        max-height: 420px;
        overflow-y: auto;
      }

      /* Specifically ensure the 'Tus bonos' and 'Tus próximas reservas' cards
         (cartera-info and cartera-bookings) scroll internally on desktop. */
      .cartera-page.p-wrapper > .container > .top-section .cartera-info .card,
      .cartera-page.p-wrapper > .container > .top-section .cartera-bookings .card {
        display: flex;
        flex-direction: column;
        height: 100%;
        min-height: 0;
      }

      .cartera-page.p-wrapper > .container > .top-section .cartera-info .card .card-body,
      .cartera-page.p-wrapper > .container > .top-section .cartera-bookings .card .card-body {
        overflow-y: auto;
        -webkit-overflow-scrolling: touch;
        flex: 1 1 auto;
        min-height: 0;
      }

      /* Ensure card bodies inside top/bottom sections can scroll internally */
      .cartera-page.p-wrapper > .container .card .card-body {
        display: block;
        max-height: 100%;
        overflow-y: auto;
        -webkit-overflow-scrolling: touch;
      }

      /* Prevent horizontal overflow at the page wrapper level */
      .cartera-page.p-wrapper {
        overflow-x: hidden;
      }

      /* Make sure rows and cards don't exceed their container width */
      .cartera-page.p-wrapper .row,
      .cartera-page.p-wrapper .card {
        max-width: 100%;
        box-sizing: border-box;
        overflow-x: hidden;
      }

      /* Apply styles into child component DOM (pierce view encapsulation) so
         the internal .card-body elements get the scrollbar we configured. */
      :host ::ng-deep .cartera-info .card .card-body,
      :host ::ng-deep .cartera-bookings .card .card-body {
        max-height: 420px;
        overflow-y: auto;
        -webkit-overflow-scrolling: touch;
      }
    }

    .page-header {
      background: white;
      padding: 2rem;
      border-radius: 1rem;
      box-shadow: 0 2px 10px rgba(0,0,0,0.1);
      border-left: 5px solid #007bff;
    }

    .display-6 {
      color: #2c3e50;
      font-weight: 600;
    }

    .text-purple {
      color: #9c27b0 !important;
    }

    .card {
      border: none;
      border-radius: 1rem;
      box-shadow: 0 2px 10px rgba(0,0,0,0.08);
    }

    .card-header {
      background-color: #f8f9fa;
      border-bottom: 1px solid #dee2e6;
      border-radius: 1rem 1rem 0 0 !important;
    }

    .list-unstyled li {
      padding: 0.25rem 0;
    }

  /* Mobile tweaks */
  @media (max-width: 991.98px) {
      .page-header {
        padding: 1rem;
        text-align: center;
      }
      
      .display-6 {
        font-size: 1.5rem;
      }
  /* Remove inner bottom padding: app-main already reserves space in mobile */
  /* Reserve space for the mobile bottom nav + safe-area inset so content (bonos) isn't hidden
    Use the same variable set by the menu logic (--bottom-nav-height) and a small buffer. */
  /* Reserve space for mobile bottom nav so bonos content isn't hidden. This
    matches the technique used by the calendar: use the runtime CSS var set
    by the menu and the safe-area inset. */
  .cartera-page.p-wrapper > .container { padding-bottom: calc(env(safe-area-inset-bottom, 0px) + var(--bottom-nav-height, 72px) + 12px) !important; }
    }
  `]
})
export class CarteraPageComponent implements OnInit, OnDestroy {
  private subscriptions: Subscription[] = [];

  constructor(
    private carteraService: CarteraClasesService,
    private authService: AuthService
  ) {}

  ngOnInit() {
    // Aquí puedes agregar lógica adicional si es necesaria
  }

  ngOnDestroy() {
    this.subscriptions.forEach(sub => sub.unsubscribe());
  }
}
