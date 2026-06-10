import { Component, OnInit, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef, ViewChild } from '@angular/core';
import { TimerService } from '../../services/timer.service';
import { RunnerListComponent } from '../runner-list/runner-list.component';
import { Subscription } from 'rxjs';

type TimerStatus = 'ready' | 'live' | 'overtime' | 'paused';

@Component({
  selector: 'app-timer',
  templateUrl: './timer.component.html',
  styleUrls: ['./timer.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class TimerComponent implements OnInit, OnDestroy {
  @ViewChild(RunnerListComponent) runnerList!: RunnerListComponent;

  countdownTime: number = 2100; // 35 minutes in seconds
  remainingTime: number = this.countdownTime;
  isRunning: boolean = false;
  checkIns: { number: number; time: string; remainingSeconds: number }[] = [];
  private timerSubscription: Subscription | null = null;
  private wakeLock: { release: () => Promise<void> } | null = null;
  private readonly onVisibilityChange = () => {
    // Wake locks are released by the OS when the page is hidden; reacquire.
    if (document.visibilityState === 'visible' && this.isRunning) {
      this.acquireWakeLock();
    }
  };

  constructor(private timerService: TimerService, private changeDetectorRef: ChangeDetectorRef) {}

  ngOnInit(): void {
    document.addEventListener('visibilitychange', this.onVisibilityChange);
  }

  get hasStarted(): boolean {
    return this.remainingTime < this.countdownTime;
  }

  get status(): TimerStatus {
    if (this.isRunning) return this.remainingTime <= 0 ? 'overtime' : 'live';
    return this.hasStarted ? 'paused' : 'ready';
  }

  get statusLabel(): string {
    return { ready: 'Ready', live: 'Live', overtime: 'Overtime', paused: 'Paused' }[this.status];
  }

  get elapsedTime(): number {
    return this.countdownTime - this.remainingTime;
  }

  get remainingLabel(): string {
    if (this.remainingTime > 0) return this.formatTime(this.remainingTime) + ' left';
    if (this.remainingTime < 0) return '+' + this.formatTime(-this.remainingTime) + ' over';
    return '00:00 left';
  }

  startTimer(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.acquireWakeLock();
    this.timerSubscription = this.timerService.startTimer(this.remainingTime).subscribe((time: number) => {
      this.remainingTime = time;
      this.changeDetectorRef.markForCheck();
    });
  }

  stopTimer(): void {
    this.isRunning = false;
    this.timerService.stopTimer();
    if (this.timerSubscription) {
      this.timerSubscription.unsubscribe();
      this.timerSubscription = null;
    }
    this.releaseWakeLock();
  }

  resetTimer(): void {
    const hasData = this.hasStarted || this.checkIns.length > 0 || this.runnerList?.hasRaceData();
    if (hasData && !confirm('Reset the timer? This will clear all alerts, race positions and finish times.')) return;
    this.stopTimer();
    this.checkIns = [];
    this.remainingTime = this.countdownTime;
    this.timerService.resetTimer();
    this.runnerList.resetRaceData();
  }

  get arcOffset(): number {
    const circumference = 2 * Math.PI * 88; // r=88
    const progress = this.countdownTime > 0
      ? Math.min(1, Math.max(0, this.elapsedTime / this.countdownTime))
      : 0;
    return circumference * (1 - progress);
  }

  formatTime(seconds: number): string {
    const sign = seconds < 0 ? '-' : '';
    const abs = Math.abs(seconds);
    const minutes = Math.floor(abs / 60);
    const secs = abs % 60;
    return `${sign}${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }

  onMaxExpectedTimeChange(maxTime: number): void {
    if (maxTime > 0 && !this.isRunning && !this.hasStarted) {
      this.countdownTime = maxTime;
      this.remainingTime = maxTime;
      this.timerService.setCountdownTime(maxTime);
      this.changeDetectorRef.markForCheck();
    }
  }

  recordCheckIn(): void {
    if (!this.hasStarted) return;
    // Read the clock live rather than the last emitted tick so the recorded
    // time is the moment the button was pressed.
    const remaining = this.isRunning ? this.timerService.getRemainingSeconds() : this.remainingTime;
    const checkInNumber = this.checkIns.length + 1;
    // New array reference so the child's ngOnChanges fires even while paused.
    this.checkIns = [...this.checkIns, {
      number: checkInNumber,
      time: this.formatTime(remaining),
      remainingSeconds: remaining
    }];
  }

  private acquireWakeLock(): void {
    const wakeLockApi = (navigator as any).wakeLock;
    if (!wakeLockApi) return;
    wakeLockApi.request('screen')
      .then((lock: { release: () => Promise<void> }) => { this.wakeLock = lock; })
      .catch(() => { /* best effort — e.g. battery saver may refuse */ });
  }

  private releaseWakeLock(): void {
    this.wakeLock?.release().catch(() => {});
    this.wakeLock = null;
  }

  ngOnDestroy(): void {
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    this.timerService.stopTimer();
    if (this.timerSubscription) {
      this.timerSubscription.unsubscribe();
    }
    this.releaseWakeLock();
  }
}
