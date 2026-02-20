import { PRESETS, TimerState, UPDATE_INTERVAL_MS, BLINK_INTERVAL_MS, BLINK_DURATION_MS } from './constants';

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
}

export class TimerStateManager {
  private data: TimerStateData = {
    state: TimerState.IDLE,
    selectedPreset: 5, // Default to 5 minutes
    remainingSeconds: 5 * 60,
    intervalId: null,
    endTimestamp: null,
    blinkIntervalId: null,
    blinkStartTime: null,
    isBlinkingVisible: true,
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

  isBlinking(): boolean {
    return this.data.state === TimerState.DONE && this.data.blinkIntervalId !== null;
  }

  getBlinkVisibility(): boolean {
    if (this.isBlinking()) {
      return this.data.isBlinkingVisible;
    }
    return true; // Always visible when not blinking
  }

  cyclePreset(): void {
    const previous = this.data.selectedPreset;
    const currentIndex = PRESETS.indexOf(this.data.selectedPreset as typeof PRESETS[number]);
    const nextIndex = (currentIndex + 1) % PRESETS.length;
    this.data.selectedPreset = PRESETS[nextIndex];
    this.debug(`cyclePreset ${previous} -> ${this.data.selectedPreset}`);
    this.resetToPreset();
  }

  cyclePresetBackward(): void {
    const previous = this.data.selectedPreset;
    const currentIndex = PRESETS.indexOf(this.data.selectedPreset as typeof PRESETS[number]);
    const prevIndex = currentIndex === 0 ? PRESETS.length - 1 : currentIndex - 1;
    this.data.selectedPreset = PRESETS[prevIndex];
    this.debug(`cyclePresetBackward ${previous} -> ${this.data.selectedPreset}`);
    this.resetToPreset();
  }

  /** Set preset directly (only values in PRESETS). */
  setPreset(minutes: number): void {
    if (PRESETS.includes(minutes as (typeof PRESETS)[number])) {
      const previous = this.data.selectedPreset;
      this.data.selectedPreset = minutes;
      this.debug(`setPreset ${previous} -> ${minutes}`);
      this.resetToPreset();
      return;
    }
    this.debug(`setPreset ignored invalid value=${minutes}`);
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
    if (remaining !== this.data.remainingSeconds) {
      const previous = this.data.remainingSeconds;
      this.data.remainingSeconds = remaining;
      this.debug(`syncRemaining ${previous}s -> ${remaining}s`);
      if (this.onUpdateCallback) {
        this.onUpdateCallback();
      }
    }

    if (remaining <= 0) {
      this.complete();
    }
  }

  private startBlink(): void {
    this.stopBlink();
    this.data.blinkStartTime = Date.now();
    this.data.isBlinkingVisible = true;
    this.debug(`startBlink duration=${BLINK_DURATION_MS}ms interval=${BLINK_INTERVAL_MS}ms`);
    this.data.blinkIntervalId = window.setInterval(() => {
      const elapsed = Date.now() - (this.data.blinkStartTime || 0);
      if (elapsed >= BLINK_DURATION_MS) {
        this.debug('blink finished by duration');
        this.stopBlink();
        return;
      }
      this.data.isBlinkingVisible = !this.data.isBlinkingVisible;
      this.debug(`blink toggle visible=${this.data.isBlinkingVisible} elapsed=${elapsed}ms`);
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
    this.stopInterval();
  }
}
