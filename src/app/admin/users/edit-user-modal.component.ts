import { Component, Input, Output, EventEmitter } from '@angular/core';
import { User } from '../../models/user';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-edit-user-modal',
  templateUrl: './edit-user-modal.component.html',
  standalone: true,
  imports: [CommonModule, FormsModule]
})
export class EditUserModalComponent {
  @Input() user: User | null = null;
  @Input() show = false;
  @Output() save = new EventEmitter<User>();
  @Output() close = new EventEmitter<void>();

  editedUser: User | null = null;

  ngOnChanges() {
    this.editedUser = this.user ? { ...this.user } : null;
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
