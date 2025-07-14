import { Component } from '@angular/core';
import { SupabaseService } from '../../services/supabase-admin.service';
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

  constructor(private supabase: SupabaseService) {}

  invite() {
    this.message = '';
    this.error = '';
    this.supabase.inviteUserByEmail(this.email)
      .then(() => {
        this.message = 'Invitación enviada correctamente.';
        this.email = '';
      })
      .catch(() => {
        this.error = 'Error al enviar la invitación.';
      });
  }
}
