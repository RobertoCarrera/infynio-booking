import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-cartera-info',
  standalone: true,  // Añade esta línea si no estaba
  imports: [FormsModule, CommonModule],
  templateUrl: './cartera-info.component.html',
  styleUrls: ['./cartera-info.component.css']
})
export class CarteraInfoComponent {
  @Input() bonos: any[] = [];
}