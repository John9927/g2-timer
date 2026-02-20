import { waitForEvenAppBridge } from '@evenrealities/even_hub_sdk';
import { TimerStateManager } from './timerState';
import { createPageContainers, renderUI, formatTime, setUiDebugLogger } from './ui';
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
const TELEMETRY_LOG_LIMIT = 120;
const DISPLAY_TICKER_INTERVAL_MS = 120;
const DISPLAY_LEAD_MIN_MS = 80;
const DISPLAY_LEAD_MAX_MS = 800;
const DISPLAY_LEAD_DEFAULT_MS = 420;

const telemetrySamples: number[] = [];
const telemetryTickSamples: number[] = [];
const telemetryLogLines: string[] = [];
let telemetryInFlightRenders = 0;
let telemetryMaxQueueDepth = 0;
let estimatedFixedTickDelayMs = DISPLAY_LEAD_DEFAULT_MS;
let displayTickIntervalId: ReturnType<typeof setInterval> | null = null;
let lastDisplayTickSecondSent: number | null = null;

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

function smoothTowards(current: number, target: number, alpha: number): number {
  return current + (target - current) * alpha;
}

function updateTelemetrySummary(lastMs: number, reason: RenderReason): void {
  const summaryEl = getTelemetrySummaryEl();
  if (!summaryEl) return;
  if (!telemetrySamples.length) {
    summaryEl.textContent = 'Waiting for samples...';
    return;
  }

  const avgAllMs = average(telemetrySamples);
  const reference = telemetryTickSamples.length ? telemetryTickSamples : telemetrySamples;
  const avgTickMs = average(reference);
  const sorted = [...reference].sort((a, b) => a - b);
  const fastBucketCount = Math.max(1, Math.floor(sorted.length * TELEMETRY_FAST_BUCKET_RATIO));
  const fixedMs = average(sorted.slice(0, fastBucketCount));
  const variableMs = Math.max(0, avgTickMs - fixedMs);

  summaryEl.textContent =
    `Last (${reason}): ${toMsText(lastMs)}\n` +
    `Average all (${telemetrySamples.length}): ${toMsText(avgAllMs)}\n` +
    `Average tick (${reference.length}): ${toMsText(avgTickMs)}\n` +
    `Fixed delay est. (tick): ${toMsText(fixedMs)}\n` +
    `Variable extra: ${toMsText(variableMs)} | Lead: ${toMsText(estimatedFixedTickDelayMs)} | Max queue: ${telemetryMaxQueueDepth}`;
}

function pushTelemetryLog(line: string): void {
  telemetryLogLines.unshift(`[${nowTimeLabel()}] ${line}`);
  if (telemetryLogLines.length > TELEMETRY_LOG_LIMIT) telemetryLogLines.length = TELEMETRY_LOG_LIMIT;
  const logEl = getTelemetryLogEl();
  if (logEl) logEl.textContent = telemetryLogLines.join('\n');
}

