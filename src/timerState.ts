import {
  BLINK_INTERVAL_MS,
  DEFAULT_PRESET_MINUTES,
  MAX_PRESET_MINUTES,
  MIN_PRESET_MINUTES,
  TimerState,
  UPDATE_INTERVAL_MS,
} from './constants';
import type { TimerRuntimeSnapshot } from './timerStorage';

export type TimerDebugLogFn = (line: string) => void;

export interface TimerStateData {
  state: TimerState;
  selectedPreset: number; // minutes
  remainingSeconds: number;
  intervalId: number | null;
  endTimestamp: number | null;
  blinkIntervalId: number | null;
  blinkStartTime: number | null;
  isBlinkingVisible: boolean;
  doneBlinkCount: number;
  blinkToggleCount: number;
}

export class TimerStateManager {
  private data: TimerStateData = {
    state: TimerState.IDLE,
    selectedPreset: DEFAULT_PRESET_MINUTES,
    remainingSeconds: DEFAULT_PRESET_MINUTES * 60,
    intervalId: null,
    endTimestamp: null,
    blinkIntervalId: null,
    blinkStartTime: null,
    isBlinkingVisible: true,
    doneBlinkCount: 0,
    blinkToggleCount: 0,
  };

  private onUpdateCallback: (() => void) | null = null;
  private onStateChangeCallback: (() => void) | null = null;
  private debugLogCallback: TimerDebugLogFn | null = null;

  private debug(line: string): void {
    if (this.debugLogCallback) {
      this.debugLogCallback(`[TimerState] ${line}`);
    }
  }

  setOnUpdate(callback: () => void) {
    this.onUpdateCallback = callback;
  }

  setOnStateChange(callback: () => void) {
    this.onStateChangeCallback = callback;
  }

  setOnDebugLog(callback: TimerDebugLogFn) {
    this.debugLogCallback = callback;
    this.debug('Debug logger attached');
  }

  getState(): TimerState {
    return this.data.state;
  }

  getSelectedPreset(): number {
    return this.data.selectedPreset;
  }

  getRemainingSeconds(): number {
    return this.data.remainingSeconds;
  }

  getDisplayRemainingSeconds(leadMs = 0): number {
    if (this.data.state !== TimerState.RUNNING || this.data.endTimestamp === null) {
      return this.data.remainingSeconds;
    }

    const safeLead = Math.max(0, leadMs);
    const predicted = Math.max(0, Math.ceil((this.data.endTimestamp - Date.now() - safeLead) / 1000));

    // Do not display 00:00 while timer is still logically running.
    if (predicted <= 0 && this.data.remainingSeconds > 0) {
      return 1;
    }
    return predicted;
  }

  isBlinking(): boolean {
    return this.data.state === TimerState.DONE && this.data.blinkIntervalId !== null;
  }

  getBlinkVisibility(): boolean {
    if (this.isBlinking()) {
      return this.data.isBlinkingVisible;
    }
    return true; // Always visible when not blinking
  }

  setDoneBlinkCount(count: number): void {
    const normalized = typeof count === 'number' && Number.isFinite(count)
      ? Math.max(0, Math.round(count))
      : 0;
    this.data.doneBlinkCount = normalized;
    this.debug(`setDoneBlinkCount ${normalized}`);
  }

  private normalizePresetMinutes(minutes: number): number {
    if (!Number.isFinite(minutes)) {
      return DEFAULT_PRESET_MINUTES;
    }

    return Math.min(MAX_PRESET_MINUTES, Math.max(MIN_PRESET_MINUTES, Math.round(minutes)));
  }

  getSnapshot(): TimerRuntimeSnapshot {
    const remainingSeconds = this.data.state === TimerState.RUNNING && this.data.endTimestamp !== null
      ? Math.max(0, Math.ceil((this.data.endTimestamp - Date.now()) / 1000))
      : this.data.remainingSeconds;

    return {
      state: this.data.state,
      selectedPreset: this.data.selectedPreset,
      remainingSeconds,
      endTimestamp: this.data.endTimestamp,
      savedAt: Date.now(),
    };
  }

