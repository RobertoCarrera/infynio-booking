import { Component } from '@angular/core';
import { RouterModule } from '@angular/router';
import { CommonModule } from '@angular/common';
import { CarteraInfoComponent } from '../components/cartera-info/cartera-info.component';

@Component({
  selector: 'app-menu',
  imports: [RouterModule, CarteraInfoComponent, CommonModule],
  templateUrl: './menu.component.html',
  styleUrls: ['./menu.component.css']
})
export class MenuComponent {
  bonos = [
    { nombre: 'Bono 1', valor: 'Activo' },
    { nombre: 'Bono 2', valor: 'Activo' }
  ];
  showTooltip = false;
}
