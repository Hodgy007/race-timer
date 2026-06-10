import { Component, Input, OnChanges, OnDestroy, OnInit, Output, EventEmitter, ChangeDetectorRef, SimpleChanges } from '@angular/core';
import { RunnerStorageService, StoredRunner } from '../../services/runner-storage.service';

interface RunnerAlert {
  runnerName: string;
  countdown: number;
  isGo: boolean;
  id: string;
  runner: StoredRunner;
}

@Component({
  selector: 'app-runner-list',
  templateUrl: './runner-list.component.html',
  styleUrls: ['./runner-list.component.css']
})
export class RunnerListComponent implements OnInit, OnChanges, OnDestroy {
  @Input() remainingTime: number = 0;
  @Input() countdownTime: number = 1800;
  @Input() checkIns: { number: number; time: string; remainingSeconds: number }[] = [];
  @Output() maxExpectedTimeChange = new EventEmitter<number>();

  runners: StoredRunner[] = [];
  runnerName: string = '';
  expectedTime: string = '';
  runnerAlerts: RunnerAlert[] = [];

  gapValues: string[] = [];
  editingCell: { runner: StoredRunner; field: 'name' | 'expectedTime' | 'racePosition' } | null = null;
  editingValue: string = '';
  private alertTimeouts: any[] = [];
  private lastAlertTick: number | null = null;

  soundEnabled: boolean = true;
  private audioCtx: AudioContext | null = null;
  private readonly SOUND_KEY = 'harpenden_sound_enabled';

  showBulkImport: boolean = false;
  bulkRunnerData: string = '';

  constructor(private storageService: RunnerStorageService, private cdr: ChangeDetectorRef) {}

  trackByRunner(index: number, runner: StoredRunner): StoredRunner {
    return runner;
  }

  trackByCheckIn(index: number, checkIn: { number: number }): number {
    return checkIn.number;
  }

  addRunner(): void {
    const timeParts = this.expectedTime.split(':');
    if (timeParts.length !== 2) {
      alert('Please enter time in mm:ss format');
      return;
    }
    
    const minutes = parseInt(timeParts[0], 10);
    const seconds = parseInt(timeParts[1], 10);
    
    if (isNaN(minutes) || isNaN(seconds) || seconds > 59) {
      alert('Invalid time format. Please use mm:ss');
      return;
    }

    const totalExpectedSeconds = minutes * 60 + seconds;
    if (this.runnerName && totalExpectedSeconds > 0) {
      const actualTime = this.countdownTime - totalExpectedSeconds;
      this.runners.push({
        name: this.runnerName,
        expectedTime: totalExpectedSeconds,
        actualTime: actualTime,
        alerted: false,
        preAlerted: false
      });
      this.runnerName = '';
      this.expectedTime = '';
      this.sortRunners();
      this.storageService.saveRunners(this.runners);
    }
  }

  ngOnInit(): void {
    this.runners = this.storageService.loadRunners();
    this.sortRunners();
    try {
      this.soundEnabled = localStorage.getItem(this.SOUND_KEY) !== '0';
    } catch {
      this.soundEnabled = true;
    }
  }

  toggleSound(): void {
    this.soundEnabled = !this.soundEnabled;
    try {
      localStorage.setItem(this.SOUND_KEY, this.soundEnabled ? '1' : '0');
    } catch { /* storage unavailable — preference just won't persist */ }
    if (this.soundEnabled) this.ensureAudio();
  }

  private sortRunners(): void {
    this.runners.sort((a, b) => {
      const aPos = a.racePosition ?? Infinity;
      const bPos = b.racePosition ?? Infinity;
      if (aPos !== bPos) return aPos - bPos;
      return b.expectedTime - a.expectedTime;
    });
    const max = this.runners.length > 0 ? Math.max(...this.runners.map(r => r.expectedTime)) : 0;
    this.maxExpectedTimeChange.emit(max);
    this.computeGapValues();
  }

