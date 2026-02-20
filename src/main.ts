import { waitForEvenAppBridge } from '@evenrealities/even_hub_sdk';
import { TimerStateManager } from './timerState';
import { createPageContainers, renderUI, formatTime } from './ui';
import { TimerState } from './constants';

const REMOTE_START_DELAY_MS = 3000;
const REMOTE_START_COUNTDOWN_INTERVAL_MS = 1000;

let bridge: any = null;
let timerState: TimerStateManager | null = null;
let isInitialized = false;
let isInForeground = true;

let remoteStartTimeoutId: ReturnType<typeof setTimeout> | null = null;
let remoteStartCountdownIntervalId: ReturnType<typeof setInterval> | null = null;
let remoteStartScheduledAt: number | null = null;

type RenderReason = 'tick' | 'state' | 'foreground' | 'manual';

const TELEMETRY_WINDOW_SIZE = 120;
const TELEMETRY_FAST_BUCKET_RATIO = 0.25;
const TELEMETRY_LOG_LIMIT = 14;

const telemetrySamples: number[] = [];
const telemetryLogLines: string[] = [];
let telemetryInFlightRenders = 0;
let telemetryMaxQueueDepth = 0;

function getTelemetrySummaryEl(): HTMLElement | null {
  return document.getElementById('telemetry-summary');
}

function getTelemetryLogEl(): HTMLElement | null {
  return document.getElementById('telemetry-log');
}

function nowTimeLabel(): string {
  const now = new Date();
  return now.toLocaleTimeString('it-IT', { hour12: false });
}

function toMsText(value: number): string {
  return `${value.toFixed(1)} ms`;
}

