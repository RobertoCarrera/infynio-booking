import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { MenuComponent } from './utils/menu.component';
import { CommonModule } from '@angular/common';
import { SupabaseService } from './services/supabase.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, MenuComponent, CommonModule],
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})
export class AppComponent {
  title = 'mars-studio';

  constructor(private supabaseService: SupabaseService) {
    // Exponer el servicio para facilitar acceso desde consola en desarrollo
    if (typeof window !== 'undefined') {
      SupabaseService.exposeToWindow(this.supabaseService);
    }
  }
}