function pushDetailedLog(source: string, message: string): void {
  pushTelemetryLog(source ? `${source} ${message}` : message);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function getRenderRemainingSeconds(reason: RenderReason): number {
  if (!timerState) return 0;
  const state = timerState.getState();
  if (state === TimerState.RUNNING && reason === 'tick') {
    return timerState.getDisplayRemainingSeconds(estimatedFixedTickDelayMs);
  }
  return timerState.getRemainingSeconds();
}

function stopDisplayTicker(): void {
  if (displayTickIntervalId !== null) {
    clearInterval(displayTickIntervalId);
    displayTickIntervalId = null;
    pushDetailedLog('[TICKER]', 'stopped');
  }
  lastDisplayTickSecondSent = null;
}

function startDisplayTicker(): void {
  if (displayTickIntervalId !== null) return;
  displayTickIntervalId = setInterval(() => {
    if (!bridge || !timerState || !isInForeground) return;
    if (timerState.getState() !== TimerState.RUNNING) return;

    const displaySecond = timerState.getDisplayRemainingSeconds(estimatedFixedTickDelayMs);
    if (displaySecond === lastDisplayTickSecondSent) return;

    lastDisplayTickSecondSent = displaySecond;
    pushDetailedLog(
      '[TICKER]',
      `emit displaySecond=${displaySecond}s lead=${estimatedFixedTickDelayMs.toFixed(1)}ms real=${timerState.getRemainingSeconds()}s`,
    );
    sendToGlasses('tick');
  }, DISPLAY_TICKER_INTERVAL_MS);
  pushDetailedLog('[TICKER]', `started interval=${DISPLAY_TICKER_INTERVAL_MS}ms`);
}

function syncDisplayTickerWithState(state: TimerState): void {
  if (state === TimerState.RUNNING) {
    startDisplayTicker();
    return;
  }
  stopDisplayTicker();
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
  if (reason === 'tick') {
    telemetryTickSamples.push(elapsedMs);
    if (telemetryTickSamples.length > TELEMETRY_WINDOW_SIZE) telemetryTickSamples.shift();
  }
  if (queueDepth > telemetryMaxQueueDepth) telemetryMaxQueueDepth = queueDepth;

  updateTelemetrySummary(elapsedMs, reason);

  const reference = telemetryTickSamples.length ? telemetryTickSamples : telemetrySamples;
  const sorted = [...reference].sort((a, b) => a - b);
  const fastBucketCount = Math.max(1, Math.floor(sorted.length * TELEMETRY_FAST_BUCKET_RATIO));
  const fixedMs = average(sorted.slice(0, fastBucketCount));
  const avgRefMs = average(reference);
  const extraMs = Math.max(0, elapsedMs - fixedMs);
  if (reason === 'tick') {
    const variableRefMs = Math.max(0, avgRefMs - fixedMs);
    const targetLeadMs = clamp(fixedMs + variableRefMs * 0.7, DISPLAY_LEAD_MIN_MS, DISPLAY_LEAD_MAX_MS);
    const previousLead = estimatedFixedTickDelayMs;
    estimatedFixedTickDelayMs = smoothTowards(previousLead, targetLeadMs, 0.25);
    if (Math.abs(previousLead - estimatedFixedTickDelayMs) >= 12) {
      pushDetailedLog('[TICKER]', `lead-adjust ${previousLead.toFixed(1)}ms -> ${estimatedFixedTickDelayMs.toFixed(1)}ms`);
    }
  }

  pushDetailedLog(
    '[RENDER]',
    `${reason.toUpperCase()} ${toMsText(elapsedMs)} (fixed ${toMsText(fixedMs)}, extra ${toMsText(extraMs)}, q ${queueDepth}) ` +
    `${state} ${formatTime(remainingSeconds)}`,
  );
}

// ── Phone UI ──────────────────────────────────────────────────────
function clearRemoteStartPending() {
  const hadTimeout = remoteStartTimeoutId !== null;
  const hadInterval = remoteStartCountdownIntervalId !== null;
  if (remoteStartTimeoutId !== null) { clearTimeout(remoteStartTimeoutId); remoteStartTimeoutId = null; }
  if (remoteStartCountdownIntervalId !== null) { clearInterval(remoteStartCountdownIntervalId); remoteStartCountdownIntervalId = null; }
  remoteStartScheduledAt = null;
  pushDetailedLog('[REMOTE]', `clearRemoteStartPending timeout=${hadTimeout} interval=${hadInterval}`);
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
  if (!isInForeground || !bridge || !timerState) {
    pushDetailedLog('[RENDER]', `skip reason=${reason} foreground=${isInForeground} bridge=${Boolean(bridge)} stateMgr=${Boolean(timerState)}`);
    return;
  }
  const state = timerState.getState();
  const selectedPreset = timerState.getSelectedPreset();
  const remainingSeconds = getRenderRemainingSeconds(reason);
  const blinkVisibility = timerState.getBlinkVisibility();
  const startedAt = performance.now();
  telemetryInFlightRenders++;
  const queueDepth = telemetryInFlightRenders;
  pushDetailedLog('[RENDER]', `start reason=${reason} q=${queueDepth} state=${state} t=${formatTime(remainingSeconds)}`);

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
    pushDetailedLog('[RENDER]', `ERR ${reason.toUpperCase()} ${String(err)}`);
    console.error('[Timer] renderUI:', err);
  }).finally(() => {
    telemetryInFlightRenders = Math.max(0, telemetryInFlightRenders - 1);
    pushDetailedLog('[RENDER]', `end reason=${reason} inFlight=${telemetryInFlightRenders}`);
  });
}

