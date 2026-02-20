import { waitForEvenAppBridge } from '@evenrealities/even_hub_sdk';
import { TimerStateManager } from './timerState';
import { createPageContainers, renderUI } from './ui';
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
function sendToGlasses() {
  if (!isInForeground || !bridge || !timerState) return;
  renderUI(
    bridge,
    timerState.getState(),
    timerState.getSelectedPreset(),
    timerState.getRemainingSeconds(),
    timerState.getBlinkVisibility(),
  ).catch(err => console.error('[Timer] renderUI:', err));
}

function sendToGlassesImmediate() {
  if (!bridge || !timerState) return;
  renderUI(
    bridge,
    timerState.getState(),
    timerState.getSelectedPreset(),
    timerState.getRemainingSeconds(),
    timerState.getBlinkVisibility(),
  ).catch(err => console.error('[Timer] renderUI:', err));
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
      sendToGlassesImmediate();
      updateRemoteView();
      return;
    }
    if (state === TimerState.PAUSED) {
      clearRemoteStartPending();
      timerState.toggleStartPause();
      sendToGlassesImmediate();
      updateRemoteView();
      return;
    }
    if (state === TimerState.IDLE || state === TimerState.DONE) {
      if (remoteStartScheduledAt !== null) return;
      timerState.start();
      sendToGlassesImmediate();
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
    sendToGlassesImmediate();
    updateRemoteView();
  });

  presetBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const min = parseInt((btn as HTMLElement).dataset.preset || '', 10);
      if (!timerState || !bridge || !min) return;
      timerState.setPreset(min);
      sendToGlassesImmediate();
      updateRemoteView();
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
          sendToGlassesImmediate();
        } else if (event.eventType === 'exitForeground') {
          isInForeground = false;
          timerState?.handleBackground();
        }
        return;
      }

      if (event.type === 'tap' || event.eventType === 'tap' || event.eventType === 0 || event.eventType === undefined) {
        const taps = event.tapCount || event.taps || 1;
        if (taps === 1) handleSingleTap();
        else if (taps === 2) { timerState.resetToPreset(); sendToGlassesImmediate(); updateRemoteView(); }
      }
    });
  } catch (err) {
    console.error('Error setting up event handlers:', err);
  }
}

function handleSingleTap() {
  if (!timerState || !bridge) return;
  timerState.toggleStartPause();
  sendToGlassesImmediate();
  updateRemoteView();
}

function handleSwipe(dir: 1 | -1) {
  if (!timerState || !bridge) return;
  const now = Date.now();
  if (now - lastSwipeTime < SWIPE_COOLDOWN_MS) return;
  lastSwipeTime = now;
  if (dir === 1) timerState.cyclePreset(); else timerState.cyclePresetBackward();
  sendToGlassesImmediate();
  updateRemoteView();
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
      sendToGlasses();
    });

    // State transitions (start/pause/done): always push to glasses immediately
    timerState.setOnStateChange(() => {
      updateRemoteView();
      sendToGlassesImmediate();
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
