import { Component, OnInit, Inject, PLATFORM_ID, OnDestroy } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { take } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import { DatabaseService } from '../../services/database.service';
import { SupabaseService } from '../../services/supabase.service';

@Component({
  selector: 'app-reset-password',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule],
  template: `
    <div class="container mt-5 responsive-container">
      <div class="row justify-content-center">
        <div class="col-md-6">
          <div class="card responsive-card">
            <div class="card-header">
              <h4 class="mb-0">{{ isNewUserInvite ? 'Crear tu contraseña' : 'Restablecer contraseña' }}</h4>
              <small class="text-muted" *ngIf="isNewUserInvite">
                Bienvenido! Crea tu contraseña para acceder al sistema.
              </small>
            </div>
            <div class="card-body responsive-card-body">
              <div *ngIf="processingAuth" class="text-center mb-4">
                <div class="spinner-border" role="status">
                  <span class="visually-hidden">Cargando...</span>
                </div>
                <p class="mt-2">Verificando tu sesión...</p>
              </div>
              
              <div *ngIf="statusMessage" class="alert" [ngClass]="statusMessageType">
                {{ statusMessage }}
                <div *ngIf="showRequestInviteCTA" class="mt-2">
                  <div class="input-group mb-2" *ngIf="!knownEmailForRequest">
                    <input type="email" class="form-control form-control-sm" [(ngModel)]="emailForRequest" placeholder="Tu email"/>
                  </div>
                  <button class="btn btn-outline-warning btn-sm" (click)="requestNewInvite()" [disabled]="requestingInvite">
                    {{ requestingInvite ? 'Enviando solicitud...' : 'Pedir un nuevo enlace de invitación' }}
                  </button>
                  <small class="text-muted d-block mt-1">Avisaremos al administrador para que te lo reenvíe.</small>
                </div>
              </div>
              
              <form *ngIf="showForm" [formGroup]="resetForm" (ngSubmit)="onSubmit()">
                <!-- Campos de información personal para nuevos usuarios -->
                <div *ngIf="isNewUserInvite" class="mb-4">
                  <h6 class="mb-3 text-muted">Información personal</h6>
                  
                  <div class="row">
                    <div class="col-md-6 mb-3">
                      <label for="name">Nombre *</label>
                      <input 
                        type="text" 
                        id="name" 
                        class="form-control" 
                        formControlName="name"
                        placeholder="Tu nombre">
                      <div *ngIf="resetForm.get('name')?.invalid && resetForm.get('name')?.touched" class="text-danger">
                        El nombre es requerido
                      </div>
                    </div>
                    
                    <div class="col-md-6 mb-3">
                      <label for="surname">Apellidos *</label>
                      <input 
                        type="text" 
                        id="surname" 
                        class="form-control" 
                        formControlName="surname"
                        placeholder="Tus apellidos">
                      <div *ngIf="resetForm.get('surname')?.invalid && resetForm.get('surname')?.touched" class="text-danger">
                        Los apellidos son requeridos
                      </div>
                    </div>
                  </div>
                  
                  <div class="mb-3">
                    <label for="phone">Teléfono *</label>
                    <input 
                      type="tel" 
                      id="phone" 
                      class="form-control" 
                      formControlName="phone"
                      placeholder="Tu número de teléfono">
                    <div *ngIf="resetForm.get('phone')?.invalid && resetForm.get('phone')?.touched" class="text-danger">
                      El teléfono es requerido
                    </div>
                  </div>

                  <div class="mb-3">
                    <label for="birthdate-day" class="form-label">Fecha de nacimiento *</label>
                    <div class="row g-2">
                      <div class="col-4">
                        <select id="birthdate-day" class="form-select"
                                [(ngModel)]="birthDay" (ngModelChange)="updateBirthdate()" [ngModelOptions]="{standalone: true}">
                          <option value="" disabled selected>Día</option>
                          <option *ngFor="let d of dayOptions" [value]="d">{{ d }}</option>
                        </select>
                      </div>
                      <div class="col-4">
                        <select id="birthdate-month" class="form-select"
                                [(ngModel)]="birthMonth" (ngModelChange)="onMonthOrYearChange()" [ngModelOptions]="{standalone: true}">
                          <option value="" disabled selected>Mes</option>
                          <option *ngFor="let m of monthOptions" [value]="m.value">{{ m.label }}</option>
                        </select>
                      </div>
                      <div class="col-4">
                        <select id="birthdate-year" class="form-select"
                                [(ngModel)]="birthYear" (ngModelChange)="onMonthOrYearChange()" [ngModelOptions]="{standalone: true}">
                          <option value="" disabled selected>Año</option>
                          <option *ngFor="let y of yearOptions" [value]="y">{{ y }}</option>
                        </select>
                      </div>
                    </div>
                    <!-- Hidden (or visually hidden) input bound to reactive form to preserve existing logic -->
                    <input type="hidden" formControlName="birthdate">
                    <div *ngIf="birthdateError" class="text-danger mt-1 small">
                      {{ birthdateError }}
                    </div>
                  </div>
                  
                  <hr class="mb-3">
                  <h6 class="mb-3 text-muted">Configuración de acceso</h6>
                </div>
                
                <div class="form-group mb-3">
                  <label for="password">{{ isNewUserInvite ? 'Tu contraseña' : 'Nueva contraseña' }}</label>
                  <div class="input-group">
                    <input 
                      [type]="showPassword ? 'text' : 'password'" 
                      id="password" 
                      class="form-control" 
                      formControlName="password"
                      placeholder="Mínimo 6 caracteres">
                    <button 
                      type="button" 
                      class="btn btn-outline-secondary" 
                      (click)="showPassword = !showPassword"
                      title="{{ showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña' }}">
                      <i class="bi" [ngClass]="showPassword ? 'bi-eye-slash' : 'bi-eye'"></i>
                    </button>
                  </div>
                  <div *ngIf="resetForm.get('password')?.invalid && resetForm.get('password')?.touched" class="text-danger">
                    La contraseña debe tener al menos 6 caracteres
                  </div>
                </div>
                
                <div class="form-group mb-3">
                  <label for="confirmPassword">Confirmar contraseña</label>
                  <div class="input-group">
                    <input 
                      [type]="showConfirmPassword ? 'text' : 'password'" 
                      id="confirmPassword" 
                      class="form-control" 
                      formControlName="confirmPassword"
                      placeholder="Repite la contraseña">
                    <button 
                      type="button" 
                      class="btn btn-outline-secondary" 
                      (click)="showConfirmPassword = !showConfirmPassword"
                      title="{{ showConfirmPassword ? 'Ocultar contraseña' : 'Mostrar contraseña' }}">
                      <i class="bi" [ngClass]="showConfirmPassword ? 'bi-eye-slash' : 'bi-eye'"></i>
                    </button>
                  </div>
                  <div *ngIf="passwordMismatch" class="text-danger">
                    Las contraseñas no coinciden
                  </div>
                  <div *ngIf="resetForm.get('confirmPassword')?.invalid && resetForm.get('confirmPassword')?.touched" class="text-danger">
                    Debes confirmar tu contraseña
                  </div>
                </div>
                
                <button type="submit" class="btn btn-primary w-100" [disabled]="resetForm.invalid || submitting || passwordMismatch">
                  {{ submitting ? 'Guardando...' : (isNewUserInvite ? 'Crear mi cuenta' : 'Actualizar contraseña') }}
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  `
  ,
  styles: [
    `
    /* Mejoras de usabilidad en móviles pequeños */
    @media (max-width: 576px) {
      .responsive-container { padding-left: 0.75rem; padding-right: 0.75rem; }
      .responsive-card { max-height: calc(100vh - 1.5rem); overflow: hidden; }
      .responsive-card-body { overflow-y: auto; -webkit-overflow-scrolling: touch; }
    }
    `
  ]
})
export class ResetPasswordComponent implements OnInit, OnDestroy {
  resetForm: FormGroup;
  processingAuth = true;
  showForm = false;
  submitting = false;
  statusMessage = '';
  statusMessageType = 'alert-info';
  passwordMismatch = false;
  isBrowser: boolean;
  showPassword = false;
  showConfirmPassword = false;
  isNewUserInvite = false;
  showRequestInviteCTA = false;
  requestingInvite = false;
  knownEmailForRequest = false;
  emailForRequest = '';
  // Campos para selector personalizado de fecha de nacimiento
  birthDay: string = '';
  birthMonth: string = '';
  birthYear: string = '';
  dayOptions: number[] = [];
  monthOptions = [
    { value: '01', label: 'ene.' }, { value: '02', label: 'feb.' }, { value: '03', label: 'mar.' },
    { value: '04', label: 'abr.' }, { value: '05', label: 'may.' }, { value: '06', label: 'jun.' },
    { value: '07', label: 'jul.' }, { value: '08', label: 'ago.' }, { value: '09', label: 'sep.' },
    { value: '10', label: 'oct.' }, { value: '11', label: 'nov.' }, { value: '12', label: 'dic.' }
  ];
  yearOptions: number[] = [];
  birthdateError: string = '';
  