  restoreFromSnapshot(snapshot: TimerRuntimeSnapshot): void {
    this.stopInterval();
    this.stopBlink();

    this.data.selectedPreset = this.normalizePresetMinutes(snapshot.selectedPreset);
    this.data.endTimestamp = null;

    if (snapshot.state === TimerState.RUNNING) {
      const restoredEndTimestamp = snapshot.endTimestamp ?? (snapshot.savedAt + snapshot.remainingSeconds * 1000);
      const restoredRemaining = Math.max(0, Math.ceil((restoredEndTimestamp - Date.now()) / 1000));

      if (restoredRemaining <= 0) {
        this.data.state = TimerState.DONE;
        this.data.remainingSeconds = 0;
        this.debug('restoreFromSnapshot RUNNING -> DONE (expired while app was inactive)');
        return;
      }

      this.data.state = TimerState.RUNNING;
      this.data.endTimestamp = restoredEndTimestamp;
      this.data.remainingSeconds = restoredRemaining;
      this.debug(`restoreFromSnapshot RUNNING remaining=${restoredRemaining}s endTimestamp=${restoredEndTimestamp}`);
      this.startInterval();
      return;
    }

    if (snapshot.state === TimerState.PAUSED) {
      const pausedRemaining = Math.max(0, snapshot.remainingSeconds);
      this.data.state = pausedRemaining > 0 ? TimerState.PAUSED : TimerState.DONE;
      this.data.remainingSeconds = pausedRemaining;
      this.debug(`restoreFromSnapshot ${this.data.state} remaining=${pausedRemaining}s`);
      return;
    }

    if (snapshot.state === TimerState.DONE) {
      this.data.state = TimerState.DONE;
      this.data.remainingSeconds = 0;
      this.debug('restoreFromSnapshot DONE');
      return;
    }

    this.data.state = TimerState.IDLE;
    this.data.remainingSeconds = this.data.selectedPreset * 60;
    this.debug(`restoreFromSnapshot IDLE preset=${this.data.selectedPreset} remaining=${this.data.remainingSeconds}s`);
  }

  cyclePreset(): void {
    const previous = this.data.selectedPreset;
    this.data.selectedPreset = this.data.selectedPreset >= MAX_PRESET_MINUTES
      ? MIN_PRESET_MINUTES
      : this.data.selectedPreset + 1;
    this.debug(`cyclePreset ${previous} -> ${this.data.selectedPreset}`);
    this.resetToPreset();
  }

  cyclePresetBackward(): void {
    const previous = this.data.selectedPreset;
    this.data.selectedPreset = this.data.selectedPreset <= MIN_PRESET_MINUTES
      ? MAX_PRESET_MINUTES
      : this.data.selectedPreset - 1;
    this.debug(`cyclePresetBackward ${previous} -> ${this.data.selectedPreset}`);
    this.resetToPreset();
  }

  /** Set preset directly (supports any whole minute value within bounds). */
  setPreset(minutes: number): void {
    const normalized = this.normalizePresetMinutes(minutes);
    const previous = this.data.selectedPreset;
    this.data.selectedPreset = normalized;
    this.debug(`setPreset ${previous} -> ${normalized}`);
    this.resetToPreset();
  }

  resetToPreset(): void {
    const prevState = this.data.state;
    const prevRemaining = this.data.remainingSeconds;
    this.stopInterval();
    this.stopBlink();
    this.data.endTimestamp = null;
    this.data.remainingSeconds = this.data.selectedPreset * 60;
    this.data.state = TimerState.IDLE;
    this.debug(`resetToPreset state ${prevState} -> IDLE, remaining ${prevRemaining}s -> ${this.data.remainingSeconds}s`);
    if (this.onStateChangeCallback) {
      this.onStateChangeCallback();
    }
  }

  start(): void {
    this.debug(`start requested from ${this.data.state}, remaining=${this.data.remainingSeconds}s`);
    if (this.data.state === TimerState.DONE) {
      this.debug('start from DONE: resetting to preset first');
      this.resetToPreset();
    }
    if (this.data.state === TimerState.IDLE || this.data.state === TimerState.PAUSED) {
      this.data.state = TimerState.RUNNING;
      this.data.endTimestamp = Date.now() + this.data.remainingSeconds * 1000;
      this.debug(`start accepted, endTimestamp=${this.data.endTimestamp}`);
      this.startInterval();
      if (this.onStateChangeCallback) {
        this.onStateChangeCallback();
      }
      return;
    }
    this.debug(`start ignored, state=${this.data.state}`);
  }

