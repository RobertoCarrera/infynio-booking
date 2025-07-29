import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AdminComponent } from './admin.component';
import { UsersListComponent } from './users/users-list.component';
import { InviteUserComponent } from './users/invite-user.component';
import { AdminCarteraComponent } from './cartera/admin-cartera.component';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';

@NgModule({
  imports: [
    CommonModule,
    RouterModule,
    FormsModule,
    AdminComponent,
    UsersListComponent,
    InviteUserComponent,
    AdminCarteraComponent
  ]
})
export class AdminModule {}
