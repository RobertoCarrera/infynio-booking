import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AdminComponent } from './admin.component';
import { UsersListComponent } from './users/users-list.component';
import { InviteUserComponent } from './users/invite-user.component';
import { AdminCarteraComponent } from './cartera/admin-cartera.component';
import { AdminClassSchedulesComponent } from './class-schedules/admin-class-schedules.component';
import { RouterModule } from '@angular/router';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { AdminRoutingModule } from './admin-routing.module';

@NgModule({
  imports: [
    CommonModule,
    RouterModule,
    FormsModule,
    ReactiveFormsModule,
    AdminRoutingModule,
    AdminComponent,
    UsersListComponent,
    InviteUserComponent,
    AdminCarteraComponent,
    AdminClassSchedulesComponent
  ]
})
export class AdminModule {}
