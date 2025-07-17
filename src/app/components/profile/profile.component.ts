import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { UsersService } from '../../services/users.service';
import { AuthService } from '../../services/auth.service';
import { User } from '../../models/user';

@Component({
  selector: 'app-profile',
  imports: [CommonModule, FormsModule],
  templateUrl: './profile.component.html',
  styleUrls: ['./profile.component.css']
})
export class ProfileComponent implements OnInit {
  selectedUser?: User;

  constructor(private usersService: UsersService, private authService: AuthService) {}

  ngOnInit() {
    this.authService.currentUser$.subscribe(currentUser => {
      if (currentUser?.id || currentUser?.auth_user_id) {
        const authUserId = currentUser.id || currentUser.auth_user_id;
        
        // Buscar por auth_user_id (UUID de Supabase Auth)
        this.usersService.getByAuthUserId(authUserId)
          .subscribe({
            next: (user) => {
              this.selectedUser = user || undefined;
            },
            error: (error) => {
              console.error('Error getting user profile:', error);
              this.selectedUser = undefined;
            }
          });
      }
    });
  }
}
