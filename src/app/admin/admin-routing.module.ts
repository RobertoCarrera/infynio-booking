import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { AdminComponent } from './admin.component';
import { UsersListComponent } from './users/users-list.component';
import { InviteUserComponent } from './users/invite-user.component';
import { AdminCarteraComponent } from './cartera/admin-cartera.component';
import { AdminClassSchedulesComponent } from './class-schedules/admin-class-schedules.component';
import { AdminGuard } from '../guards/admin.guard';

const routes: Routes = [
  {
    path: '',
    component: AdminComponent,
    canActivate: [AdminGuard],
    children: [
      { path: 'users', component: UsersListComponent },
      { path: 'invite', component: InviteUserComponent },
      { path: 'cartera', component: AdminCarteraComponent },
      { path: 'schedules', component: AdminClassSchedulesComponent },
      { path: '', redirectTo: 'users', pathMatch: 'full' }
    ]
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class AdminRoutingModule {}
