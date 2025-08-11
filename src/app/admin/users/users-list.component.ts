import { Component, OnInit } from '@angular/core';
import { SupabaseService } from '../../services/supabase.service';
import { User } from '../../models/user';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { EditUserModalComponent } from './edit-user-modal.component';

@Component({
  selector: 'app-users-list',
  templateUrl: './users-list.component.html',
  imports: [CommonModule, FormsModule, EditUserModalComponent]
})
export class UsersListComponent implements OnInit {
  users: User[] = [];
  loading = true;
  error: string | null = null;
  filterText: string = '';
  selectedUser: User | null = null;
  showEditModal = false;
  showDeactivated = false;

  constructor(private supabase: SupabaseService) {}

  ngOnInit() {
    this.loadUsers();
  }

  async loadUsers() {
    this.loading = true;
    const loader = this.showDeactivated ? this.supabase.getDeactivatedUsers() : this.supabase.getAllUsers();
    loader
      .then(result => {
        const data = result.data || [];
        this.users = data;
        this.loading = false;
      })
      .catch(() => {
        this.error = 'Error al cargar usuarios';
        this.loading = false;
      });
  }

  get filteredUsers(): User[] {
    const text = this.filterText.trim().toLowerCase();
    let filtered = this.users;
    if (text) {
      filtered = this.users.filter(user =>
        (user.surname || '').toLowerCase().includes(text) ||
        (user.name || '').toLowerCase().includes(text) ||
        (user.email || '').toLowerCase().includes(text)
      );
    }
    return filtered.slice(0, 12);
  }

  openEditUser(user: User) {
    this.selectedUser = user;
    this.showEditModal = true;
  }

  closeEditUser() {
    this.showEditModal = false;
    this.selectedUser = null;
  }

  onEditUserSave(edited: User) {
    if (!edited.id) return;
    // Convertir a Partial<User> & { id: number }
    const userUpdate: Partial<User> & { id: number } = { ...edited, id: edited.id };
    this.supabase.updateUser(userUpdate)
      .then((updated) => {
        // Actualizar en la lista local
        this.users = this.users.map(u => u.id === edited.id ? { ...u, ...updated } : u);
        this.closeEditUser();
        alert('Usuario actualizado correctamente');
      })
      .catch((error) => {
        alert('Error al actualizar usuario: ' + (error.message || error));
      });
  }

  deactivateUser(user: User) {
    const reason = prompt(`Motivo para desactivar a ${user.email}:`);
    if (!reason) return;
    this.supabase.deactivateUser(user.id!, reason)
      .then((res) => {
        alert(res.message);
        // Remove from active list or refresh deactivated view
        this.loadUsers();
      })
      .catch((error) => {
        console.error('❌ Error deactivating user:', error);
        alert(`Error al desactivar: ${error.message}`);
      });
  }

  reactivateUser(user: User) {
    const reason = prompt(`Motivo para reactivar a ${user.email}:`);
    if (!reason) return;
    this.supabase.reactivateUser(user.id!, reason)
      .then((res) => {
        alert(res.message);
        this.loadUsers();
      })
      .catch((error) => {
        console.error('❌ Error reactivating user:', error);
        alert(`Error al reactivar: ${error.message}`);
      });
  }
}