function sendToGlassesImmediate(reason: RenderReason = 'manual') {
  if (!bridge || !timerState) {
    pushDetailedLog('[RENDER]', `skip-immediate reason=${reason} bridge=${Boolean(bridge)} stateMgr=${Boolean(timerState)}`);
    return;
  }
  const state = timerState.getState();
  const selectedPreset = timerState.getSelectedPreset();
  const remainingSeconds = getRenderRemainingSeconds(reason);
  const blinkVisibility = timerState.getBlinkVisibility();
  const startedAt = performance.now();
  telemetryInFlightRenders++;
  const queueDepth = telemetryInFlightRenders;
  pushDetailedLog('[RENDER]', `start-immediate reason=${reason} q=${queueDepth} state=${state} t=${formatTime(remainingSeconds)}`);

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
    pushDetailedLog('[RENDER]', `ERR ${reason.toUpperCase()} ${String(err)}`);
    console.error('[Timer] renderUI:', err);
  }).finally(() => {
    telemetryInFlightRenders = Math.max(0, telemetryInFlightRenders - 1);
    pushDetailedLog('[RENDER]', `end-immediate reason=${reason} inFlight=${telemetryInFlightRenders}`);
  });
}

// ── Remote control buttons ────────────────────────────────────────
function setupRemoteControl() {
  const btnStart = document.getElementById('btn-start-pause');
  const btnReset = document.getElementById('btn-reset');
  const presetBtns = document.querySelectorAll('#remote-preset-buttons .preset-btn');
  pushDetailedLog('[REMOTE]', `setupRemoteControl presets=${presetBtns.length}`);

  btnStart?.addEventListener('click', () => {
    if (!timerState || !bridge) return;
    const state = timerState.getState();
    pushDetailedLog('[REMOTE]', `btn-start-pause click state=${state}`);

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
      pushDetailedLog('[REMOTE]', `delayed-start armed delayMs=${REMOTE_START_DELAY_MS}`);
      updateRemoteView();
    }
  });

  btnReset?.addEventListener('click', () => {
    if (!timerState || !bridge) return;
    pushDetailedLog('[REMOTE]', `btn-reset click state=${timerState.getState()}`);
    clearRemoteStartPending();
    timerState.resetToPreset();
  });

  presetBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const min = parseInt((btn as HTMLElement).dataset.preset || '', 10);
      if (!timerState || !bridge || !min) return;
      pushDetailedLog('[REMOTE]', `preset click ${min}`);
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
    pushDetailedLog('[EVENT]', 'setupEventHandlers attached');
    bridge.onEvenHubEvent((event: any) => {
      if (!timerState || !isInForeground) return;
      const type = event?.type || event?.eventType || event?.textEvent?.eventType;
      pushDetailedLog('[EVENT]', `recv type=${String(type)}`);
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
          pushDetailedLog('[EVENT]', 'enterForeground');
          timerState?.handleForeground();
          sendToGlassesImmediate('foreground');
        } else if (event.eventType === 'exitForeground') {
          pushDetailedLog('[EVENT]', 'exitForeground');
          isInForeground = false;
          timerState?.handleBackground();
        }
        return;
      }

      if (event.type === 'tap' || event.eventType === 'tap' || event.eventType === 0 || event.eventType === undefined) {
        const taps = event.tapCount || event.taps || 1;
        pushDetailedLog('[EVENT]', `tap count=${taps}`);
        if (taps === 1) handleSingleTap();
        else if (taps === 2) { timerState.resetToPreset(); }
      }
    });
  } catch (err) {
    pushDetailedLog('[EVENT]', `setup error ${String(err)}`);
    console.error('Error setting up event handlers:', err);
  }
}

