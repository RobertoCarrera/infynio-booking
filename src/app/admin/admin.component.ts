import { Component } from '@angular/core';
import { RouterModule } from '@angular/router';
import { UsersListComponent } from "./users/users-list.component";
import { CommonModule } from '@angular/common';
import { InviteUserComponent } from "./users/invite-user.component";

@Component({
  selector: 'app-admin',
  imports: [RouterModule, UsersListComponent, CommonModule, InviteUserComponent],
  templateUrl: './admin.component.html'
})
export class AdminComponent {
  showOriginalLayout: boolean = true;

  shouldShowOriginalLayout(): boolean {
    return this.showOriginalLayout;
  }

  toggleLayout(): void {
    this.showOriginalLayout = !this.showOriginalLayout;
  }
}
