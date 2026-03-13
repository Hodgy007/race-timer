import { Component, Input, OnChanges, OnInit, ChangeDetectorRef } from '@angular/core';
import { RunnerStorageService, StoredRunner } from '../../services/runner-storage.service';

@Component({
  selector: 'app-runner-list',
  templateUrl: './runner-list.component.html',
  styleUrls: ['./runner-list.component.css']
})
export class RunnerListComponent implements OnInit, OnChanges {
  @Input() remainingTime: number = 0;
  @Input() countdownTime: number = 1800;
  @Input() checkIns: { number: number; time: string; remainingSeconds: number }[] = [];

  runners: StoredRunner[] = [];
  runnerName: string = '';
  expectedTime: string = '';
  runnerAlerts: { runnerName: string; countdown: number; isGo: boolean; id: string }[] = [];
  
  gapValues: string[] = [];
  editingCell: { index: number; field: 'name' | 'expectedTime' | 'racePosition' } | null = null;
  editingValue: string = '';
  private alertIntervals: any[] = [];
  
  showBulkImport: boolean = false;
  bulkRunnerData: string = '';

  constructor(private storageService: RunnerStorageService, private cdr: ChangeDetectorRef) {}

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
  }

  private sortRunners(): void {
    this.runners.sort((a, b) => {
      const aPos = a.racePosition ?? Infinity;
      const bPos = b.racePosition ?? Infinity;
      if (aPos !== bPos) return aPos - bPos;
      return b.expectedTime - a.expectedTime;
    });
    this.computeGapValues();
  }

  removeRunner(runner: any): void {
    const index = this.runners.indexOf(runner);
    if (index >= 0) {
      this.runners.splice(index, 1);
      this.sortRunners();
      this.storageService.saveRunners(this.runners);
    }
  }

  startCellEdit(index: number, field: 'name' | 'expectedTime' | 'racePosition'): void {
    this.editingCell = { index, field };
    if (field === 'name') {
      this.editingValue = this.runners[index].name;
    } else if (field === 'expectedTime') {
      this.editingValue = this.formatTime(this.runners[index].expectedTime);
    } else if (field === 'racePosition') {
      this.editingValue = this.runners[index].racePosition?.toString() ?? '';
    }
    setTimeout(() => {
      const input = document.querySelector('.cell-edit-input') as HTMLInputElement;
      if (input) input.focus();
    }, 0);
  }

  saveCellEdit(): void {
    if (!this.editingCell) return;
    const { index, field } = this.editingCell;

    if (field === 'name') {
      if (this.editingValue.trim()) {
        this.runners[index].name = this.editingValue.trim();
      }
    } else if (field === 'expectedTime') {
      const timeParts = this.editingValue.split(':');
      if (timeParts.length === 2) {
        const minutes = parseInt(timeParts[0], 10);
        const seconds = parseInt(timeParts[1], 10);
        if (!isNaN(minutes) && !isNaN(seconds) && seconds <= 59) {
          const totalExpectedSeconds = minutes * 60 + seconds;
          this.runners[index].expectedTime = totalExpectedSeconds;
          this.runners[index].actualTime = this.countdownTime - totalExpectedSeconds;
          this.sortRunners();
        }
      }
    } else if (field === 'racePosition') {
      const pos = parseInt(this.editingValue, 10);
      this.runners[index].racePosition = isNaN(pos) ? undefined : pos;
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
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }

  ngOnChanges(): void {
    this.checkForAlerts();
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
      
      // Check if within 5 seconds of the alert time
      if (currentCountdown <= 5 && currentCountdown >= 0) {
        if (!runner.preAlerted) {
          runner.preAlerted = true;
          const alertId = `${runner.name}-${Date.now()}`;
          
          // Create the alert entry
          const alertEntry = {
            runnerName: runner.name,
            countdown: Math.round(currentCountdown),
            isGo: false,
            id: alertId
          };
          
          this.runnerAlerts.push(alertEntry);
          
          // Update countdown every 100ms
          const updateInterval = setInterval(() => {
            const updatedCountdown = this.getCountdownToTime(runner.expectedTime);
            const alertIndex = this.runnerAlerts.findIndex(a => a.id === alertId);
            
            if (alertIndex >= 0) {
              const roundedCountdown = Math.round(updatedCountdown);
              if (roundedCountdown <= 0) {
                this.runnerAlerts[alertIndex].isGo = true;
                this.runnerAlerts[alertIndex].countdown = 0;
                runner.alerted = true;
                clearInterval(updateInterval);
                
                // Remove alert after 2 seconds
                setTimeout(() => {
                  const idx = this.runnerAlerts.findIndex(a => a.id === alertId);
                  if (idx >= 0) {
                    this.runnerAlerts.splice(idx, 1);
                  }
                }, 2000);
              } else {
                this.runnerAlerts[alertIndex].countdown = roundedCountdown;
              }
            } else {
              clearInterval(updateInterval);
            }
          }, 100);
          this.alertIntervals.push(updateInterval);
        }
      }

      // Reset flags if countdown goes back up (timer was reset)
      if (currentCountdown > 5) {
        runner.preAlerted = false;
        runner.alerted = false;
      }
    });
  }

  resetRaceData(): void {
    this.alertIntervals.forEach(i => clearInterval(i));
    this.alertIntervals = [];
    this.runnerAlerts = [];
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

  exportToCsv(): void {
    const headers = ['Runner Name', '5K Time', 'Gap', 'Start In', 'Race Position', 'Finish Time', 'Differential'];
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