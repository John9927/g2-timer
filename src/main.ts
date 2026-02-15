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

function clearRemoteStartPending() {
  if (remoteStartTimeoutId !== null) {
    clearTimeout(remoteStartTimeoutId);
    remoteStartTimeoutId = null;
  }
  if (remoteStartCountdownIntervalId !== null) {
    clearInterval(remoteStartCountdownIntervalId);
    remoteStartCountdownIntervalId = null;
  }
  remoteStartScheduledAt = null;
}

function getStatoLabel(state: TimerState): string {
  switch (state) {
    case TimerState.IDLE:
      return 'In attesa';
    case TimerState.RUNNING:
      return 'In corso';
    case TimerState.PAUSED:
      return 'In pausa';
    case TimerState.DONE:
      return 'Completato';
    default:
      return state;
  }
}

function updateRemoteView() {
  const remoteTime = document.getElementById('remote-time');
  const remoteState = document.getElementById('remote-state');
  const remoteStatus = document.getElementById('remote-status');
  const btnStartPause = document.getElementById('btn-start-pause') as HTMLButtonElement | null;
  const btnReset = document.getElementById('btn-reset') as HTMLButtonElement | null;
  const presetButtons = document.querySelectorAll('#remote-preset-buttons .preset-btn');

  const connected = !!(bridge && timerState);
  if (remoteStatus) {
    remoteStatus.textContent = connected
      ? (isInitialized ? 'Connesso – display pronto' : 'Connesso – inizializzazione...')
      : 'Connessione in attesa...';
    remoteStatus.className = connected ? 'connected' : '';
  }

  const isPendingStart = remoteStartScheduledAt !== null;

  if (timerState) {
    const mins = Math.floor(timerState.getRemainingSeconds() / 60);
    const secs = timerState.getRemainingSeconds() % 60;
    const timeStr = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    if (remoteTime) remoteTime.textContent = timeStr;
    if (remoteState) {
      if (isPendingStart) {
        const remaining = Math.ceil((REMOTE_START_DELAY_MS - (Date.now() - remoteStartScheduledAt!)) / 1000);
        remoteState.textContent = remaining > 0 ? `Avvio tra ${remaining}…` : 'Avvio…';
        remoteState.className = 'running';
      } else {
        remoteState.textContent = getStatoLabel(timerState.getState());
        remoteState.className = timerState.getState().toLowerCase();
      }
    }

    const preset = timerState.getSelectedPreset();
    presetButtons.forEach((btn) => {
      const p = parseInt((btn as HTMLElement).dataset.preset || '', 10);
      btn.classList.toggle('selected', p === preset);
      (btn as HTMLButtonElement).disabled = !connected || isPendingStart;
    });

    if (btnStartPause) {
      btnStartPause.disabled = !connected;
      const isRunning = timerState.getState() === TimerState.RUNNING;
      if (isPendingStart) {
        btnStartPause.textContent = 'Attendere…';
        btnStartPause.classList.remove('pause-mode');
      } else {
        btnStartPause.textContent = isRunning ? 'Pausa' : 'Avvia';
        btnStartPause.classList.toggle('pause-mode', isRunning);
      }
    }
    if (btnReset) btnReset.disabled = !connected;
  } else {
    if (remoteTime) remoteTime.textContent = '--:--';
    if (remoteState) {
      remoteState.textContent = 'Stato';
      remoteState.className = 'idle';
    }
    presetButtons.forEach((btn) => {
      btn.classList.remove('selected');
      (btn as HTMLButtonElement).disabled = true;
    });
    if (btnStartPause) { btnStartPause.disabled = true; btnStartPause.textContent = 'Avvia'; }
    if (btnReset) btnReset.disabled = true;
  }
}

