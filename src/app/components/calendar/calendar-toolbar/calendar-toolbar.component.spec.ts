import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CalendarToolbarComponent } from './calendar-toolbar.component';

describe('CalendarToolbarComponent', () => {
  let component: CalendarToolbarComponent;
  let fixture: ComponentFixture<CalendarToolbarComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CalendarToolbarComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(CalendarToolbarComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
