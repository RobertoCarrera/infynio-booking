import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { CarteraClasesService } from '../../services/cartera-clases.service';
import { UsersService } from '../../services/users.service';
import { CarteraClase, Package, CreateUserPackage, UpdateUserPackage } from '../../models/cartera-clases';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-admin-cartera',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, RouterModule],
  templateUrl: './admin-cartera.component.html',
  styleUrls: ['./admin-cartera.component.css']
})
export class AdminCarteraComponent implements OnInit, OnDestroy {
  usuarios: any[] = [];
  usuarioSeleccionado: any = null;
  carteraUsuario: CarteraClase[] = [];
  packagesDisponibles: Package[] = [];
  
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
      bono_type: ['', Validators.required],
      bono_subtype: ['', Validators.required],
      clases_totales: [1, [Validators.required, Validators.min(1)]]
    });

    this.modificarForm = this.fb.group({
      clases_disponibles: [0, [Validators.required, Validators.min(0)]]
    });
  }

  ngOnInit() {
    this.cargarUsuarios();
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

  onTipoBonoChange() {
    const tipoSeleccionado = this.agregarForm.get('bono_type')?.value;
    const bono = this.tiposBonos.find((b: any) => b.type === tipoSeleccionado);
    
    if (bono) {
      this.agregarForm.patchValue({
        bono_subtype: bono.subtype,
        clases_totales: bono.clases
      });
    }
  }

  agregarBono() {
    if (this.agregarForm.invalid) {
      this.error = 'Por favor completa todos los campos requeridos';
      return;
    }

    const formData = this.agregarForm.value;
    const tipoBonoIndex = this.tiposBonos.findIndex((bono: any) => 
      bono.type === formData.bono_type && 
      bono.subtype === formData.bono_subtype &&
      bono.clases === formData.clases_totales
    );

    if (tipoBonoIndex === -1) {
      this.error = 'Tipo de bono no válido';
      return;
    }

    this.loading = true;

    const sub = this.carteraService.agregarClases(
      formData.usuario_id,
      tipoBonoIndex
    ).subscribe({
      next: () => {
        this.successMessage = 'Bono agregado exitosamente';
        this.cargarCarteraUsuario(formData.usuario_id);
        this.cerrarModalAgregar();
        this.loading = false;
        setTimeout(() => this.successMessage = '', 3000);
      },
      error: (err: any) => {
        console.error('Error al agregar bono:', err);
        this.error = 'Error al agregar el bono';
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
      clases_disponibles: entrada.clases_disponibles
    });
  }

  cerrarModalModificar() {
    this.showModificarModal = false;
    this.entradaParaModificar = null;
    this.modificarForm.reset();
  }

  modificarBono() {
    if (this.modificarForm.invalid || !this.entradaParaModificar) {
      this.error = 'Datos inválidos para modificar';
      return;
    }

    const formData = this.modificarForm.value;
    this.loading = true;

    const sub = this.carteraService.modificarClases(
      this.entradaParaModificar.id!,
      formData.clases_disponibles
    ).subscribe({
      next: () => {
        this.successMessage = 'Bono modificado exitosamente';
        this.cargarCarteraUsuario(this.entradaParaModificar!.user_id);
        this.cerrarModalModificar();
        this.loading = false;
        setTimeout(() => this.successMessage = '', 3000);
      },
      error: (err: any) => {
        console.error('Error al modificar bono:', err);
        this.error = 'Error al modificar el bono';
        this.loading = false;
      }
    });

    this.subscriptions.push(sub);
  }

  eliminarBono(entrada: CarteraClase) {
    if (!confirm('¿Estás seguro de que quieres desactivar este bono?')) {
      return;
    }

    this.loading = true;

    const sub = this.carteraService.desactivarCartera(entrada.id!).subscribe({
      next: () => {
        this.successMessage = 'Bono desactivado exitosamente';
        this.cargarCarteraUsuario(entrada.user_id);
        this.loading = false;
        setTimeout(() => this.successMessage = '', 3000);
      },
      error: (err: any) => {
        console.error('Error al desactivar bono:', err);
        this.error = 'Error al desactivar el bono';
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

  clearMessages() {
    this.error = '';
    this.successMessage = '';
  }
}
