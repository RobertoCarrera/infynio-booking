import { CommonModule } from '@angular/common';
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

@Component({
  selector: 'app-cartera-info',
  standalone: true,
  imports: [FormsModule, CommonModule],
  templateUrl: './cartera-info.component.html',
  styleUrls: ['./cartera-info.component.css']
})
export class CarteraInfoComponent implements OnInit, OnDestroy {
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
  }
}