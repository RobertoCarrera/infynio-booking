import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
<<<<<<< HEAD
import { Component, OnInit, OnDestroy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { PackagesService } from '../../services/packages.service';
import { SupabaseService } from '../../services/supabase.service';
import { Subscription } from 'rxjs';

interface ClassesSummary {
  matFuncional: {
    total: number;
    monthly: number;
    rollover: number;
  };
  reformer: {
    total: number;
    monthly: number;
    rollover: number;
  };
}
=======
import { RouterModule } from '@angular/router';
import { CarteraClasesService } from '../../services/cartera-clases.service';
import { CarteraClase } from '../../models/cartera-clases';
import { Subscription } from 'rxjs';
>>>>>>> fix-backend

@Component({
  selector: 'app-cartera-info',
  standalone: true,
<<<<<<< HEAD
  imports: [FormsModule, CommonModule],
=======
  imports: [CommonModule, RouterModule],
>>>>>>> fix-backend
  templateUrl: './cartera-info.component.html',
  styleUrls: ['./cartera-info.component.css']
})
export class CarteraInfoComponent implements OnInit, OnDestroy {
<<<<<<< HEAD
  classesSummary: ClassesSummary = {
    matFuncional: { total: 0, monthly: 0, rollover: 0 },
    reformer: { total: 0, monthly: 0, rollover: 0 }
  };
  
  isLoading = true;
  private subscriptions: Subscription[] = [];

  constructor(
    private packagesService: PackagesService,
    private supabaseService: SupabaseService
  ) { }

  async ngOnInit() {
    await this.loadUserClasses();
    
    // Suscribirse a cambios en user_packages para actualizaciones en tiempo real
    this.setupRealtimeSubscription();
  }

  ngOnDestroy() {
    this.subscriptions.forEach(sub => sub.unsubscribe());
    // Limpiar suscripciones de Supabase Realtime
    this.supabaseService.supabase.removeAllChannels();
  }

  private async loadUserClasses() {
    try {
      this.isLoading = true;
      
      this.supabaseService.getCurrentUser().subscribe(async (authUser) => {
        if (authUser) {
          // Obtener el user id de la tabla users usando el auth_user_id
          const { data: userData } = await this.supabaseService.supabase
            .from('users')
            .select('id')
            .eq('auth_user_id', authUser.id)
            .single();

          if (userData) {
            const summary = await this.packagesService.getUserClassesSummary(userData.id);
            this.classesSummary = summary;
          }
        }
        this.isLoading = false;
      });
    } catch (error) {
      console.error('Error loading user classes:', error);
      this.isLoading = false;
    }
  }

  private setupRealtimeSubscription() {
    // Escuchar cambios en la tabla user_packages
    const subscription = this.supabaseService.supabase
      .channel('user_packages_changes')
      .on('postgres_changes', { 
        event: '*', 
        schema: 'public', 
        table: 'user_packages' 
      }, () => {
        // Recargar los datos cuando hay cambios
        this.loadUserClasses();
      })
      .subscribe();

    // No necesitamos guardar la suscripción en el array, solo unsubscribe en ngOnDestroy
  }

  hasAnyClasses(): boolean {
    return this.classesSummary.matFuncional.total > 0 || this.classesSummary.reformer.total > 0;
=======
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
        this.carteraClases = cartera;
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
>>>>>>> fix-backend
  }
}