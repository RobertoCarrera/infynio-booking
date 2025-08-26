import { Component, OnInit, OnDestroy } from '@angular/core';
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
export class AppComponent implements OnInit, OnDestroy {
  title = 'mars-studio';
  private _resizeHandler = () => this.updateVh();
  private _visibilityHandler = () => this.updateVh();

  constructor(private supabaseService: SupabaseService) {
    // Exponer el servicio para facilitar acceso desde consola en desarrollo
    if (typeof window !== 'undefined') {
      SupabaseService.exposeToWindow(this.supabaseService);
    }
  }

  ngOnInit(): void {
    // set initial --vh and keep updated for mobile address bar handling
    this.updateVh();
    if (typeof window !== 'undefined') {
      window.addEventListener('resize', this._resizeHandler, { passive: true });
      window.addEventListener('orientationchange', this._resizeHandler, { passive: true });
      document.addEventListener('visibilitychange', this._visibilityHandler);
      // also listen to visualViewport resize if available for better accuracy
      if ((window as any).visualViewport && (window as any).visualViewport.addEventListener) {
        (window as any).visualViewport.addEventListener('resize', this._resizeHandler);
      }
    }
  }

  ngOnDestroy(): void {
    if (typeof window !== 'undefined') {
      window.removeEventListener('resize', this._resizeHandler);
      window.removeEventListener('orientationchange', this._resizeHandler);
      document.removeEventListener('visibilitychange', this._visibilityHandler);
      if ((window as any).visualViewport && (window as any).visualViewport.removeEventListener) {
        (window as any).visualViewport.removeEventListener('resize', this._resizeHandler);
      }
    }
  }

  private updateVh() {
    try {
      const vh = window.innerHeight * 0.01;
      document.documentElement.style.setProperty('--vh', `${vh}px`);
    } catch (e) {
      // ignore in non-browser contexts
    }
  }
}