  private subs: any[] = [];
  private debugEnabled = !environment.production; // sólo log en no-producción

  private logDebug(...args: any[]) {
    if (this.debugEnabled) {
      // eslint-disable-next-line no-console
      console.log('[ResetPassword]', ...args);
    }
  }

  constructor(
    private fb: FormBuilder,
    private route: ActivatedRoute,
    private router: Router,
    private authService: AuthService,
    private databaseService: DatabaseService,
  private supabaseService: SupabaseService,
    @Inject(PLATFORM_ID) private platformId: Object
  ) {
    this.logDebug('Component init');
    this.isBrowser = isPlatformBrowser(this.platformId);
    
    this.resetForm = this.fb.group({
      password: ['', [Validators.required, Validators.minLength(6)]],
      confirmPassword: ['', [Validators.required]],
      name: [''],
      surname: [''], 
  phone: [''],
  birthdate: ['']
    });
  }

  ngOnInit() {
    this.logDebug('ngOnInit');
    this.initYearOptions();
    this.refreshDayOptions();
    
    // Solo ejecutar código relacionado con el navegador si estamos en el navegador
    if (this.isBrowser) {
      
      // Agregar validación de contraseñas
      this.resetForm.valueChanges.subscribe(() => {
        if (this.resetForm.get('confirmPassword')?.value) {
          this.passwordMismatch = 
            this.resetForm.get('password')?.value !== 
            this.resetForm.get('confirmPassword')?.value;
        }
      });
      
      // Examinar el hash para tokens (Supabase a veces pone tokens aquí)
      const currentHash = window.location.hash;
      if (currentHash) {
        const hashParams = new URLSearchParams(currentHash.substring(1));
        const accessToken = hashParams.get('access_token');
        const refreshToken = hashParams.get('refresh_token');
        const type = hashParams.get('type');
        
        if (accessToken) {
          this.logDebug('Token found in hash');
          
          // Detectar si es una invitación nueva desde el hash
          if (type === 'invite') {
            this.isNewUserInvite = true;
            this.setupFormValidators();
            this.logDebug('Invite detected via hash');
          }
          
          // Intentar establecer la sesión con el token del hash
          this.authService.setSession(accessToken, refreshToken || '').subscribe({
            next: (result) => {
              this.logDebug('Session set from hash');
              this.processingAuth = false;
              
              if (result.data?.session) {
                this.ensureOnboardingThenShowForm();
              } else {
                this.statusMessage = 'No se pudo autenticar con el token proporcionado.';
                this.statusMessageType = 'alert-warning';
              }
            },
            error: (err) => {
              this.logDebug('Error setting session from hash', err);
              this.processingAuth = false;
              this.statusMessage = 'Error al procesar el token. Puede haber caducado. ¿Quieres pedir un nuevo enlace de invitación?';
              this.statusMessageType = 'alert-danger';
              this.showRequestInviteCTA = true;
            }
          });
          
          return; // Terminamos aquí si encontramos tokens en el hash
        }
      }
      
      // Capturar parámetros de la URL de query
      this.route.queryParams.subscribe(params => {
  this.logDebug('Query params', params);
        
        // Verificar si hay un error
        if (params['error']) {
          this.statusMessage = `El enlace no es válido o ya se usó. ¿Quieres pedir un nuevo enlace de invitación?`;
          this.statusMessageType = 'alert-danger';
          this.processingAuth = false;
          this.showRequestInviteCTA = true;
          return;
        }
        
        // Detectar si es una invitación nueva
        if (params['type'] === 'invite' || params['invitation']) {
          this.isNewUserInvite = true;
          this.setupFormValidators();
          this.logDebug('Invite detected via params');
        }
        
        // Verificar si tenemos un token en los parámetros
        if (params['token'] || params['access_token'] || params['code']) {
          this.logDebug('Token detected in URL params');
          
          // Si hay access_token en los parámetros, intenta establecer la sesión
          if (params['access_token']) {
            this.authService.setSession(params['access_token'], params['refresh_token'] || '').subscribe({
              next: (result) => {
                this.logDebug('Session set from params');
                this.processingAuth = false;
                
                if (result.data?.session) {
                  this.ensureOnboardingThenShowForm();
                } else {
                  this.statusMessage = 'No se pudo autenticar con el token proporcionado.';
                  this.statusMessageType = 'alert-warning';
                }
              },
              error: (err) => {
                this.logDebug('Error setting session from params', err);
                this.processingAuth = false;
                this.statusMessage = 'Error al procesar el token. Puede haber caducado. ¿Quieres pedir un nuevo enlace de invitación?';
                this.statusMessageType = 'alert-danger';
                this.showRequestInviteCTA = true;
              }
            });
            
            return;
          }
          
          // Si hay un código de Supabase, verificar la sesión después de que Supabase lo procese
          if (params['code']) {
            this.logDebug('Recovery/invite code detected');
            
            // Esperar un momento para que Supabase procese el token automáticamente
            setTimeout(() => {
              this.authService.checkSessionStatus().subscribe({
                next: (session) => {
                  this.logDebug('Session status after code', !!session);
                  this.processingAuth = false;
                  
                  if (session) {
                    this.ensureOnboardingThenShowForm();
                  } else {
                    // No hay sesión, intentar recuperar manualmente con el código
                    this.logDebug('Attempt manual code verification');
                    this.authService.verifyRecoveryToken(params['code']).subscribe({
                      next: (result: any) => {
                        this.logDebug('Code verification success');
                        this.processingAuth = false;
                        
                        if (result.data?.session) {
                          this.ensureOnboardingThenShowForm();
                        } else {
                          this.statusMessage = 'No se pudo verificar el código. Es posible que haya expirado. ¿Quieres pedir un nuevo enlace de invitación?';
                          this.statusMessageType = 'alert-warning';
                          this.showRequestInviteCTA = true;
                        }
                      },
                      error: (err: any) => {
                        this.logDebug('Error verifying code', err);
                        this.processingAuth = false;
                        this.statusMessage = 'El enlace ha expirado o no es válido. ¿Quieres pedir un nuevo enlace de invitación?';
                        this.statusMessageType = 'alert-danger';
                        this.showRequestInviteCTA = true;
                      }
                    });
                  }
                },
                error: (err) => {
                  console.error('Error al verificar sesión:', err);
                  this.processingAuth = false;
                  this.statusMessage = 'Error al verificar tu sesión. ¿Quieres pedir un nuevo enlace de invitación?';
                  this.statusMessageType = 'alert-danger';
                  this.showRequestInviteCTA = true;
                }
              });
            }, 3000); // Aumentado a 3 segundos para dar más tiempo
            
            return;
          }
          
          // Si hay un token pero no access_token ni code, verifica la sesión actual
          this.authService.checkSessionStatus().subscribe({
            next: (session) => {
              this.logDebug('Session status (generic path)', !!session);
              this.processingAuth = false;
              
              if (session) {
                this.ensureOnboardingThenShowForm();
              } else {
                // No hay sesión, puede ser un problema con el token
                this.statusMessage = 'No se pudo verificar tu sesión. El enlace puede haber expirado. ¿Quieres pedir un nuevo enlace de invitación?';
                this.statusMessageType = 'alert-warning';
                this.showRequestInviteCTA = true;
              }
            },
            error: (err) => {
              this.logDebug('Error checking session (generic path)', err);
              this.processingAuth = false;
              this.statusMessage = 'Error al verificar tu sesión. ¿Quieres pedir un nuevo enlace de invitación?';
              this.statusMessageType = 'alert-danger';
              this.showRequestInviteCTA = true;
            }
          });
        } else {
          // No hay token ni error, posiblemente acceso directo a la ruta
          this.processingAuth = false;
          this.statusMessage = 'Este enlace ya fue usado o ha caducado. ¿Quieres pedir un nuevo enlace de invitación?';
          this.statusMessageType = 'alert-warning';
          this.showRequestInviteCTA = true;
        }
      });
    } else {
      // En el servidor, establecer valores por defecto
      this.processingAuth = false;
      this.statusMessage = 'Cargando...';
      this.statusMessageType = 'alert-info';
    }
    
    // Configurar validadores según el tipo de operación
    this.setupFormValidators();
  }

