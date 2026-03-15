import { Component } from '@angular/core';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})
export class AppComponent {
  title = 'Harpenden Arrows Handicap Timer';
  lightMode = false;

  toggleLightMode(): void {
    this.lightMode = !this.lightMode;
    document.body.classList.toggle('light-mode', this.lightMode);
    document.documentElement.classList.toggle('light-mode', this.lightMode);
  }
}