function setupRemoteControl() {
  const btnStartPause = document.getElementById('btn-start-pause');
  const btnReset = document.getElementById('btn-reset');
  const presetButtons = document.querySelectorAll('#remote-preset-buttons .preset-btn');

  btnStartPause?.addEventListener('click', () => {
    if (!timerState || !bridge) return;
    const state = timerState.getState();

    if (state === TimerState.RUNNING) {
      clearRemoteStartPending();
      timerState.toggleStartPause();
      renderUI(
        bridge,
        timerState.getState(),
        timerState.getSelectedPreset(),
        timerState.getRemainingSeconds(),
        timerState.getBlinkVisibility()
      ).catch((err) => console.error('Error rendering:', err));
      updateRemoteView();
      return;
    }

    if (state === TimerState.PAUSED) {
      clearRemoteStartPending();
      timerState.toggleStartPause();
      renderUI(
        bridge,
        timerState.getState(),
        timerState.getSelectedPreset(),
        timerState.getRemainingSeconds(),
        timerState.getBlinkVisibility()
      ).catch((err) => console.error('Error rendering:', err));
      updateRemoteView();
      return;
    }

    if (state === TimerState.IDLE || state === TimerState.DONE) {
      if (remoteStartScheduledAt !== null) return;
      remoteStartScheduledAt = Date.now();
      remoteStartCountdownIntervalId = setInterval(() => updateRemoteView(), REMOTE_START_COUNTDOWN_INTERVAL_MS);
      remoteStartTimeoutId = setTimeout(() => {
        clearRemoteStartPending();
        if (!timerState || !bridge) return;
        timerState.start();
        renderUI(
          bridge,
          timerState.getState(),
          timerState.getSelectedPreset(),
          timerState.getRemainingSeconds(),
          timerState.getBlinkVisibility()
        ).catch((err) => console.error('Error rendering:', err));
        updateRemoteView();
      }, REMOTE_START_DELAY_MS);
      updateRemoteView();
    }
  });

  btnReset?.addEventListener('click', () => {
    if (!timerState || !bridge) return;
    clearRemoteStartPending();
    timerState.resetToPreset();
    renderUI(
      bridge,
      timerState.getState(),
      timerState.getSelectedPreset(),
      timerState.getRemainingSeconds(),
      timerState.getBlinkVisibility()
    ).catch((err) => console.error('Error rendering:', err));
    updateRemoteView();
  });

  presetButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const minutes = parseInt((btn as HTMLElement).dataset.preset || '', 10);
      if (!timerState || !bridge || !minutes) return;
      timerState.setPreset(minutes);
      renderUI(
        bridge,
        timerState.getState(),
        timerState.getSelectedPreset(),
        timerState.getRemainingSeconds(),
        timerState.getBlinkVisibility()
      ).catch((err) => console.error('Error rendering:', err));
      updateRemoteView();
    });
  });
}

// Initialize the app
async function init() {
  try {
    updateRemoteView();
    bridge = await waitForEvenAppBridge();
    console.log('[Boot] ✅ Bridge Even ricevuto');
    console.log('[Boot] 📊 Bridge disponibile:', !!bridge);
    if (bridge) {
      console.log('[Boot] 📊 Bridge methods:', Object.keys(bridge || {}));
    }
    updateRemoteView();

    if (!bridge) {
      console.error('[Boot] ❌ Bridge non disponibile!');
      const remoteStatus = document.getElementById('remote-status');
      if (remoteStatus) {
        remoteStatus.textContent = 'Connessione non disponibile';
        remoteStatus.className = 'error';
      }
      timerState = new TimerStateManager();
      setupRemoteControl();
      updateRemoteView();
      return;
    }

    timerState = new TimerStateManager();
    setupRemoteControl();

    // Set up update callback (called every second when running)
    timerState.setOnUpdate(async () => {
      if (isInForeground && bridge && timerState) {
        await renderUI(
          bridge,
          timerState.getState(),
          timerState.getSelectedPreset(),
          timerState.getRemainingSeconds(),
          timerState.getBlinkVisibility()
        );
      }
      updateRemoteView();
    });

    // Set up state change callback (called when state changes)
    timerState.setOnStateChange(async () => {
      if (isInForeground && bridge && timerState) {
        await renderUI(
          bridge,
          timerState.getState(),
          timerState.getSelectedPreset(),
          timerState.getRemainingSeconds(),
          timerState.getBlinkVisibility()
        );
      }
      updateRemoteView();
    });

    // Create page containers once - show preset selection initially
    const containersCreated = await createPageContainers(bridge, timerState.getSelectedPreset());
    if (!containersCreated) {
      console.error('Failed to create page containers');
      if (bridge) {
        await renderUI(bridge, TimerState.IDLE, 5, 300, true, 'ERRORE: creazione container fallita');
      }
      const remoteStatus = document.getElementById('remote-status');
      if (remoteStatus) {
        remoteStatus.textContent = 'Errore creazione display';
        remoteStatus.className = 'error';
      }
      return;
    }

    setupEventHandlers();
    isInitialized = true;
    updateRemoteView();
  } catch (error) {
    console.error('Failed to initialize Even Hub app:', error);
    const remoteStatus = document.getElementById('remote-status');
    if (remoteStatus) {
      remoteStatus.textContent = `Errore: ${error}`;
      remoteStatus.className = 'error';
    }
  }
}

// Swipe throttling to prevent rapid duplicate events
let lastSwipeTime = 0;
const SWIPE_COOLDOWN_MS = 300; // 300ms cooldown between swipes

