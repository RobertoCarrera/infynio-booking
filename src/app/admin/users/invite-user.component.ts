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
  pending: Array<{ id: string; email: string; created_at?: string; confirmation_sent_at?: string | null }> = [];
  filtered: Array<{ id: string; email: string; created_at?: string; confirmation_sent_at?: string | null }> = [];
  filter = '';
  private lastInvitedEmail: string | null = null;
  // invite requests alerts
  requests: Array<{ email: string; last_requested_at: string; request_count: number }> = [];
  combined: Array<
    | ({ source: 'pending' } & { id: string; email: string; created_at?: string; confirmation_sent_at?: string | null })
    | ({ source: 'request' } & { email: string; last_requested_at: string; request_count: number })
  > = [];
  combinedFiltered: typeof this.combined = [];

  private readonly INVITE_EXPIRY_HOURS = 48; // adjust as needed

  constructor(private supabase: SupabaseService) {}

  ngOnInit(): void {
    this.loadPending();
    this.loadInviteRequests();
  }

  loadPending() {
    this.supabase.listPendingInvites()
      .then(list => { this.pending = list as any; this.mergeLists(); this.applyFilter(); })
      .catch(err => console.error('Error cargando invitaciones pendientes:', err));
  }

  loadInviteRequests() {
    this.supabase.listInviteRequests()
      .then(reqs => { this.requests = reqs; this.mergeLists(); })
      .catch(() => { this.mergeLists(); });
  }

  reloadAll() {
    this.loadPending();
    this.loadInviteRequests();
  }

  applyFilter() {
    const f = (this.filter || '').toLowerCase().trim();
    this.combinedFiltered = !f
      ? [...this.combined]
      : this.combined.filter(u => (u.email || '').toLowerCase().includes(f));
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
  // clear alert after action
  this.clearRequest(email);
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
  .finally(() => { this.loadPending(); this.clearRequest(email); });
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

  hasRequest(email: string): boolean {
    const e = (email || '').toLowerCase();
    return this.requests.some(r => (r.email || '').toLowerCase() === e);
  }

  requestInfo(email: string) {
    const e = (email || '').toLowerCase();
    return this.requests.find(r => (r.email || '').toLowerCase() === e);
  }

  clearRequest(email: string) {
    this.supabase.clearInviteRequest(email).then(() => this.loadInviteRequests()).catch(() => {});
  }

  // Helpers to merge and display
  private mergeLists() {
    const pendingEmails = new Set(this.pending.map(p => (p.email || '').toLowerCase()));
    const requestOnly = (this.requests || []).filter(r => !pendingEmails.has((r.email || '').toLowerCase()))
      .map(r => ({ source: 'request' as const, email: r.email, last_requested_at: r.last_requested_at, request_count: r.request_count }));
    const pendingWithSource = (this.pending || []).map(p => ({ source: 'pending' as const, ...p }));
    this.combined = [...pendingWithSource, ...requestOnly]
      .sort((a: any, b: any) => {
        const aTime = (a.source === 'pending') ? (a.created_at ? new Date(a.created_at).getTime() : 0) : new Date(a.last_requested_at).getTime();
        const bTime = (b.source === 'pending') ? (b.created_at ? new Date(b.created_at).getTime() : 0) : new Date(b.last_requested_at).getTime();
        return bTime - aTime;
      });
    this.applyFilter();
  }

  isInviteExpired(row: any): boolean {
    if (row?.source !== 'pending') return false;
    const base = row.confirmation_sent_at || row.created_at;
    if (!base) return false;
    const sent = new Date(base).getTime();
    const now = Date.now();
    const diffHours = (now - sent) / (1000 * 60 * 60);
    return diffHours >= this.INVITE_EXPIRY_HOURS;
  }

  // Date accessor for template to avoid union property narrowing issues
  rowDate(row: any): string | undefined {
    if (!row) return undefined;
    if (row.source === 'pending') {
      return row.confirmation_sent_at || row.created_at;
    }
    // request-only rows carry last_requested_at
    return row.last_requested_at || this.requestInfo(row.email)?.last_requested_at;
  }
}
