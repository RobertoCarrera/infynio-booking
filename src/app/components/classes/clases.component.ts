import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ClassesService, Clase } from '../../services/classes.service';

@Component({
  selector: 'app-clases',
  templateUrl: './clases.component.html',
  styleUrls: ['./clases.component.css'],
  standalone: true,
  imports: [CommonModule],
})
export class ClasesComponent implements OnInit {
  clases: Clase[] = [];
  loading = true;
  error = '';

  constructor(private classesService: ClassesService) {}

  ngOnInit() {
    this.classesService.getAll()
      .subscribe({
        next: (clases) => {
          this.clases = clases;
          this.loading = false;
        },
        error: (err) => {
          this.error = 'Error al cargar las clases';
          this.loading = false;
        }
      });
  }
}
