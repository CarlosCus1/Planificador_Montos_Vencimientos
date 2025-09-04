import { Component, OnInit, Output, EventEmitter, ViewChild } from '@angular/core';
import { CalendarOptions, DateSelectArg } from '@fullcalendar/core';
import interactionPlugin from '@fullcalendar/interaction';
import dayGridPlugin from '@fullcalendar/daygrid';
import { ApiService } from '../api.service';
import { FullCalendarComponent } from '@fullcalendar/angular';

@Component({
  selector: 'app-date-selection',
  templateUrl: './date-selection.component.html',
  styleUrls: ['./date-selection.component.css']
})
export class DateSelectionComponent implements OnInit {
  @Output() selectionChange = new EventEmitter<string[]>();
  @ViewChild('calendar') calendarComponent: FullCalendarComponent;

  calendarOptions: CalendarOptions;
  selectedDates: Set<string> = new Set();
  holidays: Set<string> = new Set();

  constructor(private apiService: ApiService) { }

  ngOnInit(): void {
    this.fetchHolidays();
    this.calendarOptions = {
      plugins: [interactionPlugin, dayGridPlugin],
      initialView: 'dayGridMonth',
      locale: 'es',
      headerToolbar: {
        left: 'prev,today,next',
        center: 'title',
        right: ''
      },
      buttonText: { today: 'Hoy' },
      selectable: true,
      select: this.handleDateSelect.bind(this),
      selectAllow: this.isDateSelectable.bind(this),
      dayCellClassNames: this.getDayCellClassNames.bind(this)
    };
  }

  fetchHolidays() {
    const year = new Date().getFullYear();
    this.apiService.getHolidays(year).subscribe((holidays: any[]) => {
      this.holidays = new Set(holidays.map(h => h.date));
      // We might need to refresh the calendar display if it has already rendered
      if (this.calendarComponent) {
        this.calendarComponent.getApi().render();
      }
    });
  }

  isDateSelectable(selectInfo: { start: Date, end: Date }): boolean {
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Normalize today to the start of the day

    const start = selectInfo.start;
    const isSunday = start.getDay() === 0;
    const isPast = start < today;
    const isHoliday = this.holidays.has(this.formatDate(start));

    return !isSunday && !isPast && !isHoliday;
  }

  handleDateSelect(selectInfo: DateSelectArg) {
    const dateStr = this.formatDate(selectInfo.start);
    if (this.selectedDates.has(dateStr)) {
      this.selectedDates.delete(dateStr);
    } else {
      this.selectedDates.add(dateStr);
    }
    this.selectionChange.emit(Array.from(this.selectedDates));
    this.calendarComponent.getApi().unselect();
    this.calendarComponent.getApi().render(); // Re-render to apply new classes
  }

  getDayCellClassNames(arg: { date: Date, isToday: boolean }): string[] {
    const dateStr = this.formatDate(arg.date);
    const classes = [];
    if (this.holidays.has(dateStr)) {
      classes.push('fc-holiday');
    }
    if (this.selectedDates.has(dateStr)) {
      classes.push('fc-day-selected');
    }
    return classes;
  }

  clearSelection() {
    this.selectedDates.clear();
    this.selectionChange.emit([]);
    this.calendarComponent.getApi().render(); // Re-render to remove classes
  }

  private formatDate(date: Date): string {
    return date.toISOString().split('T')[0];
  }
}
