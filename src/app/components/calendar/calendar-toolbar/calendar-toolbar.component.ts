import { Component, EventEmitter, Output, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-calendar-toolbar',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './calendar-toolbar.component.html',
  styleUrls: ['./calendar-toolbar.component.css']
})
export class CalendarToolbarComponent {
  @Input() currentRangeLabel: string | null = null;
  @Input() currentView: string | null = null;
  @Input() filtersCollapsed: boolean | null = null;
  // optional input to hide month controls on small screens
  @Input() isMobile: boolean | null = null;

  @Output() prev = new EventEmitter<void>();
  @Output() next = new EventEmitter<void>();
  @Output() today = new EventEmitter<void>();
  @Output() changeView = new EventEmitter<string>();
  @Output() toggleFilters = new EventEmitter<void>();

  // ripple flag for small micro-interaction
  rippleActive = false;

  onPrev() { this.prev.emit(); }
  onNext() { this.next.emit(); }
  onToday() { this.today.emit(); }
  onChangeView(v: string) { this.changeView.emit(v); }
  onToggleFilters() { this.toggleFilters.emit(); }
  // wrapper to show ripple micro-interaction then emit
  onToggleFiltersWithRipple() {
    try {
      this.rippleActive = true;
      setTimeout(() => { this.rippleActive = false; }, 260);
    } catch (e) {}
    this.onToggleFilters();
  }
}