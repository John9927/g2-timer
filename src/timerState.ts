import { PRESETS, TimerState, UPDATE_INTERVAL_MS, BLINK_INTERVAL_MS, BLINK_DURATION_MS } from './constants';

export interface TimerStateData {
  state: TimerState;
  selectedPreset: number; // minutes
  remainingSeconds: number;
  intervalId: number | null;
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
    blinkIntervalId: null,
    blinkStartTime: null,
    isBlinkingVisible: true,
  };

  private onUpdateCallback: (() => void) | null = null;
  private onStateChangeCallback: (() => void) | null = null;

  setOnUpdate(callback: () => void) {
    this.onUpdateCallback = callback;
  }

  setOnStateChange(callback: () => void) {
    this.onStateChangeCallback = callback;
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
    const currentIndex = PRESETS.indexOf(this.data.selectedPreset as typeof PRESETS[number]);
    const nextIndex = (currentIndex + 1) % PRESETS.length;
    this.data.selectedPreset = PRESETS[nextIndex];
    this.resetToPreset();
    if (this.onStateChangeCallback) {
      this.onStateChangeCallback();
    }
  }

  cyclePresetBackward(): void {
    const currentIndex = PRESETS.indexOf(this.data.selectedPreset as typeof PRESETS[number]);
    const prevIndex = currentIndex === 0 ? PRESETS.length - 1 : currentIndex - 1;
    this.data.selectedPreset = PRESETS[prevIndex];
    this.resetToPreset();
    if (this.onStateChangeCallback) {
      this.onStateChangeCallback();
    }
  }

  resetToPreset(): void {
    this.stopInterval();
    this.stopBlink();
    this.data.remainingSeconds = this.data.selectedPreset * 60;
    this.data.state = TimerState.IDLE;
    if (this.onStateChangeCallback) {
      this.onStateChangeCallback();
    }
  }

  start(): void {
    if (this.data.state === TimerState.DONE) {
      this.resetToPreset();
    }
    if (this.data.state === TimerState.IDLE || this.data.state === TimerState.PAUSED) {
      this.data.state = TimerState.RUNNING;
      this.startInterval();
      if (this.onStateChangeCallback) {
        this.onStateChangeCallback();
      }
    }
  }

  pause(): void {
    if (this.data.state === TimerState.RUNNING) {
      this.data.state = TimerState.PAUSED;
      this.stopInterval();
      if (this.onStateChangeCallback) {
        this.onStateChangeCallback();
      }
    }
  }

  toggleStartPause(): void {
    if (this.data.state === TimerState.RUNNING) {
      this.pause();
    } else {
      this.start();
    }
  }

  private startInterval(): void {
    this.stopInterval();
    this.data.intervalId = window.setInterval(() => {
      if (this.data.remainingSeconds > 0) {
        this.data.remainingSeconds--;
        if (this.onUpdateCallback) {
          this.onUpdateCallback();
        }
      } else {
        this.complete();
      }
    }, UPDATE_INTERVAL_MS);
  }

  private stopInterval(): void {
    if (this.data.intervalId !== null) {
      clearInterval(this.data.intervalId);
      this.data.intervalId = null;
    }
  }

  private complete(): void {
    this.stopInterval();
    this.data.state = TimerState.DONE;
    this.data.remainingSeconds = 0;
    this.startBlink();
    if (this.onStateChangeCallback) {
      this.onStateChangeCallback();
    }
  }

  private startBlink(): void {
    this.stopBlink();
    this.data.blinkStartTime = Date.now();
    this.data.isBlinkingVisible = true;
    this.data.blinkIntervalId = window.setInterval(() => {
      const elapsed = Date.now() - (this.data.blinkStartTime || 0);
      if (elapsed >= BLINK_DURATION_MS) {
        this.stopBlink();
        return;
      }
      this.data.isBlinkingVisible = !this.data.isBlinkingVisible;
      if (this.onStateChangeCallback) {
        this.onStateChangeCallback();
      }
    }, BLINK_INTERVAL_MS);
  }

  private stopBlink(): void {
    if (this.data.blinkIntervalId !== null) {
      clearInterval(this.data.blinkIntervalId);
      this.data.blinkIntervalId = null;
    }
    this.data.blinkStartTime = null;
    this.data.isBlinkingVisible = true; // Reset to visible
  }

  cleanup(): void {
    this.stopInterval();
    this.stopBlink();
  }

  // Handle foreground/background lifecycle
  handleForeground(): void {
    if (this.data.state === TimerState.RUNNING) {
      // Restart interval if we were running
      this.startInterval();
    }
  }

  handleBackground(): void {
    // Stop interval when going to background
    // State is preserved, interval will restart on foreground
    this.stopInterval();
  }
}
