import { Component } from '@angular/core';
import { RouterModule } from '@angular/router';
import { UsersListComponent } from "./users/users-list.component";
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-admin',
  imports: [RouterModule, UsersListComponent, CommonModule],
  templateUrl: './admin.component.html'
})
export class AdminComponent {
    
}
