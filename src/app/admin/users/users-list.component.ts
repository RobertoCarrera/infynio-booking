import { Component, OnInit, AfterViewInit, OnDestroy, ElementRef, ViewChild } from '@angular/core';
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
  @ViewChild('mobileListBlock', { read: ElementRef }) mobileListBlock!: ElementRef<HTMLElement>;
  private resizeHandler: any;
  private mutationObserver: MutationObserver | null = null;
  private debounceTimer: any = null;
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

  ngAfterViewInit() {
    // compute and expose offset for the mobile list so CSS can size it
    this.computeUsersListOffset();
    this.resizeHandler = () => this.scheduleComputeUsersListOffset();
    window.addEventListener('resize', this.resizeHandler);
    window.addEventListener('orientationchange', this.resizeHandler);

    // Observe DOM changes inside the parent container (e.g. loading/error/input changes)
    try {
      const parent = this.mobileListBlock?.nativeElement?.parentElement;
      if (parent) {
        this.mutationObserver = new MutationObserver(() => this.scheduleComputeUsersListOffset());
        this.mutationObserver.observe(parent, { childList: true, subtree: true, attributes: true });
      }
    } catch (e) {
      // ignore
    }
  }

  ngOnDestroy() {
    if (this.resizeHandler) window.removeEventListener('resize', this.resizeHandler);
    try { window.removeEventListener('orientationchange', this.resizeHandler); } catch (e) {}
    if (this.mutationObserver) {
      try { this.mutationObserver.disconnect(); } catch (e) {}
      this.mutationObserver = null;
    }
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
  }

  private computeUsersListOffset() {
    try {
      const el = this.mobileListBlock?.nativeElement;
      if (!el) return;

      // Prefer summing heights of preceding siblings inside the same parent. This
      // is more stable than rect.top when headers/margins or fixed elements exist.
      const parent = el.parentElement;
      let sum = 0;
      if (parent) {
        for (const child of Array.from(parent.children)) {
          if (child === el) break;
          const ce = child as HTMLElement;
          // include only visible elements
          const cs = window.getComputedStyle(ce);
          if (cs.display === 'none' || cs.visibility === 'hidden') continue;
          sum += ce.offsetHeight;
        }
      }

      // Fallback: if no parent or sum is 0, use rect.top as a best-effort value
      if (sum === 0) {
        const rect = el.getBoundingClientRect();
        sum = Math.max(0, Math.round(rect.top));
      }

      document.documentElement.style.setProperty('--users-list-offset', `${Math.round(sum)}px`);
    } catch (e) {}
  }

  private scheduleComputeUsersListOffset() {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.computeUsersListOffset();
      this.debounceTimer = null;
    }, 80);
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
  if ((data?.length ?? 0) > 0 || this.totalLoaded > 0) {
        // Apply client-side filter on the page fetched
  const completed = data || []; // backend enforces completeness now
        const text = this.filterText.trim().toLowerCase();
        const page = !text
          ? completed
          : completed.filter((user: any) =>
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
