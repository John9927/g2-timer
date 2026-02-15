import { waitForEvenAppBridge } from '@evenrealities/even_hub_sdk';
import { TimerStateManager } from './timerState';
import { createPageContainers, renderUI } from './ui';
import { TimerState } from './constants';

let bridge: any = null;
let timerState: TimerStateManager | null = null;
let isInitialized = false;
let isInForeground = true;
let debugLog: string[] = [];
const MAX_DEBUG_LOG = 5; // Keep last 5 log messages

function getStatoLabel(state: TimerState): string {
  switch (state) {
    case TimerState.IDLE:
      return 'IN_ATTESA';
    case TimerState.RUNNING:
      return 'IN_CORSO';
    case TimerState.PAUSED:
      return 'IN_PAUSA';
    case TimerState.DONE:
      return 'COMPLETATO';
    default:
      return state;
  }
}

// Debug logging function that shows on glasses display
function debugLogToDisplay(message: string) {
  const timestamp = new Date().toLocaleTimeString();
  const logMessage = `[${timestamp}] ${message}`;
  console.log(logMessage);
  debugLog.push(logMessage);
  if (debugLog.length > MAX_DEBUG_LOG) {
    debugLog.shift();
  }
  // Update debug view in browser
  updateDebugView();
}

// Debug view functions for browser fallback
function updateDebugView() {
  const bridgeStatus = document.getElementById('bridge-status');
  const timerDisplay = document.getElementById('timer-display');
  const presetDisplay = document.getElementById('preset-display');
  const stateDisplay = document.getElementById('state-display');
  const containerStatus = document.getElementById('container-status');

  if (bridgeStatus) {
    bridgeStatus.textContent = bridge ? 'Connessione: attiva' : 'Connessione: in attesa...';
    bridgeStatus.className = bridge ? 'debug-line success' : 'debug-line status';
  }

  if (timerState) {
    if (timerDisplay) {
      const mins = Math.floor(timerState.getRemainingSeconds() / 60);
      const secs = timerState.getRemainingSeconds() % 60;
      timerDisplay.textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }
    if (presetDisplay) {
      presetDisplay.textContent = `Durata: ${timerState.getSelectedPreset()} min`;
    }
    if (stateDisplay) {
      stateDisplay.textContent = `Stato: ${getStatoLabel(timerState.getState())}`;
    }
  }

  if (containerStatus) {
    containerStatus.textContent = isInitialized ? 'Container: creati' : 'Container: --';
    containerStatus.className = isInitialized ? 'debug-line success' : 'debug-line';
  }
  
  // Show debug logs in browser
  const debugLogElement = document.getElementById('debug-logs');
  if (debugLogElement) {
    debugLogElement.innerHTML = debugLog.slice(-3).map(log => `<div class="debug-line" style="font-size: 12px; color: #888;">${log}</div>`).join('');
  }
}

// Initialize the app
async function init() {
  try {
    updateDebugView(); // Initial debug view update
    debugLogToDisplay('Inizializzazione bridge...');
    bridge = await waitForEvenAppBridge();
    debugLogToDisplay('Bridge ricevuto');
    console.log('[Boot] ✅ Bridge Even ricevuto');
    console.log('[Boot] 📊 Bridge disponibile:', !!bridge);
    if (bridge) {
      console.log('[Boot] 📊 Bridge methods:', Object.keys(bridge || {}));
    }
    updateDebugView(); // Update after bridge connection
    
    if (!bridge) {
      debugLogToDisplay('ERRORE: Bridge non disponibile!');
      console.error('[Boot] ❌ Bridge non disponibile!');
      const bridgeStatus = document.getElementById('bridge-status');
      if (bridgeStatus) {
        bridgeStatus.textContent = 'Connessione: non disponibile';
        bridgeStatus.className = 'debug-line error';
      }
      return;
    }

    timerState = new TimerStateManager();

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
      // Update debug view in browser
      updateDebugView();
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
      // Update debug view in browser
      updateDebugView();
    });

    // Create page containers once - show preset selection initially
    debugLogToDisplay('Creazione container...');
    const containersCreated = await createPageContainers(bridge, timerState.getSelectedPreset());
    if (!containersCreated) {
      debugLogToDisplay('ERRORE: Creazione container fallita!');
      console.error('Failed to create page containers');
      // Show error on glasses display
      if (bridge) {
        await renderUI(bridge, TimerState.IDLE, 5, 300, true, 'ERRORE: creazione container fallita');
      }
      return;
    }
    debugLogToDisplay('Container creati OK');

    // Both containers (text + image) are now created at startup.
    // No delay needed – preset text is already set via createStartUpPageContainer.
    debugLogToDisplay('Container creati, display pronto');

    // Set up event handlers
    setupEventHandlers();

    isInitialized = true;
    updateDebugView(); // Final update
    
    // Add click handlers for browser testing (fallback when bridge is not available)
    if (!bridge) {
      setupBrowserClickHandlers();
    }
  } catch (error) {
    console.error('Failed to initialize Even Hub app:', error);
    const bridgeStatus = document.getElementById('bridge-status');
    if (bridgeStatus) {
      bridgeStatus.textContent = `Errore: ${error}`;
      bridgeStatus.className = 'debug-line error';
    }
  }
}

// Setup click handlers for browser testing (when bridge is not available)
function setupBrowserClickHandlers() {
  const debugContainer = document.getElementById('debug-container');
  if (!debugContainer || !timerState) return;

  let tapTimeout: number | null = null;
  let tapCount = 0;

  debugContainer.addEventListener('click', () => {
    tapCount++;
    
    if (tapTimeout) {
      clearTimeout(tapTimeout);
    }
    
    tapTimeout = window.setTimeout(() => {
      // Single tap: cycle preset
      if (tapCount === 1) {
        timerState?.cyclePreset();
      }
      // Double tap: start/pause
      else if (tapCount === 2) {
        timerState?.toggleStartPause();
      }
      // Triple tap: reset
      else if (tapCount === 3) {
        timerState?.resetToPreset();
      }
      
      updateDebugView();
      tapCount = 0;
    }, 300);
  });
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
            updateDebugView();
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
  debugLogToDisplay('Tocco: timer avviato/pausato');
  
  await renderUI(
    bridge,
    timerState.getState(),
    timerState.getSelectedPreset(),
    timerState.getRemainingSeconds(),
    timerState.getBlinkVisibility()
  );
  updateDebugView();
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
  debugLogToDisplay('Scorrimento destra: preset successivo');
  
  await renderUI(
    bridge,
    timerState.getState(),
    timerState.getSelectedPreset(),
    timerState.getRemainingSeconds(),
    timerState.getBlinkVisibility()
  );
  updateDebugView();
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
  debugLogToDisplay('Scorrimento sinistra: preset precedente');
  
  await renderUI(
    bridge,
    timerState.getState(),
    timerState.getSelectedPreset(),
    timerState.getRemainingSeconds(),
    timerState.getBlinkVisibility()
  );
  updateDebugView();
}

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
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