function average(values: number[]): number {
  if (!values.length) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function updateTelemetrySummary(lastMs: number, reason: RenderReason): void {
  const summaryEl = getTelemetrySummaryEl();
  if (!summaryEl) return;
  if (!telemetrySamples.length) {
    summaryEl.textContent = 'Waiting for samples...';
    return;
  }

  const avgMs = average(telemetrySamples);
  const sorted = [...telemetrySamples].sort((a, b) => a - b);
  const fastBucketCount = Math.max(1, Math.floor(sorted.length * TELEMETRY_FAST_BUCKET_RATIO));
  const fixedMs = average(sorted.slice(0, fastBucketCount));
  const variableMs = Math.max(0, avgMs - fixedMs);

  summaryEl.textContent =
    `Last (${reason}): ${toMsText(lastMs)}\n` +
    `Average (${telemetrySamples.length}): ${toMsText(avgMs)}\n` +
    `Fixed delay est.: ${toMsText(fixedMs)}\n` +
    `Variable extra: ${toMsText(variableMs)} | Max queue: ${telemetryMaxQueueDepth}`;
}

function pushTelemetryLog(line: string): void {
  telemetryLogLines.unshift(`[${nowTimeLabel()}] ${line}`);
  if (telemetryLogLines.length > TELEMETRY_LOG_LIMIT) telemetryLogLines.length = TELEMETRY_LOG_LIMIT;
  const logEl = getTelemetryLogEl();
  if (logEl) logEl.textContent = telemetryLogLines.join('\n');
}

function recordRenderTelemetry(
  reason: RenderReason,
  elapsedMs: number,
  queueDepth: number,
  state: TimerState,
  remainingSeconds: number,
): void {
  telemetrySamples.push(elapsedMs);
  if (telemetrySamples.length > TELEMETRY_WINDOW_SIZE) telemetrySamples.shift();
  if (queueDepth > telemetryMaxQueueDepth) telemetryMaxQueueDepth = queueDepth;

  updateTelemetrySummary(elapsedMs, reason);

  const sorted = [...telemetrySamples].sort((a, b) => a - b);
  const fastBucketCount = Math.max(1, Math.floor(sorted.length * TELEMETRY_FAST_BUCKET_RATIO));
  const fixedMs = average(sorted.slice(0, fastBucketCount));
  const extraMs = Math.max(0, elapsedMs - fixedMs);

  pushTelemetryLog(
    `${reason.toUpperCase()} ${toMsText(elapsedMs)} (fixed ${toMsText(fixedMs)}, extra ${toMsText(extraMs)}, q ${queueDepth}) ` +
    `${state} ${formatTime(remainingSeconds)}`,
  );
}

// ── Phone UI ──────────────────────────────────────────────────────
function clearRemoteStartPending() {
  if (remoteStartTimeoutId !== null) { clearTimeout(remoteStartTimeoutId); remoteStartTimeoutId = null; }
  if (remoteStartCountdownIntervalId !== null) { clearInterval(remoteStartCountdownIntervalId); remoteStartCountdownIntervalId = null; }
  remoteStartScheduledAt = null;
}

function updateRemoteView() {
  const status = document.getElementById('remote-status');
  const btnStart = document.getElementById('btn-start-pause') as HTMLButtonElement | null;
  const btnReset = document.getElementById('btn-reset') as HTMLButtonElement | null;
  const presetBtns = document.querySelectorAll('#remote-preset-buttons .preset-btn');

  const connected = !!(bridge && timerState);
  if (status) {
    status.textContent = connected
      ? (isInitialized ? 'Connected – display ready' : 'Connected – initializing...')
      : 'Connecting...';
    status.className = connected ? 'connected' : '';
  }

  const pending = remoteStartScheduledAt !== null;

  if (timerState) {
    const preset = timerState.getSelectedPreset();
    presetBtns.forEach(b => {
      const p = parseInt((b as HTMLElement).dataset.preset || '', 10);
      b.classList.toggle('selected', p === preset);
      (b as HTMLButtonElement).disabled = !connected || pending;
    });
    if (btnStart) {
      btnStart.disabled = !connected;
      const running = timerState.getState() === TimerState.RUNNING;
      if (pending) {
        btnStart.textContent = 'Please wait\u2026';
        btnStart.classList.remove('pause-mode');
      } else {
        btnStart.textContent = running ? 'Pause' : 'Start';
        btnStart.classList.toggle('pause-mode', running);
      }
    }
    if (btnReset) btnReset.disabled = !connected;
  } else {
    presetBtns.forEach(b => { b.classList.remove('selected'); (b as HTMLButtonElement).disabled = true; });
    if (btnStart) { btnStart.disabled = true; btnStart.textContent = 'Start'; }
    if (btnReset) btnReset.disabled = true;
  }
}

// ── Fire-and-forget glasses render (never awaited, never blocks) ──
// Send every tick so display updates every 1s; overlapping pushes allowed.
function sendToGlasses(reason: RenderReason = 'tick') {
  if (!isInForeground || !bridge || !timerState) return;
  const state = timerState.getState();
  const selectedPreset = timerState.getSelectedPreset();
  const remainingSeconds = timerState.getRemainingSeconds();
  const blinkVisibility = timerState.getBlinkVisibility();
  const startedAt = performance.now();
  telemetryInFlightRenders++;
  const queueDepth = telemetryInFlightRenders;

  renderUI(
    bridge,
    state,
    selectedPreset,
    remainingSeconds,
    blinkVisibility,
  ).then(() => {
    const elapsedMs = performance.now() - startedAt;
    recordRenderTelemetry(reason, elapsedMs, queueDepth, state, remainingSeconds);
  }).catch(err => {
    pushTelemetryLog(`ERR ${reason.toUpperCase()} ${String(err)}`);
    console.error('[Timer] renderUI:', err);
  }).finally(() => {
    telemetryInFlightRenders = Math.max(0, telemetryInFlightRenders - 1);
  });
}

function sendToGlassesImmediate(reason: RenderReason = 'manual') {
  if (!bridge || !timerState) return;
  const state = timerState.getState();
  const selectedPreset = timerState.getSelectedPreset();
  const remainingSeconds = timerState.getRemainingSeconds();
  const blinkVisibility = timerState.getBlinkVisibility();
  const startedAt = performance.now();
  telemetryInFlightRenders++;
  const queueDepth = telemetryInFlightRenders;

  renderUI(
    bridge,
    state,
    selectedPreset,
    remainingSeconds,
    blinkVisibility,
  ).then(() => {
    const elapsedMs = performance.now() - startedAt;
    recordRenderTelemetry(reason, elapsedMs, queueDepth, state, remainingSeconds);
  }).catch(err => {
    pushTelemetryLog(`ERR ${reason.toUpperCase()} ${String(err)}`);
    console.error('[Timer] renderUI:', err);
  }).finally(() => {
    telemetryInFlightRenders = Math.max(0, telemetryInFlightRenders - 1);
  });
}

// ── Remote control buttons ────────────────────────────────────────
function setupRemoteControl() {
  const btnStart = document.getElementById('btn-start-pause');
  const btnReset = document.getElementById('btn-reset');
  const presetBtns = document.querySelectorAll('#remote-preset-buttons .preset-btn');

  btnStart?.addEventListener('click', () => {
    if (!timerState || !bridge) return;
    const state = timerState.getState();

    if (state === TimerState.RUNNING) {
      clearRemoteStartPending();
      timerState.toggleStartPause();
      return;
    }
    if (state === TimerState.PAUSED) {
      clearRemoteStartPending();
      timerState.toggleStartPause();
      return;
    }
    if (state === TimerState.IDLE || state === TimerState.DONE) {
      if (remoteStartScheduledAt !== null) return;
      timerState.start();
      remoteStartScheduledAt = Date.now();
      remoteStartCountdownIntervalId = setInterval(() => updateRemoteView(), REMOTE_START_COUNTDOWN_INTERVAL_MS);
      remoteStartTimeoutId = setTimeout(() => { clearRemoteStartPending(); updateRemoteView(); }, REMOTE_START_DELAY_MS);
      updateRemoteView();
    }
  });

  btnReset?.addEventListener('click', () => {
    if (!timerState || !bridge) return;
    clearRemoteStartPending();
    timerState.resetToPreset();
  });

  presetBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const min = parseInt((btn as HTMLElement).dataset.preset || '', 10);
      if (!timerState || !bridge || !min) return;
      timerState.setPreset(min);
    });
  });
}

