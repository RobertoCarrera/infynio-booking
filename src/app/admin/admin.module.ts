import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AdminComponent } from './admin.component';
import { UsersListComponent } from './users/users-list.component';
import { InviteUserComponent } from './users/invite-user.component';
<<<<<<< HEAD
import { AdminUserPackagesComponent } from './admin-user-packages/admin-user-packages.component';
=======
import { AdminCarteraComponent } from './cartera/admin-cartera.component';
>>>>>>> fix-backend
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
<<<<<<< HEAD
    AdminUserPackagesComponent
=======
    AdminCarteraComponent
>>>>>>> fix-backend
  ]
})
export class AdminModule {}