  requestNewInvite() {
    if (this.requestingInvite) return;
    this.requestingInvite = true;
    // Intentar deducir el email desde el parámetro o desde el usuario actual si existe
    const searchParams = new URLSearchParams(window.location.search);
    const emailFromUrl = searchParams.get('email');
    const proceed = (detectedEmail: string | null) => {
      const email = detectedEmail || (this.emailForRequest || '').trim();
      const valid = !!email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
      if (!valid) {
        this.requestingInvite = false;
        this.statusMessage = 'Introduce tu email para avisar al administrador.';
        this.statusMessageType = 'alert-warning';
        return;
      }
      this.supabaseService.requestNewInvite(email)
        .then(() => {
          this.requestingInvite = false;
          this.showRequestInviteCTA = false;
          this.statusMessage = 'Solicitud enviada. Te avisaremos en cuanto el admin reenvíe el enlace.';
          this.statusMessageType = 'alert-success';
        })
        .catch((err: any) => {
          this.requestingInvite = false;
          this.statusMessage = err?.message || 'No se pudo registrar la solicitud';
          this.statusMessageType = 'alert-danger';
        });
    };
    this.authService.currentUser$.subscribe(user => {
      if (user?.email) {
        this.knownEmailForRequest = true;
        proceed(user.email);
      } else {
        this.knownEmailForRequest = !!emailFromUrl;
        if (emailFromUrl) this.emailForRequest = emailFromUrl;
        proceed(emailFromUrl);
      }
    });
  }

