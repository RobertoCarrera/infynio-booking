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

  deleteUser(user: User) {
    // Confirmación antes de borrar
    const confirmMessage = `¿Estás seguro de que quieres eliminar al usuario "${user.email}"?\n\nEsta acción no se puede deshacer.`;
    
    if (!confirm(confirmMessage)) {
      return;
    }

    console.log('🔄 Deleting user:', user.email);
    
    this.supabase.deleteUser(user.id!)
      .then((result) => {
        console.log('✅ User deleted:', result);
        
        // Remover el usuario de la lista local
        this.users = this.users.filter(u => u.id !== user.id);
        
        // Mostrar mensaje de éxito (podrías usar un toast o alert)
        alert(result.message);
      })
      .catch((error) => {
        console.error('❌ Error deleting user:', error);
        alert(`Error al eliminar usuario: ${error.message}`);
      });
  }
}
