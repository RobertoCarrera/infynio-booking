import { Component, Input, Output, EventEmitter, ElementRef, AfterViewInit, OnDestroy, Renderer2 } from '@angular/core';
import { User } from '../../models/user';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-edit-user-modal',
  templateUrl: './edit-user-modal.component.html',
  styleUrls: ['./edit-user-modal.component.css'],
  standalone: true,
  imports: [CommonModule, FormsModule]
})
export class EditUserModalComponent {
  @Input() user: User | null = null;
  @Input() show = false;
  @Output() save = new EventEmitter<User>();
  @Output() close = new EventEmitter<void>();

  editedUser: User | null = null;

  constructor(private el: ElementRef, private renderer: Renderer2) {}

  private _appendedToBody = false;

  ngOnChanges() {
    this.editedUser = this.user ? { ...this.user } : null;
  }

  ngAfterViewInit() {
    // move the modal root element to document.body to avoid being clipped by transformed ancestors
    try {
      const host = (this as any).el?.nativeElement || null;
      if (host && !this._appendedToBody) {
        document.body.appendChild(host);
        this._appendedToBody = true;
      }
    } catch (e) {}
  }

  ngOnDestroy() {
    try {
      const host = (this as any).el?.nativeElement || null;
      if (host && this._appendedToBody && host.parentNode) {
        host.parentNode.removeChild(host);
        this._appendedToBody = false;
      }
    } catch (e) {}
  }

  onSave() {
    if (this.editedUser) {
      this.save.emit(this.editedUser);
    }
  }

  onClose() {
    this.close.emit();
  }
}
