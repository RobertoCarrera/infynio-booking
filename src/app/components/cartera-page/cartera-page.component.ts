import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CarteraInfoComponent } from '../cartera-info/cartera-info.component';
import { CarteraClasesService } from '../../services/cartera-clases.service';
import { AuthService } from '../../services/auth.service';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-cartera-page',
  standalone: true,
  imports: [CommonModule, CarteraInfoComponent],
  template: `
    <div class="cartera-page-container">
      <div class="container py-4">
        <!-- Header -->
        <div class="row mb-4">
          <div class="col-12">
            <div class="page-header">
              <h1 class="display-6 mb-2">
                <i class="fas fa-ticket-alt me-3"></i>
                Mi Cartera de Clases
              </h1>
              <p class="text-muted">Gestiona y consulta tus bonos de clases disponibles</p>
            </div>
          </div>
        </div>

        <!-- Cartera Info Component -->
        <div class="row">
          <div class="col-12">
            <app-cartera-info></app-cartera-info>
          </div>
        </div>

        <!-- Información adicional -->
        <div class="row mt-4">
          <div class="col-md-8">
            <div class="card">
              <div class="card-header">
                <h5 class="mb-0">
                  <i class="fas fa-info-circle me-2"></i>
                  Información sobre tus bonos
                </h5>
              </div>
              <div class="card-body">
                <div class="row">
                  <div class="col-md-6">
                    <h6>¿Cómo funcionan los bonos?</h6>
                    <ul class="list-unstyled">
                      <li><i class="fas fa-check text-success me-2"></i>Cada bono incluye un número específico de clases</li>
                      <li><i class="fas fa-check text-success me-2"></i>Las clases se consumen al confirmar tu reserva</li>
                      <li><i class="fas fa-check text-success me-2"></i>Puedes tener múltiples bonos activos al mismo tiempo</li>
                    </ul>
                  </div>
                  <div class="col-md-6">
                    <h6>Tipos de clases</h6>
                    <ul class="list-unstyled">
                      <li><i class="fas fa-dumbbell text-primary me-2"></i><strong>MAT-Funcional:</strong> Clases en colchoneta</li>
                      <li><i class="fas fa-expand-arrows-alt text-purple me-2"></i><strong>Reformer:</strong> Clases con máquina Reformer</li>
                      <li><i class="fas fa-crown text-warning me-2"></i><strong>Personalizadas:</strong> Clases individuales</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div class="col-md-4">
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
    .cartera-page-container {
      min-height: 100vh;
      background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%);
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