  pause(): void {
    if (this.data.state === TimerState.RUNNING) {
      this.debug('pause requested while RUNNING');
      this.syncRemainingWithClock();
      if (this.data.state !== TimerState.RUNNING) {
        this.debug(`pause aborted after sync, state now ${this.data.state}`);
        return;
      }
      this.data.state = TimerState.PAUSED;
      this.data.endTimestamp = null;
      this.stopInterval();
      this.debug(`pause applied, remaining=${this.data.remainingSeconds}s`);
      if (this.onStateChangeCallback) {
        this.onStateChangeCallback();
      }
      return;
    }
    this.debug(`pause ignored, state=${this.data.state}`);
  }

  toggleStartPause(): void {
    this.debug(`toggleStartPause from ${this.data.state}`);
    if (this.data.state === TimerState.RUNNING) {
      this.pause();
    } else {
      this.start();
    }
  }

  private startInterval(): void {
    this.stopInterval();
    const intervalMs = Math.max(UPDATE_INTERVAL_MS / 4, 200);
    this.debug(`startInterval every ${intervalMs}ms`);
    this.data.intervalId = window.setInterval(() => {
      this.syncRemainingWithClock();
    }, intervalMs);
  }

  private stopInterval(): void {
    if (this.data.intervalId !== null) {
      clearInterval(this.data.intervalId);
      this.data.intervalId = null;
      this.debug('stopInterval');
    }
  }

  private complete(): void {
    this.debug('complete reached 00:00');
    this.stopInterval();
    this.data.state = TimerState.DONE;
    this.data.endTimestamp = null;
    this.data.remainingSeconds = 0;
    this.startBlink();
    if (this.onStateChangeCallback) {
      this.onStateChangeCallback();
    }
  }

  private syncRemainingWithClock(): void {
    if (this.data.state !== TimerState.RUNNING || this.data.endTimestamp === null) {
      return;
    }

    const remaining = Math.max(0, Math.ceil((this.data.endTimestamp - Date.now()) / 1000));
    if (remaining <= 0) {
      if (this.data.remainingSeconds !== 0) {
        this.debug(`syncRemaining ${this.data.remainingSeconds}s -> 0s (complete)`);
      }
      this.data.remainingSeconds = 0;
      this.complete();
      return;
    }

    if (remaining !== this.data.remainingSeconds) {
      const previous = this.data.remainingSeconds;
      this.data.remainingSeconds = remaining;
      this.debug(`syncRemaining ${previous}s -> ${remaining}s`);
      if (this.onUpdateCallback) {
        this.onUpdateCallback();
      }
    }
  }

  private startBlink(): void {
    this.stopBlink();
    this.data.blinkStartTime = Date.now();
    this.data.isBlinkingVisible = true;
    this.data.blinkToggleCount = 0;
    this.debug(`startBlink interval=${BLINK_INTERVAL_MS}ms`);
    this.data.blinkIntervalId = window.setInterval(() => {
      this.data.isBlinkingVisible = !this.data.isBlinkingVisible;
      this.data.blinkToggleCount += 1;
      this.debug(`blink toggle visible=${this.data.isBlinkingVisible}`);
      if (this.data.doneBlinkCount > 0 && this.data.blinkToggleCount >= this.data.doneBlinkCount * 2) {
        this.debug(`blink limit reached count=${this.data.doneBlinkCount}`);
        this.stopBlink();
      }
      if (this.onStateChangeCallback) {
        this.onStateChangeCallback();
      }
    }, BLINK_INTERVAL_MS);
  }

  private stopBlink(): void {
    if (this.data.blinkIntervalId !== null) {
      clearInterval(this.data.blinkIntervalId);
      this.data.blinkIntervalId = null;
      this.debug('stopBlink interval cleared');
    }
    this.data.blinkStartTime = null;
    this.data.isBlinkingVisible = true; // Reset to visible
    this.data.blinkToggleCount = 0;
  }

  cleanup(): void {
    this.debug('cleanup');
    this.stopInterval();
    this.stopBlink();
  }

  // Handle foreground/background lifecycle
  handleForeground(): void {
    this.debug(`handleForeground state=${this.data.state}`);
    if (this.data.state === TimerState.RUNNING) {
      this.startInterval();
      this.syncRemainingWithClock();
    }
  }

  handleBackground(): void {
    this.debug(`handleBackground state=${this.data.state}`);
    if (this.data.state === TimerState.RUNNING && this.data.intervalId === null) {
      this.startInterval();
    }
  }
}
