import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CarteraClasesService } from '../../services/cartera-clases.service';
import { CarteraClase } from '../../models/cartera-clases';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-cartera-info',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './cartera-info.component.html',
  styleUrls: ['./cartera-info.component.css']
})
export class CarteraInfoComponent implements OnInit, OnDestroy {
  carteraClases: CarteraClase[] = [];
  resumenClases = {
    matFuncional: 0,
    reformer: 0,
    matPersonalizada: 0,
    reformerPersonalizada: 0
  };
  loading = true;
  error = '';
  private subscription?: Subscription;

  constructor(private carteraService: CarteraClasesService) {}

  // expose mobile detection for template-level conditional text
  get isMobile(): boolean {
    try { return typeof window !== 'undefined' && window.innerWidth < 992; } catch { return false; }
  }

  ngOnInit() {
    this.cargarCartera();
  }

  ngOnDestroy() {
    if (this.subscription) {
      this.subscription.unsubscribe();
    }
  }

  cargarCartera() {
    this.loading = true;
    this.error = '';

    this.subscription = this.carteraService.getCarteraUsuarioActual().subscribe({
      next: (cartera) => {
        this.carteraClases = cartera.filter(c => c.status !== 'inactive');
        this.calcularResumen();
        this.loading = false;
      },
      error: (err) => {
        console.error('Error al cargar cartera:', err);
        this.error = 'Error al cargar tu cartera de clases';
        this.loading = false;
      }
    });
  }

  private calcularResumen() {
    this.resumenClases = {
      matFuncional: 0,
      reformer: 0,
      matPersonalizada: 0,
      reformerPersonalizada: 0
    };

    this.carteraClases.forEach(entrada => {
      if (entrada.bono_type === 'MAT-FUNCIONAL') {
        if (entrada.bono_subtype === 'CLASE-PERSONALIZADA') {
          this.resumenClases.matPersonalizada += entrada.clases_disponibles;
        } else {
          this.resumenClases.matFuncional += entrada.clases_disponibles;
        }
      } else if (entrada.bono_type === 'REFORMER') {
        if (entrada.bono_subtype === 'CLASE-PERSONALIZADA') {
          this.resumenClases.reformerPersonalizada += entrada.clases_disponibles;
        } else {
          this.resumenClases.reformer += entrada.clases_disponibles;
        }
      }
    });
  }

  getTotalClases(): number {
    return this.resumenClases.matFuncional + 
           this.resumenClases.reformer + 
           this.resumenClases.matPersonalizada + 
           this.resumenClases.reformerPersonalizada;
  }

  formatearFecha(fecha: string): string {
    return new Date(fecha).toLocaleDateString('es-ES', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  }

  getProgressPercentage(entrada: CarteraClase): number {
    if (entrada.clases_totales === 0) return 0;
    return Math.round((entrada.clases_disponibles / entrada.clases_totales) * 100);
  }

  getProgressColor(porcentaje: number): string {
    if (porcentaje > 50) return 'success';
    if (porcentaje > 20) return 'warning';
    return 'danger';
  }
}