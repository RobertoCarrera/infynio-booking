import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ClassTypesService, ClassType } from '../../services/class-types.service';

@Component({
  selector: 'app-class-types',
  templateUrl: './class-types.component.html',
  styleUrls: ['./class-types.component.css'],
  standalone: true,
  imports: [CommonModule],
})
export class ClassTypesComponent implements OnInit {
  classTypes: ClassType[] = [];
  loading = true;
  error = '';

  constructor(private classTypesService: ClassTypesService) {}

  ngOnInit() {
    this.classTypesService.getAll().subscribe({
      next: (types) => {
        this.classTypes = types;
        this.loading = false;
      },
      error: (err) => {
        this.error = 'Error al cargar los tipos de clase';
        this.loading = false;
      }
    });
  }
}
