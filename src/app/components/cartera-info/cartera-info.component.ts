import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-cartera-info',
  templateUrl: './cartera-info.component.html',
  styleUrls: ['./cartera-info.component.css']
})
export class CarteraInfoComponent {
  @Input() bonos: any[] = [];
}
