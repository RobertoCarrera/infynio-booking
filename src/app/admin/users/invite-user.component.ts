import { Component } from '@angular/core';
import { SupabaseAdminService } from '../../services/supabase-admin.service';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-invite-user',
  templateUrl: './invite-user.component.html',
  imports: [FormsModule, CommonModule]
})
export class InviteUserComponent {
  email = '';
  message = '';
  error = '';

  constructor(private supabase: SupabaseAdminService) {}

  invite() {
    this.message = '';
    this.error = '';
    
    if (!this.email || !this.isValidEmail(this.email)) {
      this.error = 'Por favor, introduce un email válido.';
      return;
    }
    
    console.log('🔄 Inviting user:', this.email);
    
    this.supabase.inviteUserByEmail(this.email)
      .then((result) => {
        console.log('✅ Invite result:', result);
        this.message = result.message || 'Invitación enviada correctamente.';
        this.email = '';
      })
      .catch((error) => {
        console.error('❌ Error inviting user:', error);
        this.error = error.message || 'Error al enviar la invitación.';
      });
  }

  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }
}
