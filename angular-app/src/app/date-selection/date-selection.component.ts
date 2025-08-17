import { Component } from '@angular/core';
import { CalendarOptions, DateSelectArg, EventClickArg } from '@fullcalendar/core';
import interactionPlugin from '@fullcalendar/interaction';
import dayGridPlugin from '@fullcalendar/daygrid';

@Component({
  selector: 'app-date-selection',
  templateUrl: './date-selection.component.html',
  styleUrls: ['./date-selection.component.css']
})
export class DateSelectionComponent {

  calendarOptions: CalendarOptions = {
    plugins: [interactionPlugin, dayGridPlugin],
    initialView: 'dayGridMonth',
    locale: 'es',
    headerToolbar: {
      left: 'prev,today,next',
      center: 'title',
      right: ''
    },
    buttonText: {
      today: 'Hoy'
    },
    weekends: true,
    selectable: true,
    select: this.handleDateSelect.bind(this),
    // eventClick: this.handleEventClick.bind(this),
    // events: [
    //   { title: 'Feriado', date: '2024-07-28' }
    // ]
  };

  constructor() { }

  handleDateSelect(selectInfo: DateSelectArg) {
    const title = prompt('Please enter a new title for your event');
    const calendarApi = selectInfo.view.calendar;

    calendarApi.unselect(); // clear date selection

    if (title) {
      // This is where we would add the date to our state
      console.log(`Date selected: ${selectInfo.startStr}, title: ${title}`);
    }
  }

  // handleEventClick(clickInfo: EventClickArg) {
  //   if (confirm(`Are you sure you want to delete the event '${clickInfo.event.title}'`)) {
  //     clickInfo.event.remove();
  //   }
  // }
}
