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
export class UsersListComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('mobileListBlock', { read: ElementRef }) mobileListBlock!: ElementRef<HTMLElement>;
  @ViewChild('tableContainer', { read: ElementRef }) tableContainer!: ElementRef<HTMLElement>;
  private resizeHandler: any;
  private mutationObserver: MutationObserver | null = null;
  private debounceTimer: any = null;
  private tableScrollHandler: any = null;
  private desktopAutoLoadTimer: any = null;
  private desktopAutoLoading = false;
  private lastScrollTs = 0;
  private lastMobileScrollTs = 0;
  users: User[] = [];
  totalLoaded = 0;
  pageSize = 20;
  hasMore = true;
  loading = true;
  loadingMore = false;
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

    // attach desktop scroll listener to container to emulate infinite scroll on large screens
    try {
      const tableEl = this.tableContainer?.nativeElement;
      if (tableEl) {
        this.tableScrollHandler = () => this.onDesktopScroll();
        // Listen to scrolls on the container itself (desktop uses an internal scrollbar)
        tableEl.addEventListener('scroll', this.tableScrollHandler, { passive: true });
        // Also keep window scroll as a fallback for layouts where the page scrolls
        window.addEventListener('scroll', this.tableScrollHandler, { passive: true });
        window.addEventListener('resize', this.tableScrollHandler);
      }
    } catch (e) {}

  // Note: we intentionally do NOT auto-fill the desktop viewport here.
  // The list will load the first page and further pages will be loaded on scroll.
  }

  ngOnDestroy() {
    if (this.resizeHandler) window.removeEventListener('resize', this.resizeHandler);
    try { window.removeEventListener('orientationchange', this.resizeHandler); } catch (e) {}
    if (this.mutationObserver) {
      try { this.mutationObserver.disconnect(); } catch (e) {}
      this.mutationObserver = null;
    }
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    if (this.tableScrollHandler) {
      try { window.removeEventListener('scroll', this.tableScrollHandler); } catch (e) {}
      try { window.removeEventListener('resize', this.tableScrollHandler); } catch (e) {}
      try {
        const tableEl = this.tableContainer?.nativeElement;
        if (tableEl) tableEl.removeEventListener('scroll', this.tableScrollHandler);
      } catch (e) {}
    }
  }

  private onDesktopScroll() {
    try {
  const now = Date.now();
  if (now - this.lastScrollTs < 200) return; // 200ms debounce
  this.lastScrollTs = now;
      if (!this.tableContainer) return;
      if (!this.hasMore || this.loading) return;
      const tableEl = this.tableContainer.nativeElement as HTMLElement;

      // If the container itself is scrollable (has an internal scrollbar), use its scroll position
      if (tableEl.scrollHeight > tableEl.clientHeight) {
        const nearBottom = tableEl.scrollTop + tableEl.clientHeight >= tableEl.scrollHeight - 200;
        if (nearBottom) this.loadNextPage();
        return;
      }

      // Otherwise fall back to checking container position relative to viewport
      const rect = tableEl.getBoundingClientRect();
      const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
      if (rect.bottom - viewportHeight <= 200) {
        this.loadNextPage();
      }
    } catch (e) {}
  }

  private scheduleDesktopAutoLoad() {
    if (this.desktopAutoLoadTimer) clearTimeout(this.desktopAutoLoadTimer);
    this.desktopAutoLoadTimer = setTimeout(() => this.performDesktopAutoLoad(), 120);
  }

  private async performDesktopAutoLoad() {
    try {
      if (this.desktopAutoLoading) return;
      // Only run on large screens where table is visible
      if (window.innerWidth < 992) return;
      const tableEl = this.tableContainer?.nativeElement;
      if (!tableEl) return;

      this.desktopAutoLoading = true;
      const threshold = 200;
      const rect = tableEl.getBoundingClientRect();
      const viewportHeight = window.innerHeight || document.documentElement.clientHeight;

      // If the table bottom is within viewport + threshold, attempt to load one page only.
      if (this.hasMore && !this.loading && (rect.bottom <= viewportHeight + threshold)) {
        await this.loadNextPage();
      }
    } catch (e) {
      // ignore
    } finally {
      this.desktopAutoLoading = false;
    }
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
  this.loadingMore = false;
  this.loadNextPage();
  }

  async loadNextPage() {
    if (this.loading || this.loadingMore) return;
    // Use `loading` for the very first page, and `loadingMore` for subsequent pages
    const isFirstPage = this.totalLoaded === 0;
    if (isFirstPage) {
      this.loading = true;
    } else {
      this.loadingMore = true;
    }
    try {
      const { data, error } = await this.supabase.getUsersPaged({
        roleId: 2,
        offset: this.totalLoaded,
        limit: this.pageSize,
        deactivatedOnly: this.showDeactivated,
      });
      if (error) throw error;
      const fetched = data || [];
      const fetchedCount = fetched.length;
      if (fetchedCount < this.pageSize) {
        this.hasMore = false;
      }

      // Apply client-side filter on the page fetched
      if (fetchedCount > 0 || this.totalLoaded > 0) {
        const text = this.filterText.trim().toLowerCase();
        const page = !text
          ? fetched
          : fetched.filter((user: any) =>
              (user.surname || '').toLowerCase().includes(text) ||
              (user.name || '').toLowerCase().includes(text) ||
              (user.email || '').toLowerCase().includes(text)
            );
        this.users = [...this.users, ...page];
      }

      // Safely increment totalLoaded by the actual number of records fetched
      this.totalLoaded += fetchedCount;
    } catch (e: any) {
      this.error = 'Error al cargar usuarios';
    } finally {
  // clear the appropriate flag
  this.loading = false;
  this.loadingMore = false;
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
  if (!nearBottom) return;
  const now = Date.now();
  // Debounce mobile scroll to avoid double-triggers at the end
  if (now - this.lastMobileScrollTs < 200) return;
  this.lastMobileScrollTs = now;
  // Guard: don't trigger if already loading or no more pages
  if (!this.hasMore || this.loading || this.loadingMore) return;
  this.loadNextPage();
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