  removeRunner(runner: StoredRunner): void {
    const index = this.runners.indexOf(runner);
    if (index >= 0) {
      this.runners.splice(index, 1);
      this.sortRunners();
      this.storageService.saveRunners(this.runners);
    }
  }

  startCellEdit(runner: StoredRunner, field: 'name' | 'expectedTime' | 'racePosition'): void {
    this.editingCell = { runner, field };
    if (field === 'name') {
      this.editingValue = runner.name;
    } else if (field === 'expectedTime') {
      this.editingValue = this.formatTime(runner.expectedTime);
    } else if (field === 'racePosition') {
      this.editingValue = runner.racePosition?.toString() ?? '';
    }
    setTimeout(() => {
      const input = document.querySelector('.cell-edit-input') as HTMLInputElement;
      if (input) input.focus();
    }, 0);
  }

  saveCellEdit(): void {
    if (!this.editingCell) return;
    const { runner, field } = this.editingCell;

    if (field === 'name') {
      if (this.editingValue.trim()) {
        runner.name = this.editingValue.trim();
      }
    } else if (field === 'expectedTime') {
      const timeParts = this.editingValue.split(':');
      if (timeParts.length === 2) {
        const minutes = parseInt(timeParts[0], 10);
        const seconds = parseInt(timeParts[1], 10);
        if (!isNaN(minutes) && !isNaN(seconds) && seconds <= 59) {
          const totalExpectedSeconds = minutes * 60 + seconds;
          runner.expectedTime = totalExpectedSeconds;
          runner.actualTime = this.countdownTime - totalExpectedSeconds;
          this.sortRunners();
        }
      }
    } else if (field === 'racePosition') {
      const pos = parseInt(this.editingValue, 10);
      runner.racePosition = isNaN(pos) ? undefined : pos;
      this.mapCheckInsToRunners();
      this.sortRunners();
    }

    this.storageService.saveRunners(this.runners);
    this.editingCell = null;
    this.editingValue = '';
  }

  cancelCellEdit(): void {
    this.editingCell = null;
    this.editingValue = '';
  }

  getFinishDifferential(runner: StoredRunner): string {
    if (runner.finishTimeSeconds == null) return '';
    const diff = runner.finishTimeSeconds - runner.expectedTime;
    const sign = diff >= 0 ? '+' : '-';
    return sign + this.formatTime(Math.abs(diff));
  }

  getCheckInRaceTime(checkIn: { remainingSeconds: number }): string {
    return this.formatTime(this.countdownTime - checkIn.remainingSeconds);
  }

  getCheckInDifferential(checkIn: { number: number; remainingSeconds: number }): string {
    const runner = this.runners.find(r => r.racePosition === checkIn.number);
    if (!runner) return '-';
    const raceTime = this.countdownTime - checkIn.remainingSeconds;
    const diff = raceTime - runner.expectedTime;
    const sign = diff >= 0 ? '+' : '-';
    return sign + this.formatTime(Math.abs(diff));
  }

  private computeGapValues(): void {
    this.gapValues = this.runners.map((runner, i) => {
      if (i === 0) return '-';
      const prevRunner = this.runners[i - 1];
      const staticDiff = prevRunner.expectedTime - runner.expectedTime;
      if (this.remainingTime <= prevRunner.expectedTime) {
        const countdown = Math.max(0, this.remainingTime - runner.expectedTime);
        return '+' + this.formatTime(countdown);
      }
      return '+' + this.formatTime(staticDiff);
    });
  }

  getCountdownToTime(expectedTime: number): number {
    return Math.max(0, this.remainingTime - expectedTime);
  }

