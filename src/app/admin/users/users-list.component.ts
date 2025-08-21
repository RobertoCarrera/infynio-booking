import { Component, OnInit } from '@angular/core';
import { SupabaseService } from '../../services/supabase.service';
import { User } from '../../models/user';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { EditUserModalComponent } from './edit-user-modal.component';

@Component({
  selector: 'app-users-list',
  templateUrl: './users-list.component.html',
  styleUrls: ['./users-list.component.css'],
  imports: [CommonModule, FormsModule, EditUserModalComponent]
})
export class UsersListComponent implements OnInit {
  users: User[] = [];
  totalLoaded = 0;
  pageSize = 20;
  hasMore = true;
  loading = true;
  error: string | null = null;
  filterText: string = '';
  selectedUser: User | null = null;
  showEditModal = false;
  showDeactivated = false;

  constructor(private supabase: SupabaseService) {}

  ngOnInit() {
    this.resetAndLoad();
  }

  resetAndLoad() {
  this.users = [];
  this.totalLoaded = 0;
  this.hasMore = true;
  // Ensure first page isn't blocked by the loading guard
  this.loading = false;
  this.loadNextPage();
  }

  async loadNextPage() {
    if (this.loading) return;
    this.loading = true;
    try {
      const { data, error } = await this.supabase.getUsersPaged({
        roleId: 2,
        offset: this.totalLoaded,
        limit: this.pageSize,
        deactivatedOnly: this.showDeactivated,
      });
      if (error) throw error;
      if ((data?.length ?? 0) < this.pageSize) {
        this.hasMore = false;
      }
      // If first page returns empty, fall back to legacy fetch to avoid blank UI
      if ((data?.length ?? 0) === 0 && this.totalLoaded === 0) {
  const legacy = this.showDeactivated ? await this.supabase.getDeactivatedUsers() : await this.supabase.getAllUsers();
        const all = (legacy?.data || []).filter((u: any) => (u.role_id ?? 0) == 2);
        const text0 = this.filterText.trim().toLowerCase();
        this.users = !text0
          ? all
          : all.filter((user: any) =>
              (user.surname || '').toLowerCase().includes(text0) ||
              (user.name || '').toLowerCase().includes(text0) ||
              (user.email || '').toLowerCase().includes(text0)
            );
  this.totalLoaded = all.length;
  this.hasMore = false; // legacy fetch loads everything
      } else {
        // Apply client-side filter on the page fetched
        const text = this.filterText.trim().toLowerCase();
        const page = !text
          ? data
          : data.filter((user: any) =>
              (user.surname || '').toLowerCase().includes(text) ||
              (user.name || '').toLowerCase().includes(text) ||
              (user.email || '').toLowerCase().includes(text)
            );
        this.users = [...this.users, ...page];
  this.totalLoaded += data.length; // increment by raw page size fetched
      }
    } catch (e: any) {
      this.error = 'Error al cargar usuarios';
    } finally {
      this.loading = false;
    }
  }

  // All users filtered by search text (no role or slice applied yet)
  get filteredUsers(): User[] {
    const text = this.filterText.trim().toLowerCase();
    if (!text) return this.users;
    return this.users.filter(user =>
      (user.surname || '').toLowerCase().includes(text) ||
      (user.name || '').toLowerCase().includes(text) ||
      (user.email || '').toLowerCase().includes(text)
    );
  }

  // Only "normal" users (role_id == 2), after text filter
  get filteredNormalUsers(): User[] {
    return (this.filteredUsers || []).filter(u => (u as any).role_id == 2);
  }

  // List to display (limit to 12 for pagination-like UX)
  get displayedUsers(): User[] {
    return this.filteredNormalUsers;
  }

  onScrollEndMobile(ev: Event) {
    const el = ev.target as HTMLElement;
    if (!el) return;
    const nearBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 24;
    if (nearBottom) this.loadNextPage();
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
  // Refresh list
  this.resetAndLoad();
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
  this.resetAndLoad();
      })
      .catch((error) => {
        console.error('❌ Error reactivating user:', error);
        alert(`Error al reactivar: ${error.message}`);
      });
  }

  onFilterChange(_: string) {
    // Restart pagination when filter changes
    this.resetAndLoad();
  }
}
