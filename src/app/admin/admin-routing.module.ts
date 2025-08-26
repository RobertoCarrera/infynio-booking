import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { AdminComponent } from './admin.component';
import { UsersListComponent } from './users/users-list.component';
import { InviteUserComponent } from './users/invite-user.component';
import { AdminCarteraComponent } from './cartera/admin-cartera.component';
import { AdminCalendarComponent } from './calendar/admin-calendar.component';
import { AdminUserPackagesComponent } from './admin-user-packages/admin-user-packages.component';
import { AdminGuard } from '../guards/admin.guard';

const routes: Routes = [
  {
    path: '',
    component: AdminComponent,
    canActivate: [AdminGuard],
    children: [
  { path: 'user-packages', component: AdminUserPackagesComponent },
      { path: 'users', component: UsersListComponent },
      { path: 'invite', component: InviteUserComponent },
      { path: 'cartera', component: AdminCarteraComponent },
      { path: 'calendar', component: AdminCalendarComponent },
      { path: '', redirectTo: 'users', pathMatch: 'full' }
    ]
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class AdminRoutingModule {}