  formatTime(seconds: number): string {
    const sign = seconds < 0 ? '-' : '';
    const abs = Math.abs(seconds);
    const minutes = Math.floor(abs / 60);
    const secs = abs % 60;
    return `${sign}${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['remainingTime']) {
      this.checkForAlerts();
      this.updateActiveAlerts();
    }
    this.mapCheckInsToRunners();
    this.sortRunners();
    this.computeGapValues();
    this.cdr.markForCheck();
  }

  private mapCheckInsToRunners(): void {
    if (!this.checkIns || this.checkIns.length === 0) return;
    this.runners.forEach(runner => {
      // Populate finishTime from check-in matching race position
      if (runner.racePosition) {
        const ci = this.checkIns.find(c => c.number === runner.racePosition);
        if (ci) {
          runner.finishTimeSeconds = this.countdownTime - ci.remainingSeconds;
          runner.finishTime = this.formatTime(runner.finishTimeSeconds);
        } else {
          runner.finishTimeSeconds = undefined;
          runner.finishTime = undefined;
        }
      }
      // Existing: map finishedTime by bib number
      const ciByNumber = this.checkIns.find(c => c.number === runner.number);
      runner.finishedTime = ciByNumber ? ciByNumber.time : undefined;
    });
  }

  private checkForAlerts(): void {
    if (this.remainingTime >= this.countdownTime) return;
    this.runners.forEach(runner => {
      const currentCountdown = this.getCountdownToTime(runner.expectedTime);

      // Within 5 seconds of this runner's start time
      if (currentCountdown <= 5 && currentCountdown >= 0 && !runner.preAlerted) {
        runner.preAlerted = true;
        this.runnerAlerts.push({
          runnerName: runner.name,
          countdown: currentCountdown,
          isGo: false,
          id: `${runner.name}-${Date.now()}`,
          runner
        });
      }

      // Reset flags if countdown goes back up (timer was reset)
      if (currentCountdown > 5) {
        runner.preAlerted = false;
        runner.alerted = false;
      }
    });
  }

  /**
   * Advance active alerts. Driven by remainingTime changes from the parent —
   * alert countdowns derive from remainingTime, so polling timers add nothing.
   */
  private updateActiveAlerts(): void {
    if (this.runnerAlerts.length === 0) return;
    if (this.remainingTime === this.lastAlertTick) return;
    this.lastAlertTick = this.remainingTime;

    let anyTick = false;
    let anyGo = false;
    for (const alert of this.runnerAlerts) {
      if (alert.isGo) continue;
      const countdown = this.getCountdownToTime(alert.runner.expectedTime);
      if (countdown <= 0) {
        alert.isGo = true;
        alert.countdown = 0;
        alert.runner.alerted = true;
        anyGo = true;
        const id = alert.id;
        this.alertTimeouts.push(setTimeout(() => {
          const idx = this.runnerAlerts.findIndex(a => a.id === id);
          if (idx >= 0) {
            this.runnerAlerts.splice(idx, 1);
            this.cdr.markForCheck();
          }
        }, 2000));
      } else {
        alert.countdown = countdown;
        anyTick = true;
      }
    }

    // One cue per second no matter how many runners share a start time
    if (anyGo) {
      this.playGoSound();
    } else if (anyTick) {
      this.playTickSound();
    }
  }

  private ensureAudio(): AudioContext | null {
    try {
      if (!this.audioCtx) {
        this.audioCtx = new AudioContext();
      }
      if (this.audioCtx.state === 'suspended') {
        void this.audioCtx.resume();
      }
      return this.audioCtx;
    } catch {
      return null;
    }
  }

  private playBeep(frequency: number, durationMs: number, volume: number): void {
    if (!this.soundEnabled) return;
    const ctx = this.ensureAudio();
    if (!ctx) return;
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = 'square';
    oscillator.frequency.value = frequency;
    const now = ctx.currentTime;
    const duration = durationMs / 1000;
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.start(now);
    oscillator.stop(now + duration);
  }

  private playTickSound(): void {
    this.playBeep(880, 110, 0.2);
  }

  private playGoSound(): void {
    this.playBeep(1320, 500, 0.3);
  }

  resetRaceData(): void {
    this.alertTimeouts.forEach(t => clearTimeout(t));
    this.alertTimeouts = [];
    this.runnerAlerts = [];
    this.lastAlertTick = null;
    this.runners.forEach(runner => {
      runner.racePosition = undefined;
      runner.finishTime = undefined;
      runner.finishTimeSeconds = undefined;
      runner.alerted = false;
      runner.preAlerted = false;
    });
    this.sortRunners();
    this.storageService.saveRunners(this.runners);
  }

  hasRaceData(): boolean {
    return this.runners.some(r => r.racePosition != null || r.finishTime != null);
  }

  ngOnDestroy(): void {
    this.alertTimeouts.forEach(t => clearTimeout(t));
    this.alertTimeouts = [];
    if (this.audioCtx) {
      void this.audioCtx.close().catch(() => {});
      this.audioCtx = null;
    }
  }

  updateTimesFromFinish(): void {
    let updated = 0;
    this.runners.forEach(runner => {
      if (runner.finishTimeSeconds != null) {
        runner.expectedTime = runner.finishTimeSeconds;
        runner.actualTime = this.countdownTime - runner.expectedTime;
        updated++;
      }
    });
    if (updated > 0) {
      this.sortRunners();
      this.storageService.saveRunners(this.runners);
    }
  }

  exportToCsv(): void {
    const headers = ['Runner Name', 'Race Time', 'Gap', 'Start In', 'Race Position', 'Finish Time', 'Differential'];
    const rows = this.runners.map((runner, i) => [
      runner.name,
      this.formatTime(runner.expectedTime),
      this.gapValues[i] ?? '-',
      this.formatTime(this.getCountdownToTime(runner.expectedTime)),
      runner.racePosition ?? '',
      runner.finishTime ?? '',
      this.getFinishDifferential(runner)
    ]);

    const csv = [headers, ...rows].map(r => r.map(v => {
      const s = String(v);
      return /^[+\-=@]/.test(s) ? `" ${s}"` : `"${s}"`;
    }).join(',')).join('\n');
    const now = new Date();
    const dateStr = now.toISOString().replace('T', '_').replace(/:/g, '-').slice(0, 19);
    const filename = `race-results-${dateStr}.csv`;

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  clearAllRunners(): void {
    if (confirm('⚠️ WARNING: This will permanently delete ALL runners!\n\nAre you sure you want to continue?')) {
      this.runners = [];
      this.storageService.clearRunners();
    }
  }

  importBulkRunners(): void {
    if (!this.bulkRunnerData.trim()) {
      alert('Please paste runner data');
      return;
    }

    let importedCount = 0;
    const lines = this.bulkRunnerData.split('\n').filter(line => line.trim());

    for (const line of lines) {
      // Try to parse the line - supports formats like:
      // "John Smith 25:30" or "John Smith, 25:30" or "John Smith\t25:30"
      const trimmedLine = line.trim();
      
      // Split by tabs, commas, or multiple spaces
      const parts = trimmedLine.split(/[\t,]+|\s{2,}/).map(p => p.trim()).filter(p => p);
      
      if (parts.length >= 2) {
        // Last part should be the time
        const timeStr = parts[parts.length - 1];
        const name = parts.slice(0, -1).join(' ');

        // Validate time format
        const timeParts = timeStr.split(':');
        if (timeParts.length === 2) {
          const minutes = parseInt(timeParts[0], 10);
          const seconds = parseInt(timeParts[1], 10);

          if (!isNaN(minutes) && !isNaN(seconds) && seconds <= 59 && name && minutes >= 0) {
            const totalExpectedSeconds = minutes * 60 + seconds;
            const actualTime = this.countdownTime - totalExpectedSeconds;
            
            this.runners.push({
              name: name,
              expectedTime: totalExpectedSeconds,
              actualTime: actualTime,
              alerted: false,
              preAlerted: false
            });
            importedCount++;
          }
        }
      }
    }

    if (importedCount > 0) {
      this.sortRunners();
      this.storageService.saveRunners(this.runners);
      alert(`Successfully imported ${importedCount} runner(s)`);
      this.bulkRunnerData = '';
      this.showBulkImport = false;
    } else {
      alert('No valid runners found. Format: Name Time (mm:ss)\nExample:\nJohn Smith 25:30\nJane Doe 22:15');
    }
  }
}