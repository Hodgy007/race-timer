import { Injectable } from '@angular/core';
import { Observable, Subject } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class TimerService {
  private countdownTime: number = 2100; // default 35 minutes in seconds
  private remainingMs: number = this.countdownTime * 1000;
  private endTime: number = 0; // wall-clock timestamp (ms) when the countdown reaches zero
  private running: boolean = false;
  private tickInterval: any = null;
  private lastEmitted: number | null = null;
  private timerSubject: Subject<number> = new Subject<number>();

  startTimer(startTime?: number): Observable<number> {
    this.stopTimer();
    // If the caller's value matches the stored remainder this is a resume,
    // so keep the fractional milliseconds; otherwise adopt the new value.
    if (startTime !== undefined && startTime !== this.getRemainingSeconds()) {
      this.remainingMs = startTime * 1000;
    }
    this.endTime = Date.now() + this.remainingMs;
    this.running = true;
    this.lastEmitted = null;

    // The clock is anchored to endTime, so tick frequency only affects how
    // promptly the display updates — never accuracy. Remaining goes negative
    // past zero (overtime) so late finishers still get real times.
    this.tickInterval = setInterval(() => this.tick(), 100);

    return this.timerSubject.asObservable();
  }

  private tick(): void {
    this.remainingMs = this.endTime - Date.now();
    const remaining = Math.ceil(this.remainingMs / 1000);
    if (remaining !== this.lastEmitted) {
      this.lastEmitted = remaining;
      this.timerSubject.next(remaining);
    }
  }

  stopTimer(): void {
    if (this.running) {
      this.remainingMs = this.endTime - Date.now();
      this.running = false;
    }
    if (this.tickInterval) {
      clearInterval(this.tickInterval);
      this.tickInterval = null;
    }
  }

  resetTimer(): void {
    this.stopTimer();
    this.remainingMs = this.countdownTime * 1000;
    this.timerSubject.next(this.getRemainingSeconds());
  }

  setCountdownTime(seconds: number): void {
    this.countdownTime = seconds;
  }

  /** Remaining whole seconds computed live from the wall clock. */
  getRemainingSeconds(): number {
    const ms = this.running ? this.endTime - Date.now() : this.remainingMs;
    return Math.ceil(ms / 1000);
  }

  getTimerObservable(): Observable<number> {
    return this.timerSubject.asObservable();
  }
}
