import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { CarteraClasesService } from '../../services/cartera-clases.service';
import { PackagesService } from '../../services/packages.service';
import { UsersService } from '../../services/users.service';
import { CarteraClase, Package, CreateUserPackage, UpdateUserPackage } from '../../models/cartera-clases';
import { AdminPackageClassesComponent } from './admin-package-classes.component';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-admin-cartera',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, AdminPackageClassesComponent],
  templateUrl: './admin-cartera.component.html',
  styleUrls: ['./admin-cartera.component.css']
})
export class AdminCarteraComponent implements OnInit, OnDestroy {
  usuarios: any[] = [];
  usuarioSeleccionado: any = null;
  carteraUsuario: CarteraClase[] = [];
  packagesDisponibles: Package[] = [];
  filterText: string = '';
  private searchTimer: any = null;
  readonly PAGE_SIZE = 40; // public for template condition
  lastPageCount = 0;
  
  // Forms
  agregarForm: FormGroup;
  modificarForm: FormGroup;
  
  // UI States
  loading = false;
  loadingCartera = false;
  error = '';
  successMessage = '';
  
  // Modal states
  showAgregarModal = false;
  showModificarModal = false;
  entradaParaModificar: CarteraClase | null = null;
  
  private subscriptions: Subscription[] = [];
  // Selected package id to show classes in the new column
  selectedPackageId: number | null = null;

  constructor(
    private carteraService: CarteraClasesService,
    private usersService: UsersService,
  private fb: FormBuilder,
  private packagesService: PackagesService
  ) {
    this.agregarForm = this.fb.group({
      usuario_id: ['', Validators.required],
      package_id: ['', Validators.required],
      expiration_date: ['', Validators.required]
    });

    this.modificarForm = this.fb.group({
      current_classes_remaining: [0, [Validators.required, Validators.min(0)]],
      classes_used_this_month: [0, [Validators.min(0)]],
      status: ['active', Validators.required]
    });
  }

  // El backend ya aplica el filtro de onboarding, así que devolvemos el array tal cual.
  get filteredUsuarios(): any[] { return this.usuarios; }

  ngOnInit() {
    this.buscarUsuarios(true);
    this.cargarPackages();
  }

  ngOnDestroy() {
    this.subscriptions.forEach(sub => sub.unsubscribe());
  }

  private buscarUsuarios(reset = false) {
    if (reset) {
      this.usuarios = [];
      this.lastPageCount = 0;
    }
    this.loading = true;
    const term = this.filterText.trim();
    const offset = reset ? 0 : this.usuarios.length;
    const sub = this.usersService.searchOnboarded(term, this.PAGE_SIZE, offset).subscribe({
      next: rows => {
        if (reset) {
          this.usuarios = rows;
        } else {
          this.usuarios = [...this.usuarios, ...rows];
        }
        this.lastPageCount = rows.length;
        this.loading = false;
      },
      error: err => {
        console.error('Error buscando usuarios:', err);
        this.error = 'Error al buscar usuarios';
        this.loading = false;
      }
    });
    this.subscriptions.push(sub);
  }

