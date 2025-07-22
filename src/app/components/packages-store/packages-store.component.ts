import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PackagesService, Package } from '../../services/packages.service';
import { SupabaseService } from '../../services/supabase.service';

@Component({
  selector: 'app-packages-store',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="packages-store">
      <div class="store-header">
        <h3>Comprar Packs de Clases</h3>
        <p>Elige el pack que mejor se adapte a tus necesidades</p>
      </div>

      <div class="packages-grid" *ngIf="!isLoading">
        <!-- MAT FUNCIONAL -->
        <div class="package-category">
          <h4 class="category-title">MAT FUNCIONAL</h4>
          <div class="packages-row">
            <div 
              *ngFor="let package of matFuncionalPackages" 
              class="package-card"
              [class.highlighted]="package.class_count === 8">
              <div class="package-header">
                <h5>{{ package.name }}</h5>
                <div class="package-price">{{ package.price }}€</div>
              </div>
              <div class="package-details">
                <div class="detail" *ngIf="!package.is_single_class">
                  <i class="fas fa-calendar-alt"></i>
                  <span>{{ package.class_count }} clases al mes</span>
                </div>
                <div class="detail" *ngIf="package.is_single_class">
                  <i class="fas fa-ticket-alt"></i>
                  <span>Clase individual</span>
                </div>
                <div class="detail" *ngIf="package.is_personal">
                  <i class="fas fa-user"></i>
                  <span>Clase personalizada</span>
                </div>
                <div class="detail" *ngIf="!package.is_single_class && !package.is_personal">
                  <i class="fas fa-users"></i>
                  <span>Clase grupal</span>
                </div>
              </div>
              <button 
                class="buy-btn"
                (click)="purchasePackage(package.id)"
                [disabled]="isPurchasing">
                <i class="fas fa-shopping-cart me-1"></i>
                {{ isPurchasing ? 'Comprando...' : 'Comprar' }}
              </button>
            </div>
          </div>
        </div>

        <!-- REFORMER -->
        <div class="package-category">
          <h4 class="category-title">REFORMER</h4>
          <div class="packages-row">
            <div 
              *ngFor="let package of reformerPackages" 
              class="package-card"
              [class.highlighted]="package.class_count === 8">
              <div class="package-header">
                <h5>{{ package.name }}</h5>
                <div class="package-price">{{ package.price }}€</div>
              </div>
              <div class="package-details">
                <div class="detail" *ngIf="!package.is_single_class">
                  <i class="fas fa-calendar-alt"></i>
                  <span>{{ package.class_count }} clases al mes</span>
                </div>
                <div class="detail" *ngIf="package.is_single_class">
                  <i class="fas fa-ticket-alt"></i>
                  <span>Clase individual</span>
                </div>
                <div class="detail" *ngIf="package.is_personal">
                  <i class="fas fa-user"></i>
                  <span>Clase personalizada</span>
                </div>
                <div class="detail" *ngIf="!package.is_single_class && !package.is_personal">
                  <i class="fas fa-users"></i>
                  <span>Clase grupal</span>
                </div>
              </div>
              <button 
                class="buy-btn"
                (click)="purchasePackage(package.id)"
                [disabled]="isPurchasing">
                <i class="fas fa-shopping-cart me-1"></i>
                {{ isPurchasing ? 'Comprando...' : 'Comprar' }}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div class="loading" *ngIf="isLoading">
        <div class="spinner-border" role="status">
          <span class="visually-hidden">Cargando paquetes...</span>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .packages-store {
      max-width: 1200px;
      margin: 0 auto;
      padding: 20px;
    }

    .store-header {
      text-align: center;
      margin-bottom: 40px;
    }

    .store-header h3 {
      color: #333;
      margin-bottom: 10px;
    }

    .store-header p {
      color: #666;
      font-size: 1.1rem;
    }

    .package-category {
      margin-bottom: 50px;
    }

    .category-title {
      text-align: center;
      font-size: 1.8rem;
      font-weight: 600;
      color: #444;
      margin-bottom: 30px;
      padding-bottom: 10px;
      border-bottom: 3px solid #667eea;
    }

    .packages-row {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: 20px;
      justify-items: center;
    }

    .package-card {
      background: white;
      border-radius: 16px;
      padding: 24px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.08);
      border: 2px solid transparent;
      transition: all 0.3s ease;
      width: 100%;
      max-width: 320px;
      position: relative;
    }

    .package-card:hover {
      transform: translateY(-5px);
      box-shadow: 0 8px 30px rgba(0,0,0,0.12);
      border-color: #667eea;
    }

    .package-card.highlighted {
      border-color: #667eea;
      background: linear-gradient(135deg, #f8f9ff 0%, #e8eeff 100%);
    }

    .package-card.highlighted::before {
      content: "Más Popular";
      position: absolute;
      top: -12px;
      left: 50%;
      transform: translateX(-50%);
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 6px 16px;
      border-radius: 20px;
      font-size: 0.8rem;
      font-weight: 600;
    }

    .package-header {
      text-align: center;
      margin-bottom: 20px;
    }

    .package-header h5 {
      font-size: 1.2rem;
      font-weight: 600;
      color: #333;
      margin-bottom: 10px;
    }

    .package-price {
      font-size: 2rem;
      font-weight: 700;
      color: #667eea;
    }

    .package-details {
      margin-bottom: 24px;
    }

    .detail {
      display: flex;
      align-items: center;
      margin-bottom: 12px;
      color: #555;
    }

    .detail i {
      width: 20px;
      margin-right: 12px;
      color: #667eea;
    }

    .buy-btn {
      width: 100%;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      border: none;
      padding: 12px 24px;
      border-radius: 8px;
      font-weight: 600;
      font-size: 1rem;
      cursor: pointer;
      transition: all 0.3s ease;
    }

    .buy-btn:hover:not(:disabled) {
      transform: translateY(-2px);
      box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4);
    }

    .buy-btn:disabled {
      opacity: 0.7;
      cursor: not-allowed;
    }

    .loading {
      display: flex;
      justify-content: center;
      align-items: center;
      padding: 60px;
    }

    @media (max-width: 768px) {
      .packages-row {
        grid-template-columns: 1fr;
        gap: 16px;
      }
      
      .package-card {
        max-width: 100%;
      }
    }
  `]
})
export class PackagesStoreComponent implements OnInit {
  packages: Package[] = [];
  matFuncionalPackages: Package[] = [];
  reformerPackages: Package[] = [];
  isLoading = true;
  isPurchasing = false;
  currentUserId: number | null = null;

  constructor(
    private packagesService: PackagesService,
    private supabaseService: SupabaseService
  ) {}

  async ngOnInit() {
    await this.loadCurrentUser();
    await this.loadPackages();
  }

  private async loadCurrentUser() {
    try {
      this.supabaseService.getCurrentUser().subscribe(async (authUser) => {
        if (authUser) {
          const { data: userData } = await this.supabaseService.supabase
            .from('users')
            .select('id')
            .eq('auth_user_id', authUser.id)
            .single();
          
          this.currentUserId = userData?.id ?? null;
        }
      });
    } catch (error) {
      console.error('Error loading current user:', error);
    }
  }

  private async loadPackages() {
    try {
      this.isLoading = true;
      this.packages = await this.packagesService.getAvailablePackages();
      
      this.matFuncionalPackages = this.packages.filter(p => p.class_type === 'MAT_FUNCIONAL');
      this.reformerPackages = this.packages.filter(p => p.class_type === 'REFORMER');
    } catch (error) {
      console.error('Error loading packages:', error);
    } finally {
      this.isLoading = false;
    }
  }

  async purchasePackage(packageId: number) {
    if (!this.currentUserId) {
      alert('Debes estar logueado para comprar un paquete');
      return;
    }

    if (this.isPurchasing) return;

    try {
      this.isPurchasing = true;
      
      // En un entorno real, aquí se integraría con Stripe o similar
      const confirmed = confirm('¿Estás seguro de que quieres comprar este paquete? En un entorno real esto requeriría pago.');
      
      if (confirmed) {
        await this.packagesService.purchasePackage(this.currentUserId, packageId);
        alert('¡Paquete comprado exitosamente! Ya puedes usar tus clases.');
      }
    } catch (error: any) {
      console.error('Error purchasing package:', error);
      alert('Error al comprar el paquete: ' + error.message);
    } finally {
      this.isPurchasing = false;
    }
  }
}