  private ensureOnboardingThenShowForm() {
    // Determina si el usuario requiere onboarding consultando la base de datos
  const sub = this.authService.currentUser$.pipe(take(1)).subscribe((user: any) => {
      if (!user) {
        // Sin usuario, muestra formulario en modo onboarding por seguridad
        this.isNewUserInvite = true;
        this.setupFormValidators();
        this.showForm = true;
        this.statusMessage = 'Bienvenido! Completa tu perfil y crea tu contraseña para acceder al sistema.';
        this.statusMessageType = 'alert-success';
        return;
      }
      // Intentar RPC needs_onboarding; si no existe, caer a comprobación directa de la tabla
  this.databaseService.querySingle<any>(supabase => supabase.rpc('needs_onboarding', { uid: user.id })).pipe(take(1)).subscribe({
        next: (flag) => {
          const needs = flag === true || flag === 'true';
          this.isNewUserInvite = needs;
          if (needs) this.setupFormValidators();
          this.showForm = true;
          this.statusMessage = needs
            ? 'Bienvenido! Completa tu perfil y crea tu contraseña para acceder al sistema.'
            : 'Sesión autenticada. Puedes cambiar tu contraseña.';
          this.statusMessageType = 'alert-success';
        },
        error: () => {
          // Fallback: comprobar si existe y está completo el perfil en public.users
          this.databaseService.querySingle<any>(supabase =>
            supabase.from('users').select('name,surname,telephone').eq('auth_user_id', user.id).single()
          ).pipe(take(1)).subscribe({
            next: (row) => {
              const nameOk = !!(row?.name && String(row.name).trim());
              const surnameOk = !!(row?.surname && String(row.surname).trim());
              const phoneOk = !!(row?.telephone && String(row.telephone).trim());
              const needs = !(nameOk && surnameOk && phoneOk);
              this.isNewUserInvite = needs;
              if (needs) this.setupFormValidators();
              this.showForm = true;
              this.statusMessage = needs
                ? 'Bienvenido! Completa tu perfil y crea tu contraseña para acceder al sistema.'
                : 'Sesión autenticada. Puedes cambiar tu contraseña.';
              this.statusMessageType = 'alert-success';
            },
            error: () => {
              // Si no hay fila, forzar onboarding
              this.isNewUserInvite = true;
              this.setupFormValidators();
              this.showForm = true;
              this.statusMessage = 'Bienvenido! Completa tu perfil y crea tu contraseña para acceder al sistema.';
              this.statusMessageType = 'alert-success';
            }
          });
        }
      });
    });
    this.subs.push(sub);
  }

