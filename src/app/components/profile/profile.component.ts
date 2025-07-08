import { CommonModule } from '@angular/common';
import { Component, Input, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { UsersService } from '../../services/users.service';

export interface ClientProfile {
  nombre: string;
  apellidos: string;
  email: string;
  telefono: string;
  bonosRestantes?: number;
}

@Component({
  selector: 'app-profile',
  imports: [CommonModule, FormsModule],
  templateUrl: './profile.component.html',
  styleUrls: ['./profile.component.css']
})
export class ProfileComponent implements OnInit {
  @Input() cliente!: ClientProfile;
  users: ClientProfile[] = [];
  selectedUser?: ClientProfile;

  constructor(private usersService: UsersService) {}

  ngOnInit() {
    this.usersService.getAll().subscribe(users => {
      this.users = users;
      this.selectedUser = users[0]; // Selecciona el primero por defecto
    });
  }
}