  onFilterChange(value: string) {
    this.filterText = value;
    if (this.searchTimer) clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => this.buscarUsuarios(true), 300);
  }

  cargarMasUsuarios() {
    if (this.loading) return;
    if (this.lastPageCount < this.PAGE_SIZE) return; // no more pages
    this.buscarUsuarios(false);
  }

  cargarPackages() {
    const sub = this.carteraService.getPackages().subscribe({
      next: (packages: Package[]) => {
        this.packagesDisponibles = packages;
      },
      error: (err: any) => {
        console.error('Error al cargar packages:', err);
        this.error = 'Error al cargar los packages disponibles';
      }
    });

    this.subscriptions.push(sub);
  }

  seleccionarUsuario(usuario: any) {
    this.usuarioSeleccionado = usuario;
    this.cargarCarteraUsuario(usuario.id);
    this.agregarForm.patchValue({ usuario_id: usuario.id });
    // reset selected package when switching user
    this.selectedPackageId = null;
  }

  abrirDetalleBono(entrada: CarteraClase) {
    this.selectedPackageId = entrada?.id ?? null;
  }

  cargarCarteraUsuario(userId: number) {
    this.loadingCartera = true;
    this.error = '';

    const sub = this.carteraService.getCarteraByUserId(userId).subscribe({
      next: (cartera: any[]) => {
        this.carteraUsuario = cartera;
        this.loadingCartera = false;
      },
      error: (err: any) => {
        console.error('Error al cargar cartera:', err);
        this.error = 'Error al cargar la cartera del usuario';
        this.loadingCartera = false;
      }
    });

    this.subscriptions.push(sub);
  }

  // Métodos para el modal de agregar
  abrirModalAgregar() {
    if (!this.usuarioSeleccionado) {
      this.error = 'Selecciona un usuario primero';
      return;
    }
  this.showAgregarModal = true;
  this.agregarForm.reset();
  // Prefijar usuario y una caducidad por defecto (último día del mes siguiente)
  const today = new Date();
  const nextMonth = new Date(today.getFullYear(), today.getMonth() + 2, 0); // día 0 del mes+2 = último día del mes siguiente
  const defaultExp = nextMonth.toISOString().split('T')[0];
  this.agregarForm.patchValue({ usuario_id: this.usuarioSeleccionado.id, expiration_date: defaultExp });
  }

  cerrarModalAgregar() {
    this.showAgregarModal = false;
    this.agregarForm.reset();
  }

  agregarPackage() {
    if (this.agregarForm.invalid) {
      this.error = 'Por favor completa todos los campos requeridos';
      return;
    }

    const formData = this.agregarForm.value;
    this.loading = true;

    const createData: CreateUserPackage = {
      user_id: formData.usuario_id,
      package_id: formData.package_id,
      expiration_date: formData.expiration_date
    };

    const sub = this.carteraService.agregarPackageAUsuario(createData).subscribe({
      next: () => {
        this.successMessage = 'Package agregado exitosamente';
        this.cargarCarteraUsuario(formData.usuario_id);
        this.cerrarModalAgregar();
        this.loading = false;
        setTimeout(() => this.successMessage = '', 3000);
      },
      error: (err: any) => {
        console.error('Error al agregar package:', err);
        this.error = 'Error al agregar el package';
        this.loading = false;
      }
    });

    this.subscriptions.push(sub);
  }

  // Métodos para el modal de modificar
  abrirModalModificar(entrada: CarteraClase) {
    this.entradaParaModificar = entrada;
    this.showModificarModal = true;
    this.modificarForm.patchValue({
      current_classes_remaining: entrada.clases_disponibles,
      classes_used_this_month: entrada.classes_used_this_month,
      status: entrada.status
    });
  }

  cerrarModalModificar() {
    this.showModificarModal = false;
    this.entradaParaModificar = null;
    this.modificarForm.reset();
  }

  modificarPackage() {
    if (this.modificarForm.invalid || !this.entradaParaModificar) {
      this.error = 'Datos inválidos para modificar';
      return;
    }

    const formData = this.modificarForm.value;
    this.loading = true;

    const updateData: UpdateUserPackage = {
      current_classes_remaining: formData.current_classes_remaining,
      classes_used_this_month: formData.classes_used_this_month,
      status: formData.status
    };

    const sub = this.carteraService.modificarUserPackage(this.entradaParaModificar.id, updateData).subscribe({
      next: () => {
        this.successMessage = 'Package modificado exitosamente';
        this.cargarCarteraUsuario(this.entradaParaModificar!.user_id);
        this.cerrarModalModificar();
        this.loading = false;
        setTimeout(() => this.successMessage = '', 3000);
      },
      error: (err: any) => {
        console.error('Error al modificar package:', err);
        this.error = 'Error al modificar el package';
        this.loading = false;
      }
    });

    this.subscriptions.push(sub);
  }

  eliminarPackage(entrada: CarteraClase) {
  if (!confirm('Confirmar: ELIMINAR este bono si no tiene reservas asociadas. Si existen bookings asociados, la operación fallará.')) {
      return;
    }

    this.loading = true;

    (async () => {
      try {
        const res = await this.packagesService.adminDeleteUserPackage(entrada.id);
        if (res?.success === true || String(res?.success) === 't' || String(res?.success) === 'true') {
          this.successMessage = res.message || 'Bono eliminado correctamente';
        } else {
          // Show RPC-level error (e.g., active bookings using this package)
          this.error = res?.error || res?.message || 'No se pudo eliminar el bono';
        }
      } catch (err: any) {
        console.error('Error al eliminar package:', err);
        this.error = 'Error al eliminar el package';
      } finally {
        this.cargarCarteraUsuario(entrada.user_id);
        this.loading = false;
        setTimeout(() => { this.successMessage = ''; this.error = ''; }, 3000);
      }
    })();
  }

  // Métodos de utilidad
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

  /**
   * Devuelve un color en formato rgb() que va de rojo (en los extremos)
   * a naranja en el 50% para representar visualmente la cantidad restante.
   * - 50% => naranja (#ff8800)
   * - 0%  => rojo (#ff0000)
   * - 100% => rojo (#ff0000)
   */
  getProgressColorHex(porcentaje: number): string {
    // Queremos: 0% -> rojo, 50% -> naranja, 100% -> verde
    const clamp = (v: number, a = 0, b = 255) => Math.max(a, Math.min(b, Math.round(v)));

    if (porcentaje <= 50) {
      // interpolate red (255,0,0) -> orange (255,136,0)
      const t = porcentaje / 50; // 0..1
      const r = 255;
      const g = clamp(0 + (136 - 0) * t);
      const b = 0;
      return `rgb(${r}, ${g}, ${b})`;
    } else {
      // interpolate orange (255,136,0) -> green (0,160,0)
      const t = (porcentaje - 50) / 50; // 0..1
      const r = clamp(255 + (0 - 255) * t);
      const g = clamp(136 + (160 - 136) * t);
      const b = 0;
      return `rgb(${r}, ${g}, ${b})`;
    }
  }

  /** Devuelve los días restantes hasta `fecha_expiracion`. Devuelve null si no hay fecha */
  computeDaysUntilExpiration(entrada: CarteraClase): number | null {
    if (!entrada.fecha_expiracion) return null;
    const today = new Date();
    const exp = new Date(entrada.fecha_expiracion);
    // Normalizar horas para evitar sesgos por zona horaria
    const diffMs = exp.setHours(0,0,0,0) - today.setHours(0,0,0,0);
    return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  }

  /** Color para la columna de expiración basada en días restantes
   * >=12 => verde, 8..11 => naranja, <8 => rojo
   */
  getExpirationColorHex(days: number | null): string {
    if (days === null) return 'rgba(0,0,0,0.5)';
    if (days >= 12) return '#28a745';
    if (days >= 8) return '#ff8800';
    return '#dc3545';
  }

  /** Devuelve un texto legible para la expiración: 'X días restantes', 'Expirado' o 'Sin fecha' */
  getExpirationText(entrada: CarteraClase): string {
    const days = this.computeDaysUntilExpiration(entrada);
    if (days === null) return 'Sin fecha';
    if (days < 0) return 'Expirado';
    return `${days}`;
  }
  /** Devuelve color basado directamente en la entrada (evita null checks en la plantilla) */
  getExpirationColorFromEntrada(entrada: CarteraClase): string {
    const days = this.computeDaysUntilExpiration(entrada);
    return this.getExpirationColorHex(days);
  }

  getPackageName(packageId: number): string {
    const package_ = this.packagesDisponibles.find(p => p.id === packageId);
    return package_?.name || 'Package desconocido';
  }

  getPackagesByType(classType: 'MAT_FUNCIONAL' | 'REFORMER'): Package[] {
    const typeIdMap = {
      MAT_FUNCIONAL: 2,
      REFORMER: 3
    };
    return this.packagesDisponibles.filter(p => p.class_type === typeIdMap[classType]);
  }

  getRolloverStatus(entrada: CarteraClase): string {
  if (!entrada.expires_at) return 'Sin fecha de rollover';

  const today = new Date();
  const rolloverDate = new Date(entrada.expires_at as string);
    const daysLeft = Math.ceil((rolloverDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    
    if (daysLeft > 0) {
      return `${daysLeft} días hasta rollover`;
    } else if (daysLeft === 0) {
      return 'Rollover hoy';
    } else {
      return 'Rollover vencido';
    }
  }

  clearMessages() {
    this.error = '';
    this.successMessage = '';
  }
}