  onSubmit() {
    if (this.resetForm.invalid) return;
    
    if (this.resetForm.value.password !== this.resetForm.value.confirmPassword) {
      this.passwordMismatch = true;
      return;
    }
    
    this.submitting = true;
    
    // Primero actualizar la contraseña
    this.authService.updatePassword(this.resetForm.value.password).subscribe({
      next: () => {
        // Si es un nuevo usuario, actualizar también su perfil
        if (this.isNewUserInvite) {
          this.updateUserProfile();
        } else {
          this.handleSuccess();
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

  private updateUserProfile() {
    // Esperar un momento para asegurar que la sesión esté completamente establecida
    setTimeout(() => {
      // Obtener el usuario actual para obtener su ID
  const sub = this.authService.currentUser$.pipe(take(1)).subscribe((user: any) => {
        if (!user) {
          this.submitting = false;
          this.statusMessage = 'Error: No se pudo obtener la información del usuario';
          this.statusMessageType = 'alert-danger';
          return;
        }
        this.logDebug('Updating profile for user');

        // Actualizar el perfil del usuario en la tabla users
        const profileData = {
          name: this.resetForm.value.name,
          surname: this.resetForm.value.surname,
          telephone: this.resetForm.value.phone
        };

  this.logDebug('Profile payload prepared');

        // Primero verificar si el usuario existe en la tabla
        this.databaseService.querySingle(supabase => 
          supabase
            .from('users')
            .select('*')
            .eq('auth_user_id', user.id)
            .single()
        ).pipe(take(1)).subscribe({
          next: (existingUser) => {
            this.logDebug('Existing user found');
            // Si existe, actualizar
            this.updateExistingUser(user.id, profileData);
          },
          error: (err) => {
            this.logDebug('User not found, creating new');
            // Si no existe, crear
            this.createNewUser(user, profileData);
          }
        });
      });
      this.subs.push(sub);
    }, 1000);
  }

  private handleSuccess() {
    this.submitting = false;
    if (this.isNewUserInvite) {
      this.statusMessage = '¡Cuenta creada con éxito! Ya puedes iniciar sesión con tu email y contraseña. Redireccionando...';
    } else {
      this.statusMessage = 'Contraseña actualizada con éxito! Redireccionando...';
    }
    this.statusMessageType = 'alert-success';
    this.showForm = false;
    
    if (this.isBrowser) {
      setTimeout(() => {
        if (this.isNewUserInvite) {
          // Primer login: dirigir a /login para que inicie sesión ya con contraseña creada
          this.router.navigate(['/login']);
        } else {
          // Recuperación: enviar al calendario directamente si ya está autenticado
          this.router.navigate(['/calendario']);
        }
      }, 3000);
    }
  }

  private getFormErrors() {
    const errors: any = {};
    Object.keys(this.resetForm.controls).forEach(key => {
      const controlErrors = this.resetForm.get(key)?.errors;
      if (controlErrors) {
        errors[key] = controlErrors;
      }
    });
    return errors;
  }

  private updateExistingUser(userId: string, profileData: any) {
    this.databaseService.querySingle(supabase => 
      supabase
        .from('users')
        .update(profileData)
        .eq('auth_user_id', userId)
        .select()
        .single()
    ).subscribe({
      next: (result) => {
        this.logDebug('Profile updated');
        this.handleSuccess();
      },
      error: (err) => {
        this.logDebug('Error updating existing profile', err);
        this.handleProfileError(err);
      }
    });
  }

  private createNewUser(user: any, profileData: any) {
    const newUserData = {
      auth_user_id: user.id,
      email: user.email,
      role_id: 2, // Usuario normal
      name: profileData.name,
      surname: profileData.surname,
      telephone: profileData.telephone
    };

    this.databaseService.querySingle(supabase => 
      supabase
        .from('users')
        .insert(newUserData)
        .select()
        .single()
    ).subscribe({
      next: (result) => {
        this.logDebug('User created');
        this.handleSuccess();
      },
      error: (err) => {
        this.logDebug('Error creating user', err);
        this.handleProfileError(err);
      }
    });
  }

  private handleProfileError(err: any) {
  this.logDebug('Profile error', err);
    
    this.submitting = false;
    this.statusMessage = `Contraseña creada con éxito, pero hubo un problema al guardar tu perfil (${err.message || 'Error desconocido'}). Puedes actualizarlo desde tu perfil después de iniciar sesión.`;
    this.statusMessageType = 'alert-warning';
    
    if (this.isBrowser) {
      setTimeout(() => {
        this.router.navigate(['/calendario']);
      }, 5000);
    }
  }

  private setupFormValidators() {
    if (this.isNewUserInvite) {
      // Para nuevos usuarios, los campos de perfil son obligatorios
      this.resetForm.get('name')?.setValidators([Validators.required]);
      this.resetForm.get('surname')?.setValidators([Validators.required]);
      this.resetForm.get('phone')?.setValidators([Validators.required]);
      this.resetForm.get('birthdate')?.setValidators([Validators.required]);
    } else {
      // Para recuperación de contraseña, los campos de perfil no son necesarios
      this.resetForm.get('name')?.clearValidators();
      this.resetForm.get('surname')?.clearValidators();
      this.resetForm.get('phone')?.clearValidators();
      this.resetForm.get('birthdate')?.clearValidators();
    }
    
    // Actualizar validación
    this.resetForm.get('name')?.updateValueAndValidity();
    this.resetForm.get('surname')?.updateValueAndValidity();
    this.resetForm.get('phone')?.updateValueAndValidity();
    this.resetForm.get('birthdate')?.updateValueAndValidity();
  }

  // Inicializa rango de años (por ejemplo desde año actual hacia 1930)
  private initYearOptions() {
    const currentYear = new Date().getFullYear();
    const earliest = 1930; // ajustable
    this.yearOptions = [];
    for (let y = currentYear; y >= earliest; y--) {
      this.yearOptions.push(y);
    }
  }

  private refreshDayOptions() {
    // Si no hay mes o año todavía, usar 31 días para lista completa
    const year = parseInt(this.birthYear || '2000', 10); // año bisiesto base cuando vacío
    const month = parseInt(this.birthMonth || '01', 10);
    const daysInMonth = new Date(year, month, 0).getDate();
    this.dayOptions = Array.from({ length: daysInMonth }, (_, i) => i + 1);
    // Si el día seleccionado excede nuevo máximo, resetear
    if (this.birthDay) {
      const bd = parseInt(this.birthDay, 10);
      if (bd > daysInMonth) {
        this.birthDay = '';
      }
    }
  }

  onMonthOrYearChange() {
    this.refreshDayOptions();
    this.updateBirthdate();
  }

  updateBirthdate() {
    // Limpiar error
    this.birthdateError = '';
    const d = this.birthDay;
    const m = this.birthMonth;
    const y = this.birthYear;
    if (!y || !m || !d) {
      this.resetForm.get('birthdate')?.setValue('');
      if (this.resetForm.get('birthdate')?.touched) {
        this.birthdateError = 'La fecha de nacimiento es requerida';
      }
      return;
    }
    // Formatear con padding
    const dd = d.toString().padStart(2, '0');
    const iso = `${y}-${m}-${dd}`;
    // Validar fecha real (Date parse & recompose)
    const test = new Date(iso + 'T00:00:00');
    if (isNaN(test.getTime()) || (test.getFullYear() !== parseInt(y, 10))) {
      this.birthdateError = 'Fecha no válida';
      this.resetForm.get('birthdate')?.setValue('');
      return;
    }
    this.resetForm.get('birthdate')?.setValue(iso);
  }

  ngOnDestroy() {
    this.subs.forEach(s => s.unsubscribe && s.unsubscribe());
  }
}