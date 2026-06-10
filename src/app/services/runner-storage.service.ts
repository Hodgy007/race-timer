import { Injectable } from '@angular/core';

export interface StoredRunner {
  name: string;
  expectedTime: number;
  actualTime: number;
  number?: number;
  racePosition?: number;
  finishTime?: string;
  finishTimeSeconds?: number;
  finishedTime?: string;
  alerted?: boolean;
  preAlerted?: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class RunnerStorageService {
  private readonly STORAGE_KEY = 'harpenden_runners';

  constructor() { }

  /**
   * Save runners list to localStorage
   */
  saveRunners(runners: StoredRunner[]): void {
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(runners));
    } catch (error) {
      console.error('Error saving runners to storage:', error);
    }
  }

  /**
   * Load runners list from localStorage
   */
  loadRunners(): StoredRunner[] {
    try {
      const data = localStorage.getItem(this.STORAGE_KEY);
      const parsed = data ? JSON.parse(data) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      console.error('Error loading runners from storage:', error);
      return [];
    }
  }

  /**
   * Clear all runners from storage
   */
  clearRunners(): void {
    try {
      localStorage.removeItem(this.STORAGE_KEY);
    } catch (error) {
      console.error('Error clearing runners from storage:', error);
    }
  }
}
