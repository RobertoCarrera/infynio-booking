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
    <div class="cartera-page-container bg-mars-studio">
  <div class="container py-4 d-flex flex-column align-items-center justify-content-start justify-content-xl-center">

        <!-- Cartera Info Component -->
        <div class="row w-100">
          <div class="col-12 col-xl-6 mb-4">
            <app-cartera-info></app-cartera-info>
          </div>
          <div class="col-12 col-xl-6">
            <app-cartera-bookings></app-cartera-bookings>
          </div>
        </div>
        <!-- Información adicional -->
        <div class="row w-100 mt-4">
          <div class="col-md-8">
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
          <div class="col-md-4 mt-4 mt-xl-0 card-contacto">
            <div class="card bg-light h-100">
              <div class="card-header">
                <h6 class="mb-0">
                  <i class="fas fa-phone me-2"></i>
                  ¿Necesitas ayuda?
                </h6>
              </div>
              <div class="card-body d-flex flex-column align-items-stretch justify-content-around">
                <p class="small mb-2">Si tienes dudas sobre tus bonos o necesitas adquirir más clases:</p>
                <div class="d-grid gap-2">
                  <a href="tel:+34123456789" class="btn btn-outline-primary btn-sm">
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
  `,
  styles: [`

    :host {
      /* Ensure this route component fills the available height in app-main */
      display: block;
      height: 100%;
    }

    .cartera-page-container {
      /* Fill parent and let inner container handle scrolling */
      height: 100%;
      display: flex;
      flex-direction: column;
      background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%);
    }

    /* Make the Bootstrap container the scrollable region within the page */
    .cartera-page-container > .container {
      flex: 1 1 auto;
      min-height: 0; /* critical for nested flex scrollers */
      overflow-y: auto;
      -webkit-overflow-scrolling: touch;
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

    @media (max-width: 768px) {
      .page-header {
        padding: 1rem;
        text-align: center;
      }
      
      .display-6 {
        font-size: 1.5rem;
      }
      /* Minimal safe-area padding; menu script will add extra bottom padding dynamically */
      .cartera-page-container > .container {
        padding-bottom: env(safe-area-inset-bottom);
      }
    }

    @media (min-width: 1200px){
      .card-contacto{
        height: 100%;
      }

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
