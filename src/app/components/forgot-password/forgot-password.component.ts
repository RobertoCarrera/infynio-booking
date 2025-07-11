import { Component, Inject, PLATFORM_ID } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { AuthService } from '../../services/auth.service';
import { RouterModule } from '@angular/router';

@Component({
  selector: 'app-forgot-password',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterModule],
  template: `
    <div class="container mt-5">
      <div class="row justify-content-center">
        <div class="col-md-6">
          <div class="card">
            <div class="card-header">Recuperar contraseña</div>
            <div class="card-body">
              <div *ngIf="emailSent" class="alert alert-success">
                <p>Hemos enviado instrucciones para restablecer tu contraseña a:</p>
                <p><strong>{{ forgotForm.value.email }}</strong></p>
                <p>Revisa tu bandeja de entrada (y la carpeta de spam) y sigue las instrucciones.</p>
              </div>
              
              <form *ngIf="!emailSent" [formGroup]="forgotForm" (ngSubmit)="onSubmit()">
                <div class="form-group mb-3">
                  <label for="email">Correo electrónico</label>
                  <input type="email" id="email" class="form-control" formControlName="email">
                  <div *ngIf="forgotForm.get('email')?.invalid && forgotForm.get('email')?.touched" class="text-danger">
                    Por favor, introduce un email válido
                  </div>
                </div>
                
                <div *ngIf="errorMessage" class="alert alert-danger">
                  {{ errorMessage }}
                </div>
                
                <button type="submit" class="btn btn-primary w-100" [disabled]="forgotForm.invalid || loading">
                  {{ loading ? 'Enviando...' : 'Enviar instrucciones' }}
                </button>
                
                <div class="mt-3 text-center">
                  <a routerLink="/login">Volver al inicio de sesión</a>
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  `
})
export class ForgotPasswordComponent {
  forgotForm: FormGroup;
  loading = false;
  errorMessage = '';
  emailSent = false;
  isBrowser: boolean;

  constructor(
    private fb: FormBuilder,
    private authService: AuthService,
    @Inject(PLATFORM_ID) private platformId: Object
  ) {
    this.isBrowser = isPlatformBrowser(this.platformId);
    console.log('ForgotPasswordComponent inicializado');
    
    this.forgotForm = this.fb.group({
      email: ['', [Validators.required, Validators.email]]
    });
  }

  onSubmit() {
    if (this.forgotForm.invalid) return;
    
    this.loading = true;
    this.errorMessage = '';
    
    // Solo en el navegador podemos hacer la redirección
    if (this.isBrowser) {
      const redirectUrl = `${window.location.origin}/reset-password`;
      this.authService.resetPassword(this.forgotForm.value.email, redirectUrl).subscribe({
            next: () => {
          this.loading = false;
          this.emailSent = true;
          console.log('Email de recuperación enviado correctamente');
        },
        error: (err) => {
          this.loading = false;
          console.error('Error al enviar email de recuperación:', err);
          this.errorMessage = err.message || 'Error al enviar el correo de recuperación';
        }
      });
    } else {
      // En el servidor simplemente mostramos un mensaje
      this.loading = false;
      this.emailSent = true;
      console.log('Simulando envío de email en el servidor');
    }
  }
}