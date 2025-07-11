import { Component, OnInit, Inject, PLATFORM_ID } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-reset-password',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  template: `
    <div class="container mt-5">
      <div class="row justify-content-center">
        <div class="col-md-6">
          <div class="card">
            <div class="card-header">Restablecer contraseña</div>
            <div class="card-body">
              <div *ngIf="processingAuth" class="text-center mb-4">
                <div class="spinner-border" role="status">
                  <span class="visually-hidden">Cargando...</span>
                </div>
                <p class="mt-2">Verificando tu sesión...</p>
              </div>
              
              <div *ngIf="statusMessage" class="alert" [ngClass]="statusMessageType">
                {{ statusMessage }}
              </div>
              
              <form *ngIf="showForm" [formGroup]="resetForm" (ngSubmit)="onSubmit()">
                <div class="form-group mb-3">
                  <label for="password">Nueva contraseña</label>
                  <input type="password" id="password" class="form-control" formControlName="password">
                  <div *ngIf="resetForm.get('password')?.invalid && resetForm.get('password')?.touched" class="text-danger">
                    La contraseña debe tener al menos 6 caracteres
                  </div>
                </div>
                
                <div class="form-group mb-3">
                  <label for="confirmPassword">Confirmar contraseña</label>
                  <input type="password" id="confirmPassword" class="form-control" formControlName="confirmPassword">
                  <div *ngIf="passwordMismatch" class="text-danger">
                    Las contraseñas no coinciden
                  </div>
                </div>
                
                <button type="submit" class="btn btn-primary w-100" [disabled]="resetForm.invalid || submitting">
                  {{ submitting ? 'Actualizando...' : 'Guardar nueva contraseña' }}
                </button>
              </form>

              <div *ngIf="debugMode && isBrowser" class="mt-4 p-3 bg-light rounded">
                <h6>Información de depuración</h6>
                <p><strong>URL:</strong> {{ currentUrl }}</p>
                <p><strong>Hash:</strong> {{ currentHash || 'No hay hash' }}</p>
                <p><strong>Access Token:</strong> {{ accessTokenFound ? 'Encontrado' : 'No encontrado' }}</p>
                <p><strong>Token en Params:</strong> {{ tokenInParams ? 'Encontrado' : 'No encontrado' }}</p>
                <p><strong>Tipo:</strong> {{ tokenType || 'Desconocido' }}</p>
                <button class="btn btn-sm btn-secondary" (click)="debugMode = false">Ocultar</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `
})
export class ResetPasswordComponent implements OnInit {
  resetForm: FormGroup;
  processingAuth = true;
  showForm = false;
  submitting = false;
  statusMessage = '';
  statusMessageType = 'alert-info';
  passwordMismatch = false;
  isBrowser: boolean;
  debugMode = true;
  currentUrl = '';
  currentHash = '';
  accessTokenFound = false;
  tokenInParams = false;
  tokenType = '';
  
  constructor(
    private fb: FormBuilder,
    private route: ActivatedRoute,
    private router: Router,
    private authService: AuthService,
    @Inject(PLATFORM_ID) private platformId: Object
  ) {
    console.log('ResetPasswordComponent inicializado');
    this.isBrowser = isPlatformBrowser(this.platformId);
    
    this.resetForm = this.fb.group({
      password: ['', [Validators.required, Validators.minLength(6)]],
      confirmPassword: ['', Validators.required]
    });
  }

  ngOnInit() {
    console.log('ResetPasswordComponent - ngOnInit');
    
    // Solo ejecutar código relacionado con el navegador si estamos en el navegador
    if (this.isBrowser) {
      this.currentUrl = window.location.href;
      this.currentHash = window.location.hash;
      console.log('URL actual:', this.currentUrl);
      console.log('Hash:', this.currentHash);
      
      // Examinar el hash para tokens (Supabase a veces pone tokens aquí)
      if (this.currentHash) {
        const hashParams = new URLSearchParams(this.currentHash.substring(1));
        const accessToken = hashParams.get('access_token');
        const refreshToken = hashParams.get('refresh_token');
        const type = hashParams.get('type');
        
        if (accessToken) {
          console.log('Token encontrado en hash!');
          this.accessTokenFound = true;
          this.tokenType = type || '';
          
          // Intentar establecer la sesión con el token del hash
          this.authService.setSession(accessToken, refreshToken || '').subscribe({
            next: (result) => {
              console.log('Sesión establecida desde hash:', result);
              this.processingAuth = false;
              
              if (result.data?.session) {
                this.showForm = true;
                this.statusMessage = 'Sesión autenticada. Puedes cambiar tu contraseña.';
                this.statusMessageType = 'alert-success';
              } else {
                this.statusMessage = 'No se pudo autenticar con el token proporcionado.';
                this.statusMessageType = 'alert-warning';
              }
            },
            error: (err) => {
              console.error('Error al establecer sesión con hash:', err);
              this.processingAuth = false;
              this.statusMessage = 'Error al procesar el token. Por favor solicita un nuevo enlace.';
              this.statusMessageType = 'alert-danger';
            }
          });
          
          return; // Terminamos aquí si encontramos tokens en el hash
        }
      }
      
      // Capturar parámetros de la URL de query
      this.route.queryParams.subscribe(params => {
        console.log('Query params recibidos:', params);
        
        // Verificar si hay un error
        if (params['error']) {
          this.statusMessage = `Error: ${params['error_description'] || params['error']}`;
          this.statusMessageType = 'alert-danger';
          this.processingAuth = false;
          return;
        }
        
        // Verificar si tenemos un token en los parámetros
        if (params['token'] || params['access_token']) {
          console.log('Token detectado en parámetros de URL');
          this.tokenInParams = true;
          this.tokenType = params['type'] || '';
          
          // Si hay access_token en los parámetros, intenta establecer la sesión
          if (params['access_token']) {
            this.authService.setSession(params['access_token'], params['refresh_token'] || '').subscribe({
              next: (result) => {
                console.log('Sesión establecida desde params:', result);
                this.processingAuth = false;
                
                if (result.data?.session) {
                  this.showForm = true;
                  this.statusMessage = 'Sesión autenticada. Puedes cambiar tu contraseña.';
                  this.statusMessageType = 'alert-success';
                } else {
                  this.statusMessage = 'No se pudo autenticar con el token proporcionado.';
                  this.statusMessageType = 'alert-warning';
                }
              },
              error: (err) => {
                console.error('Error al establecer sesión con params:', err);
                this.processingAuth = false;
                this.statusMessage = 'Error al procesar el token. Por favor solicita un nuevo enlace.';
                this.statusMessageType = 'alert-danger';
              }
            });
            
            return;
          }
          
          // Si hay un token pero no access_token, verifica la sesión actual
          this.authService.checkSessionStatus().subscribe({
            next: (session) => {
              console.log('Estado de sesión:', session ? 'Activa' : 'No hay sesión');
              this.processingAuth = false;
              
              if (session) {
                // Si hay una sesión activa, mostrar el formulario
                this.showForm = true;
                this.statusMessage = 'Puedes cambiar tu contraseña ahora';
                this.statusMessageType = 'alert-success';
              } else {
                // No hay sesión, puede ser un problema con el token
                this.statusMessage = 'No se pudo verificar tu sesión. El enlace puede haber expirado.';
                this.statusMessageType = 'alert-warning';
              }
            },
            error: (err) => {
              console.error('Error al verificar sesión:', err);
              this.processingAuth = false;
              this.statusMessage = 'Error al verificar tu sesión. Por favor solicita un nuevo enlace.';
              this.statusMessageType = 'alert-danger';
            }
          });
        } else {
          // No hay token ni error, posiblemente acceso directo a la ruta
          this.processingAuth = false;
          this.statusMessage = 'No se encontró un token válido. Por favor solicita un enlace de recuperación.';
          this.statusMessageType = 'alert-warning';
        }
      });
      
      // Validar contraseñas coincidentes
      this.resetForm.valueChanges.subscribe(() => {
        if (this.resetForm.get('confirmPassword')?.value) {
          this.passwordMismatch = 
            this.resetForm.get('password')?.value !== 
            this.resetForm.get('confirmPassword')?.value;
        }
      });
    } else {
      // En el servidor, establecer valores por defecto
      this.processingAuth = false;
      this.statusMessage = 'Cargando...';
      this.statusMessageType = 'alert-info';
    }
  }

  onSubmit() {
    if (this.resetForm.invalid) return;
    
    if (this.resetForm.value.password !== this.resetForm.value.confirmPassword) {
      this.passwordMismatch = true;
      return;
    }
    
    this.submitting = true;
    
    this.authService.updatePassword(this.resetForm.value.password).subscribe({
      next: () => {
        this.submitting = false;
        this.statusMessage = 'Contraseña actualizada con éxito! Redireccionando...';
        this.statusMessageType = 'alert-success';
        this.showForm = false;
        
        if (this.isBrowser) {
          setTimeout(() => {
            this.router.navigate(['/login']);
          }, 3000);
        }
      },
      error: (err) => {
        this.submitting = false;
        console.error('Error al actualizar contraseña:', err);
        this.statusMessage = err.message || 'Error al actualizar la contraseña';
        this.statusMessageType = 'alert-danger';
      }
    });
  }
}