// ── Swipe throttling ──────────────────────────────────────────────
let lastSwipeTime = 0;
const SWIPE_COOLDOWN_MS = 300;

// ── Event handlers for glasses ────────────────────────────────────
function setupEventHandlers() {
  if (!bridge) return;
  try {
    bridge.onEvenHubEvent((event: any) => {
      if (!timerState || !isInForeground) return;
      console.log('Even Hub event:', event);

      if (event.textEvent) {
        const evType = event.textEvent.eventType;
        if (evType === 1) { handleSwipe(1); return; }
        if (evType === 2) { handleSwipe(-1); return; }
        if (evType === 0 || evType === undefined) { handleSingleTap(); return; }
      }

      if (event.type === 'sysEvent') {
        if (event.eventType === 'enterForeground') {
          isInForeground = true;
          timerState?.handleForeground();
          sendToGlassesImmediate('foreground');
        } else if (event.eventType === 'exitForeground') {
          isInForeground = false;
          timerState?.handleBackground();
        }
        return;
      }

      if (event.type === 'tap' || event.eventType === 'tap' || event.eventType === 0 || event.eventType === undefined) {
        const taps = event.tapCount || event.taps || 1;
        if (taps === 1) handleSingleTap();
        else if (taps === 2) { timerState.resetToPreset(); }
      }
    });
  } catch (err) {
    console.error('Error setting up event handlers:', err);
  }
}

function handleSingleTap() {
  if (!timerState || !bridge) return;
  timerState.toggleStartPause();
}

function handleSwipe(dir: 1 | -1) {
  if (!timerState || !bridge) return;
  const now = Date.now();
  if (now - lastSwipeTime < SWIPE_COOLDOWN_MS) return;
  lastSwipeTime = now;
  if (dir === 1) timerState.cyclePreset(); else timerState.cyclePresetBackward();
}

// ── Bootstrap ─────────────────────────────────────────────────────
async function init() {
  try {
    updateRemoteView();
    bridge = await waitForEvenAppBridge();
    console.log('[Boot] Bridge received');
    updateRemoteView();

    if (!bridge) {
      console.error('[Boot] Bridge not available');
      const s = document.getElementById('remote-status');
      if (s) { s.textContent = 'Connection unavailable'; s.className = 'error'; }
      timerState = new TimerStateManager();
      setupRemoteControl();
      updateRemoteView();
      return;
    }

    timerState = new TimerStateManager();
    setupRemoteControl();

    // Every timer tick: phone UI updates instantly, glasses get a render if idle
    timerState.setOnUpdate(() => {
      updateRemoteView();
      sendToGlasses('tick');
    });

    // State transitions (start/pause/done): always push to glasses immediately
    timerState.setOnStateChange(() => {
      updateRemoteView();
      sendToGlassesImmediate('state');
    });

    const ok = await createPageContainers(bridge, timerState.getSelectedPreset());
    if (!ok) {
      console.error('Failed to create page containers');
      await renderUI(bridge, TimerState.IDLE, 5, 300, true, 'ERROR: container creation failed');
      const s = document.getElementById('remote-status');
      if (s) { s.textContent = 'Display creation error'; s.className = 'error'; }
      return;
    }

    setupEventHandlers();
    await renderUI(bridge, TimerState.IDLE, timerState.getSelectedPreset(), timerState.getRemainingSeconds(), true);
    isInitialized = true;
    updateRemoteView();
  } catch (err) {
    console.error('Failed to initialize:', err);
    const s = document.getElementById('remote-status');
    if (s) { s.textContent = `Error: ${err}`; s.className = 'error'; }
  }
}

window.addEventListener('beforeunload', () => {
  clearRemoteStartPending();
  if (bridge && isInitialized) {
    try { bridge.shutDownPageContainer(0); } catch {}
  }
  timerState?.cleanup();
});

init();
