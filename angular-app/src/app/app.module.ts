import { BrowserModule } from '@angular/platform-browser';
import { NgModule } from '@angular/core';
import { HttpClientModule } from '@angular/common/http';
import { ReactiveFormsModule } from '@angular/forms';
import { FullCalendarModule } from '@fullcalendar/angular';

import { AppComponent } from './app.component';
import { DateSelectionComponent } from './date-selection/date-selection.component';
import { ClientFormComponent } from './client-form/client-form.component';
import { ResultsDisplayComponent } from './results-display/results-display.component';

@NgModule({
  declarations: [
    AppComponent,
    DateSelectionComponent,
    ClientFormComponent,
    ResultsDisplayComponent
  ],
  imports: [
    BrowserModule,
    HttpClientModule,
    ReactiveFormsModule,
    FullCalendarModule
  ],
  providers: [],
  bootstrap: [AppComponent]
})
export class AppModule { }
