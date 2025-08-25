import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PackagesService, Package, UserPackage } from '../../services/packages.service';
import { UsersService } from '../../services/users.service';
import { SupabaseService } from '../../services/supabase.service';

interface UserWithPackages {
  id: number;
  email: string;
  name: string;
  surname: string;
  packages: UserPackage[];
  matFuncionalTotal: number;
  reformerTotal: number;
}

@Component({
  selector: 'app-admin-user-packages',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="admin-packages-container">
      <div class="header">
        <h2>Gestión de Paquetes de Usuarios</h2>
        <p>Asigna y gestiona las clases disponibles para cada usuario</p>
      </div>

      <div class="search-section">
        <div class="search-input">
          <i class="fas fa-search"></i>
          <input 
            type="text" 
            placeholder="Buscar usuario por email o nombre..."
            [(ngModel)]="searchTerm"
            (input)="filterUsers()">
        </div>
      </div>

      <div class="users-grid" *ngIf="!isLoading">
        <div class="user-card" *ngFor="let user of filteredUsers">
          <div class="user-header">
            <div class="user-info">
              <h4>{{ user.name }} {{ user.surname }}</h4>
              <p>{{ user.email }}</p>
            </div>
          </div>

          <div class="packages-section">
            <!-- MAT FUNCIONAL -->
            <div class="package-type">
              <div class="package-type-header">
                <h5>MAT FUNCIONAL</h5>
                <span class="total-classes">{{ user.matFuncionalTotal }} clases</span>
              </div>
              <div class="package-controls">
                <button 
                  class="control-btn add-btn"
                  (click)="addClasses(user.id, 'MAT_FUNCIONAL', 1)">
                  <i class="fas fa-plus"></i>
                </button>
                <span class="classes-count">{{ user.matFuncionalTotal }}</span>
                <button 
                  class="control-btn remove-btn"
                  (click)="removeClasses(user.id, 'MAT_FUNCIONAL', 1)"
                  [disabled]="user.matFuncionalTotal <= 0">
                  <i class="fas fa-minus"></i>
                </button>
              </div>
              <div class="quick-actions">
                <button 
                  class="quick-btn"
                  (click)="addClasses(user.id, 'MAT_FUNCIONAL', 4)">
                  +4
                </button>
                <button 
                  class="quick-btn"
                  (click)="addClasses(user.id, 'MAT_FUNCIONAL', 8)">
                  +8
                </button>
                <button 
                  class="quick-btn"
                  (click)="addClasses(user.id, 'MAT_FUNCIONAL', 12)">
                  +12
                </button>
              </div>
            </div>

            <!-- REFORMER -->
            <div class="package-type">
              <div class="package-type-header">
                <h5>REFORMER</h5>
                <span class="total-classes">{{ user.reformerTotal }} clases</span>
              </div>
              <div class="package-controls">
                <button 
                  class="control-btn add-btn"
                  (click)="addClasses(user.id, 'REFORMER', 1)">
                  <i class="fas fa-plus"></i>
                </button>
                <span class="classes-count">{{ user.reformerTotal }}</span>
                <button 
                  class="control-btn remove-btn"
                  (click)="removeClasses(user.id, 'REFORMER', 1)"
                  [disabled]="user.reformerTotal <= 0">
                  <i class="fas fa-minus"></i>
                </button>
              </div>
              <div class="quick-actions">
                <button 
                  class="quick-btn"
                  (click)="addClasses(user.id, 'REFORMER', 4)">
                  +4
                </button>
                <button 
                  class="quick-btn"
                  (click)="addClasses(user.id, 'REFORMER', 8)">
                  +8
                </button>
                <button 
                  class="quick-btn"
                  (click)="addClasses(user.id, 'REFORMER', 12)">
                  +12
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="loading" *ngIf="isLoading">
        <div class="spinner-border" role="status">
          <span class="visually-hidden">Cargando...</span>
        </div>
        <p>Cargando usuarios...</p>
      </div>
    </div>
  `,
  styles: [`
    .admin-packages-container {
      max-width: 1400px;
      margin: 0 auto;
      padding: 20px;
    }

    .header {
      text-align: center;
      margin-bottom: 30px;
    }

    .header h2 {
      color: #333;
      margin-bottom: 10px;
    }

    .header p {
      color: #666;
      font-size: 1.1rem;
    }

    .search-section {
      margin-bottom: 30px;
      display: flex;
      justify-content: center;
    }

    .search-input {
      position: relative;
      max-width: 400px;
      width: 100%;
    }

    .search-input i {
      position: absolute;
      left: 15px;
      top: 50%;
      transform: translateY(-50%);
      color: #999;
    }

    .search-input input {
      width: 100%;
      padding: 12px 15px 12px 45px;
      border: 2px solid #e0e0e0;
      border-radius: 25px;
      font-size: 1rem;
      transition: border-color 0.3s ease;
    }

    .search-input input:focus {
      outline: none;
      border-color: #667eea;
    }

    .users-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
      gap: 20px;
    }

    .user-card {
      background: white;
      border-radius: 12px;
      padding: 20px;
      box-shadow: 0 4px 15px rgba(0,0,0,0.1);
      border: 1px solid #e0e0e0;
      transition: transform 0.3s ease, box-shadow 0.3s ease;
    }

    .user-card:hover {
      transform: translateY(-2px);
      box-shadow: 0 6px 25px rgba(0,0,0,0.15);
    }

    .user-header {
      margin-bottom: 20px;
      border-bottom: 1px solid #f0f0f0;
      padding-bottom: 15px;
    }

    .user-info h4 {
      margin: 0 0 5px 0;
      color: #333;
      font-weight: 600;
    }

    .user-info p {
      margin: 0;
      color: #666;
      font-size: 0.9rem;
    }

    .packages-section {
      display: flex;
      flex-direction: column;
      gap: 20px;
    }

    .package-type {
      border: 1px solid #e0e0e0;
      border-radius: 8px;
      padding: 15px;
      background: #fafafa;
    }

    .package-type-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 15px;
    }

    .package-type-header h5 {
      margin: 0;
      color: #333;
      font-weight: 600;
      font-size: 1rem;
    }

    .total-classes {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 4px 12px;
      border-radius: 15px;
      font-weight: 600;
      font-size: 0.85rem;
    }

    .package-controls {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 15px;
      margin-bottom: 15px;
    }

    .control-btn {
      width: 40px;
      height: 40px;
      border: none;
      border-radius: 50%;
      cursor: pointer;
      transition: all 0.3s ease;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 1.1rem;
    }

    .add-btn {
      background: linear-gradient(135deg, #28a745 0%, #20c997 100%);
      color: white;
    }

    .add-btn:hover {
      transform: scale(1.1);
      box-shadow: 0 4px 15px rgba(40, 167, 69, 0.4);
    }

    .remove-btn {
      background: linear-gradient(135deg, #dc3545 0%, #e74c3c 100%);
      color: white;
    }

    .remove-btn:hover:not(:disabled) {
      transform: scale(1.1);
      box-shadow: 0 4px 15px rgba(220, 53, 69, 0.4);
    }

    .remove-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .classes-count {
      font-size: 1.5rem;
      font-weight: 700;
      color: #333;
      min-width: 40px;
      text-align: center;
    }

    .quick-actions {
      display: flex;
      gap: 10px;
      justify-content: center;
    }

    .quick-btn {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      border: none;
      padding: 6px 12px;
      border-radius: 15px;
      cursor: pointer;
      font-weight: 600;
      font-size: 0.85rem;
      transition: all 0.3s ease;
    }

    .quick-btn:hover {
      transform: translateY(-2px);
      box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4);
    }

    .loading {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 60px;
      color: #666;
    }

    .loading .spinner-border {
      margin-bottom: 15px;
    }

    @media (max-width: 768px) {
      .users-grid {
        grid-template-columns: 1fr;
      }
      
      .package-controls {
        gap: 10px;
      }
      
      .control-btn {
        width: 35px;
        height: 35px;
      }
    }
  `]
})
export class AdminUserPackagesComponent implements OnInit {
  users: UserWithPackages[] = [];
  filteredUsers: UserWithPackages[] = [];
  searchTerm = '';
  isLoading = true;

  constructor(
    private packagesService: PackagesService,
    private usersService: UsersService,
    private supabaseService: SupabaseService
  ) {}

  async ngOnInit() {
    await this.loadUsersWithPackages();
  }

  private async loadUsersWithPackages() {
    try {
      this.isLoading = true;
      
      // Obtener todos los usuarios
      const users = await this.usersService.getAllUsers();
      
      // Para cada usuario, obtener sus paquetes
      const usersWithPackages: UserWithPackages[] = [];
      
      for (const user of users) {
        const packages = await this.packagesService.getUserActivePackages(user.id);
        const summary = await this.packagesService.getUserClassesSummary(user.id);
        
        usersWithPackages.push({
          id: user.id,
          email: user.email || '',
          name: user.name || '',
          surname: user.surname || '',
          packages,
          matFuncionalTotal: summary.matFuncional.total,
          reformerTotal: summary.reformer.total
        });
      }
      
      this.users = usersWithPackages;
      this.filteredUsers = [...this.users];
    } catch (error) {
      console.error('Error loading users with packages:', error);
    } finally {
      this.isLoading = false;
    }
  }

  filterUsers() {
    if (!this.searchTerm) {
      this.filteredUsers = [...this.users];
    } else {
      const term = this.searchTerm.toLowerCase();
      this.filteredUsers = this.users.filter(user => 
        user.email.toLowerCase().includes(term) ||
        user.name.toLowerCase().includes(term) ||
        user.surname.toLowerCase().includes(term)
      );
    }
  }

  async addClasses(userId: number, classType: 'MAT_FUNCIONAL' | 'REFORMER', amount: number) {
    try {
  // Default expiration: last day of next month (date-only)
  const base = new Date();
  const lastDayNextMonth = new Date(base.getFullYear(), base.getMonth() + 2, 0);
  const defaultExp = lastDayNextMonth.toISOString().split('T')[0];
  await this.packagesService.adminAddClasses(userId, classType, amount, defaultExp);
      await this.loadUsersWithPackages();
    } catch (error: any) {
      alert('Error al añadir clases: ' + error.message);
    }
  }

  async removeClasses(userId: number, classType: 'MAT_FUNCIONAL' | 'REFORMER', amount: number) {
    try {
      await this.packagesService.adminRemoveClasses(userId, classType, amount);
      await this.loadUsersWithPackages();
    } catch (error: any) {
      alert('Error al quitar clases: ' + error.message);
    }
  }
}
