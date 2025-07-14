import { Component, OnInit } from '@angular/core';
import { SupabaseService } from '../../services/supabase-admin.service';
import { User } from '../../models/user';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-users-list',
  templateUrl: './users-list.component.html',
  imports: [CommonModule, FormsModule]
})
export class UsersListComponent implements OnInit {
  users: User[] = [];
  loading = true;
  error: string | null = null;
  filterText: string = '';

  constructor(private supabase: SupabaseService) {}

  ngOnInit() {
    this.supabase.getAllUsers()
      .then(result => {
        this.users = result.data || [];
        this.loading = false;
      })
      .catch(() => {
        this.error = 'Error al cargar usuarios';
        this.loading = false;
      });
  }

  get filteredUsers(): User[] {
    const text = this.filterText.trim().toLowerCase();
    if (!text) return this.users;
    return this.users.filter(user =>
      (user.surname || '').toLowerCase().includes(text) ||
      (user.name || '').toLowerCase().includes(text) ||
      (user.email || '').toLowerCase().includes(text)
    );
  }
}
