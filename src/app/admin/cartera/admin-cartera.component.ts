import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { CarteraClasesService } from '../../services/cartera-clases.service';
import { UsersService } from '../../services/users.service';
import { CarteraClase, Package, CreateUserPackage, UpdateUserPackage } from '../../models/cartera-clases';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-admin-cartera',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule],
  templateUrl: './admin-cartera.component.html',
  styleUrls: ['./admin-cartera.component.css']
})
export class AdminCarteraComponent implements OnInit, OnDestroy {
  usuarios: any[] = [];
  usuarioSeleccionado: any = null;
  carteraUsuario: CarteraClase[] = [];
  packagesDisponibles: Package[] = [];
  filterText: string = '';
  
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

  constructor(
    private carteraService: CarteraClasesService,
    private usersService: UsersService,
    private fb: FormBuilder
  ) {
    this.agregarForm = this.fb.group({
      usuario_id: ['', Validators.required],
      package_id: ['', Validators.required],
      activation_date: ['']
    });

    this.modificarForm = this.fb.group({
      current_classes_remaining: [0, [Validators.required, Validators.min(0)]],
      rollover_classes_remaining: [0, [Validators.min(0)]],
      classes_used_this_month: [0, [Validators.min(0)]],
      status: ['active', Validators.required]
    });
  }

  get filteredUsuarios(): any[] {
    const text = this.filterText.trim().toLowerCase();
    if (!text) {
      return this.usuarios;
    }
    return this.usuarios.filter(usuario =>
      (usuario.full_name || '').toLowerCase().includes(text) ||
      (usuario.email || '').toLowerCase().includes(text) ||
      (usuario.name || '').toLowerCase().includes(text) ||
      (usuario.surname || '').toLowerCase().includes(text)
    );
  }

  ngOnInit() {
    this.cargarUsuarios();
    this.cargarPackages();
  }

  ngOnDestroy() {
    this.subscriptions.forEach(sub => sub.unsubscribe());
  }

  cargarUsuarios() {
    this.loading = true;
    this.error = '';

    const sub = this.usersService.getAll(1, 100).subscribe({
      next: (usuarios: any[]) => {
        this.usuarios = usuarios;
        this.loading = false;
      },
      error: (err: any) => {
        console.error('Error al cargar usuarios:', err);
        this.error = 'Error al cargar la lista de usuarios';
        this.loading = false;
      }
    });

    this.subscriptions.push(sub);
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
    this.agregarForm.patchValue({ usuario_id: this.usuarioSeleccionado.id });
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
      activation_date: formData.activation_date || undefined
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
      rollover_classes_remaining: entrada.rollover_classes_remaining,
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
      rollover_classes_remaining: formData.rollover_classes_remaining,
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
    if (!confirm('¿Estás seguro de que quieres desactivar este package?')) {
      return;
    }

    this.loading = true;

    const sub = this.carteraService.desactivarUserPackage(entrada.id).subscribe({
      next: () => {
        this.successMessage = 'Package desactivado exitosamente';
        this.cargarCarteraUsuario(entrada.user_id);
        this.loading = false;
        setTimeout(() => this.successMessage = '', 3000);
      },
      error: (err: any) => {
        console.error('Error al desactivar package:', err);
        this.error = 'Error al desactivar el package';
        this.loading = false;
      }
    });

    this.subscriptions.push(sub);
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
    if (!entrada.next_rollover_reset_date) return 'Sin fecha de rollover';
    
    const today = new Date();
    const rolloverDate = new Date(entrada.next_rollover_reset_date);
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
