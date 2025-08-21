import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterModule],
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.css']
})
export class LoginComponent {
  loginForm: FormGroup;
  error: string = '';
  loading: boolean = false;

  constructor(
    private fb: FormBuilder,
    private router: Router,
    private authService: AuthService
  ) {
    this.loginForm = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required]]
    });
  }

  onSubmit() {
    this.error = '';
    if (this.loginForm.invalid) return;

    const { email, password } = this.loginForm.value;
    this.loading = true;

    this.authService.login(email, password).subscribe({
      next: () => {
        this.loading = false;
        // El AuthService redirige automáticamente tras login exitoso
        // Si quieres redirigir aquí, puedes hacerlo, pero ya lo gestiona el servicio
      },
      error: (err) => {
        this.loading = false;
        this.error = 'Error al iniciar sesión, verifica tus credenciales.';
      }
    });
  }

  navigateToForgotPassword() {
    this.router.navigate(['/forgot-password']);
  }
}