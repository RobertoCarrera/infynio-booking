import { Component, OnInit } from '@angular/core';
import { SupabaseService } from '../../services/supabase.service';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-invite-user',
  templateUrl: './invite-user.component.html',
  imports: [FormsModule, CommonModule]
})
export class InviteUserComponent implements OnInit {
  email = '';
  message = '';
  error = '';
  showFallbackOption = false; // Controla si mostrar el botón de respaldo
  recoveryLink: string | null = null;
  status: string | undefined;
  pending: Array<{ id: string; email: string; created_at?: string }> = [];
  filtered: Array<{ id: string; email: string; created_at?: string }> = [];
  filter = '';
  private lastInvitedEmail: string | null = null;

  constructor(private supabase: SupabaseService) {}

  ngOnInit(): void {
    this.loadPending();
  }

  loadPending() {
    this.supabase.listPendingInvites()
      .then(list => { this.pending = list; this.applyFilter(); })
      .catch(err => console.error('Error cargando invitaciones pendientes:', err));
  }

  applyFilter() {
    const f = (this.filter || '').toLowerCase().trim();
    this.filtered = !f
      ? [...this.pending]
      : this.pending.filter(u => (u.email || '').toLowerCase().includes(f));
  }

  invite() {
    this.message = '';
    this.error = '';
  this.recoveryLink = null;
  this.status = undefined;
    
    if (!this.email || !this.isValidEmail(this.email)) {
      this.error = 'Por favor, introduce un email válido.';
      return;
    }
    
    console.log('🔄 Inviting user:', this.email);
    
    this.supabase.inviteUserByEmail(this.email)
      .then((result) => {
        console.log('✅ Invite result:', result);
  this.message = result.message || 'Invitación enviada correctamente.';
        this.status = result.status;
        if (result.recovery_link) {
          this.recoveryLink = result.recovery_link;
        }
  this.lastInvitedEmail = this.email;
  this.email = '';
  // Reset any active filter so you can see the new invite
  this.filter = '';
  this.loadPending();
  // Do a short delayed refresh to catch eventual consistency from Supabase Auth
  setTimeout(() => this.loadPending(), 1000);
      })
      .catch((error) => {
        console.error('❌ Error inviting user:', error);
        this.error = error.message || 'Error al enviar la invitación.';
      });
  }

  resend() {
    this.message = '';
    this.error = '';
    this.recoveryLink = null;
    if (!this.email || !this.isValidEmail(this.email)) {
      this.error = 'Por favor, introduce un email válido.';
      return;
    }
    this.supabase.resendRecovery(this.email)
      .then((res) => {
        this.message = res.message;
        this.recoveryLink = res.recovery_link || null;
      })
      .catch((err) => {
        this.error = err.message || 'Error al generar el enlace de recuperación.';
      });
  }

  resendFor(email: string) {
    const prev = this.email;
    this.email = email;
    this.resend();
    this.email = prev;
  }

  cancel() {
    this.message = '';
    this.error = '';
    this.recoveryLink = null;
    if (!this.email || !this.isValidEmail(this.email)) {
      this.error = 'Por favor, introduce un email válido.';
      return;
    }
    if (!confirm(`¿Seguro que deseas cancelar la invitación/cuenta para ${this.email}?`)) return;
    this.supabase.cancelInvitation(this.email)
      .then((res) => {
        this.message = res.message;
      })
      .catch((err) => {
        this.error = err.message || 'Error al cancelar la invitación.';
  })
  .finally(() => this.loadPending());
  }

  cancelFor(email: string, id?: string) {
    this.message = '';
    this.error = '';
    this.recoveryLink = null;
    if (!this.isValidEmail(email)) {
      this.error = 'Email inválido';
      return;
    }
    if (!confirm(`¿Seguro que deseas cancelar la invitación/cuenta para ${email}?`)) return;
    this.supabase.cancelInvitation(email, id)
      .then((res) => {
        this.message = res.message;
      })
      .catch((err) => {
        this.error = err.message || 'Error al cancelar la invitación.';
      })
      .finally(() => this.loadPending());
  }

  copyRecoveryLink() {
    if (!this.recoveryLink) return;
    navigator.clipboard.writeText(this.recoveryLink).then(() => {
      this.message = 'Enlace de recuperación copiado al portapapeles.';
    }).catch(() => {
      this.error = 'No se pudo copiar el enlace. Copia manualmente: ' + this.recoveryLink;
    });
  }

  // Método alternativo para crear usuario directamente
  createUserDirectly() {
    this.message = '';
    this.error = '';
    
    if (!this.email || !this.isValidEmail(this.email)) {
      this.error = 'Por favor, introduce un email válido.';
      return;
    }
    
    console.log('🔄 Creating user directly:', this.email);
    
    this.supabase.createUserDirectly(this.email)
      .then((result) => {
        console.log('✅ Direct creation result:', result);
        this.message = result.message || 'Usuario creado directamente en el sistema.';
        this.email = '';
      })
      .catch((error) => {
        console.error('❌ Error creating user directly:', error);
        this.error = error.message || 'Error al crear el usuario directamente.';
      });
  }

  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }
}