function handleSingleTap() {
  if (!timerState || !bridge) return;
  pushDetailedLog('[INPUT]', `singleTap state=${timerState.getState()}`);
  timerState.toggleStartPause();
}

function handleSwipe(dir: 1 | -1) {
  if (!timerState || !bridge) return;
  const now = Date.now();
  const elapsed = now - lastSwipeTime;
  if (elapsed < SWIPE_COOLDOWN_MS) {
    pushDetailedLog('[INPUT]', `swipe ignored dir=${dir} elapsed=${elapsed}ms cooldown=${SWIPE_COOLDOWN_MS}ms`);
    return;
  }
  lastSwipeTime = now;
  pushDetailedLog('[INPUT]', `swipe dir=${dir} accepted`);
  if (dir === 1) timerState.cyclePreset(); else timerState.cyclePresetBackward();
}

// ── Bootstrap ─────────────────────────────────────────────────────
async function init() {
  try {
    pushDetailedLog('[APP]', 'init start');
    setUiDebugLogger((line) => pushDetailedLog('', line));
    updateRemoteView();
    bridge = await waitForEvenAppBridge();
    pushDetailedLog('[APP]', `bridge received=${Boolean(bridge)}`);
    console.log('[Boot] Bridge received');
    updateRemoteView();

    if (!bridge) {
      pushDetailedLog('[APP]', 'bridge unavailable');
      console.error('[Boot] Bridge not available');
      const s = document.getElementById('remote-status');
      if (s) { s.textContent = 'Connection unavailable'; s.className = 'error'; }
      timerState = new TimerStateManager();
      timerState.setOnDebugLog((line) => pushDetailedLog('', line));
      setupRemoteControl();
      updateRemoteView();
      return;
    }

    timerState = new TimerStateManager();
    timerState.setOnDebugLog((line) => pushDetailedLog('', line));
    setupRemoteControl();

    // Every timer tick: phone UI updates instantly, glasses get a render if idle
    timerState.setOnUpdate(() => {
      pushDetailedLog('[CALLBACK]', `onUpdate state=${timerState?.getState()} t=${timerState ? formatTime(timerState.getRemainingSeconds()) : '--:--'}`);
      updateRemoteView();
    });

    // State transitions (start/pause/done): always push to glasses immediately
    timerState.setOnStateChange(() => {
      const state = timerState?.getState();
      pushDetailedLog('[CALLBACK]', `onStateChange state=${state} t=${timerState ? formatTime(timerState.getRemainingSeconds()) : '--:--'}`);
      updateRemoteView();
      if (state) {
        syncDisplayTickerWithState(state);
      }
      sendToGlassesImmediate('state');
    });

    const ok = await createPageContainers(bridge, timerState.getSelectedPreset());
    pushDetailedLog('[APP]', `createPageContainers ok=${ok}`);
    if (!ok) {
      console.error('Failed to create page containers');
      await renderUI(bridge, TimerState.IDLE, 5, 300, true, 'ERROR: container creation failed');
      const s = document.getElementById('remote-status');
      if (s) { s.textContent = 'Display creation error'; s.className = 'error'; }
      return;
    }

    setupEventHandlers();
    await renderUI(bridge, TimerState.IDLE, timerState.getSelectedPreset(), timerState.getRemainingSeconds(), true);
    pushDetailedLog('[APP]', 'initial render complete');
    syncDisplayTickerWithState(timerState.getState());
    isInitialized = true;
    updateRemoteView();
  } catch (err) {
    pushDetailedLog('[APP]', `init error ${String(err)}`);
    console.error('Failed to initialize:', err);
    const s = document.getElementById('remote-status');
    if (s) { s.textContent = `Error: ${err}`; s.className = 'error'; }
  }
}

window.addEventListener('beforeunload', () => {
  pushDetailedLog('[APP]', 'beforeunload');
  stopDisplayTicker();
  clearRemoteStartPending();
  if (bridge && isInitialized) {
    try { bridge.shutDownPageContainer(0); } catch {}
  }
  setUiDebugLogger(null);
  timerState?.cleanup();
});

init();