// Set up event handlers for taps and system events
function setupEventHandlers() {
  if (!bridge) return;

  try {
    bridge.onEvenHubEvent((event: any) => {
      if (!timerState || !isInForeground) return;

      console.log('Even Hub event:', event);
      
      // Handle text container events (swipes come as SCROLL_TOP/SCROLL_BOTTOM events)
      // According to docs: SCROLL_TOP_EVENT (1) = swipe forward, SCROLL_BOTTOM_EVENT (2) = swipe back
      if (event.textEvent) {
        const textEvent = event.textEvent;
        const eventType = textEvent.eventType;
        
        console.log('Text event detected:', { eventType, textEvent });
        
        // SCROLL_TOP_EVENT = 1 (swipe forward/up) = next preset
        // SCROLL_BOTTOM_EVENT = 2 (swipe back/down) = previous preset
        if (eventType === 1) {
          // Swipe forward/up: next preset
          console.log('SCROLL_TOP detected - swipe forward');
          handleSwipeRight().catch(err => console.error('Error handling swipe right:', err));
        } else if (eventType === 2) {
          // Swipe back/down: previous preset
          console.log('SCROLL_BOTTOM detected - swipe back');
          handleSwipeLeft().catch(err => console.error('Error handling swipe left:', err));
        }
      }

      // Handle system events (foreground/background)
      if (event.type === 'sysEvent') {
        if (event.eventType === 'enterForeground') {
          isInForeground = true;
          if (timerState) {
            timerState.handleForeground();
            renderUI(
              bridge,
              timerState.getState(),
              timerState.getSelectedPreset(),
              timerState.getRemainingSeconds(),
              timerState.getBlinkVisibility()
            ).catch(err => console.error('Error rendering:', err));
          }
        } else if (event.eventType === 'exitForeground') {
          isInForeground = false;
          if (timerState) {
            timerState.handleBackground();
          }
        }
        return;
      }

      // Handle tap events (CLICK_EVENT = 0, but SDK normalizes 0 to undefined)
      // Single tap should start/pause timer, NOT change preset
      // Check both textEvent and direct eventType
      if (event.textEvent) {
        const textEvent = event.textEvent;
        const eventType = textEvent.eventType;
        
        // CLICK_EVENT = 0, but SDK may normalize to undefined
        // Only handle single clicks here (not scroll events)
        if (eventType === 0 || eventType === undefined) {
          const containerID = textEvent.containerID;
          console.log('Click event detected:', { containerID, textEvent });
          // Single tap: start/pause timer
          handleSingleTap();
        }
      } else if (event.type === 'tap' || event.eventType === 'tap' || event.eventType === 0 || event.eventType === undefined) {
        const tapCount = event.tapCount || event.taps || 1;

        // Single tap: start/pause timer
        if (tapCount === 1) {
          handleSingleTap();
        } else if (tapCount === 2) {
          // Double tap: reset timer
          if (timerState) {
            timerState.resetToPreset();
            if (bridge) {
              renderUI(
                bridge,
                timerState.getState(),
                timerState.getSelectedPreset(),
                timerState.getRemainingSeconds(),
                timerState.getBlinkVisibility()
              );
            }
            updateRemoteView();
          }
        }
      }

    });
  } catch (error) {
    console.error('Error setting up event handlers:', error);
  }
}

// Handle single tap: start/pause timer
async function handleSingleTap() {
  if (!timerState || !bridge) return;
  
  console.log('Single tap: start/pause timer');
  timerState.toggleStartPause();
  await renderUI(
    bridge,
    timerState.getState(),
    timerState.getSelectedPreset(),
    timerState.getRemainingSeconds(),
    timerState.getBlinkVisibility()
  );
  updateRemoteView();
}

// Handle swipe right: next preset (SCROLL_TOP_EVENT = 1)
async function handleSwipeRight() {
  if (!timerState || !bridge) return;
  
  // Throttle swipes to prevent rapid duplicate events
  const now = Date.now();
  if (now - lastSwipeTime < SWIPE_COOLDOWN_MS) {
    console.log('Swipe throttled');
    return;
  }
  lastSwipeTime = now;
  
  timerState.cyclePreset();

  await renderUI(
    bridge,
    timerState.getState(),
    timerState.getSelectedPreset(),
    timerState.getRemainingSeconds(),
    timerState.getBlinkVisibility()
  );
  updateRemoteView();
}

// Handle swipe left: previous preset (SCROLL_BOTTOM_EVENT = 2)
async function handleSwipeLeft() {
  if (!timerState || !bridge) return;
  
  // Throttle swipes to prevent rapid duplicate events
  const now = Date.now();
  if (now - lastSwipeTime < SWIPE_COOLDOWN_MS) {
    console.log('Swipe throttled');
    return;
  }
  lastSwipeTime = now;
  
  timerState.cyclePresetBackward();

  await renderUI(
    bridge,
    timerState.getState(),
    timerState.getSelectedPreset(),
    timerState.getRemainingSeconds(),
    timerState.getBlinkVisibility()
  );
  updateRemoteView();
}

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
  clearRemoteStartPending();
  if (bridge && isInitialized) {
    try {
      bridge.shutDownPageContainer(0);
    } catch (error) {
      console.error('Error shutting down page container:', error);
    }
  }
  if (timerState) {
    timerState.cleanup();
  }
});

// Start the app
init();

