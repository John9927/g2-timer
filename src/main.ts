import { waitForEvenAppBridge, StartUpPageCreateResult } from '@evenrealities/even_hub_sdk';
import { TimerStateManager } from './timerState';
import { createPageContainers, renderUI } from './ui';
import { TimerState, CONTAINER_IDS } from './constants';

let bridge: any = null;
let timerState: TimerStateManager | null = null;
let isInitialized = false;
let isInForeground = true;

// Debug view functions for browser fallback
function updateDebugView() {
  const bridgeStatus = document.getElementById('bridge-status');
  const timerDisplay = document.getElementById('timer-display');
  const presetDisplay = document.getElementById('preset-display');
  const stateDisplay = document.getElementById('state-display');
  const containerStatus = document.getElementById('container-status');

  if (bridgeStatus) {
    bridgeStatus.textContent = bridge ? 'Bridge: Connected ✓' : 'Bridge: Waiting...';
    bridgeStatus.className = bridge ? 'debug-line success' : 'debug-line status';
  }

  if (timerState) {
    if (timerDisplay) {
      const mins = Math.floor(timerState.getRemainingSeconds() / 60);
      const secs = timerState.getRemainingSeconds() % 60;
      timerDisplay.textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }
    if (presetDisplay) {
      presetDisplay.textContent = `Preset: ${timerState.getSelectedPreset()} min`;
    }
    if (stateDisplay) {
      stateDisplay.textContent = `State: ${timerState.getState()}`;
    }
  }

  if (containerStatus) {
    containerStatus.textContent = isInitialized ? 'Containers: Created ✓' : 'Containers: --';
    containerStatus.className = isInitialized ? 'debug-line success' : 'debug-line';
  }
}

// Initialize the app
async function init() {
  try {
    updateDebugView(); // Initial debug view update
    console.log('[Boot] 🔌 Inizializzazione bridge Even...');
    bridge = await waitForEvenAppBridge();
    console.log('[Boot] ✅ Bridge Even ricevuto');
    console.log('[Boot] 📊 Bridge disponibile:', !!bridge);
    if (bridge) {
      console.log('[Boot] 📊 Bridge methods:', Object.keys(bridge || {}));
    }
    updateDebugView(); // Update after bridge connection
    
    if (!bridge) {
      console.error('[Boot] ❌ Bridge non disponibile!');
      const bridgeStatus = document.getElementById('bridge-status');
      if (bridgeStatus) {
        bridgeStatus.textContent = 'Bridge: Not available ❌';
        bridgeStatus.className = 'debug-line error';
      }
      return;
    }

    timerState = new TimerStateManager();

    // Set up update callback (called every second when running)
    timerState.setOnUpdate(() => {
      if (isInForeground && bridge && timerState) {
        renderUI(
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
    timerState.setOnStateChange(() => {
      if (isInForeground && bridge && timerState) {
        renderUI(
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

    // Create page containers once
    const containersCreated = await createPageContainers(bridge);
    if (!containersCreated) {
      console.error('Failed to create page containers');
      return;
    }

    // IMPORTANT: Even if containers have initial content, we MUST call textContainerUpgrade
    // immediately after creation to make them visible on real hardware
    // Based on working project pattern
    if (timerState && bridge) {
      // First update immediately
      renderUI(
        bridge,
        timerState.getState(),
        timerState.getSelectedPreset(),
        timerState.getRemainingSeconds(),
        timerState.getBlinkVisibility()
      );
      
      // Also update after a small delay (like working project does)
      setTimeout(() => {
        if (timerState && bridge) {
          renderUI(
            bridge,
            timerState.getState(),
            timerState.getSelectedPreset(),
            timerState.getRemainingSeconds(),
            timerState.getBlinkVisibility()
          );
        }
      }, 100);
    }

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
      bridgeStatus.textContent = `Error: ${error}`;
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

// Set up event handlers for taps and system events
function setupEventHandlers() {
  if (!bridge) return;

  try {
    bridge.onEvenHubEvent((event: any) => {
      if (!timerState || !isInForeground) return;

      console.log('Even Hub event:', event);

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
            );
          }
        } else if (event.eventType === 'exitForeground') {
          isInForeground = false;
          if (timerState) {
            timerState.handleBackground();
          }
        }
        return;
      }

      // Handle tap events
      if (event.type === 'tap' || event.eventType === 'tap') {
        const containerID = event.containerID || event.containerId;

        // Check for multi-tap support
        const tapCount = event.tapCount || event.taps || 1;

        if (containerID) {
          // Container-based taps
          handleContainerTap(containerID, tapCount);
        } else {
          // Global tap (if supported)
          handleGlobalTap(tapCount);
        }
      }
    });
  } catch (error) {
    console.error('Error setting up event handlers:', error);
  }
}

// Handle container-specific taps
function handleContainerTap(containerID: number | string, tapCount: number) {
  if (!timerState) return;

  // Convert to number if string
  const id = typeof containerID === 'string' ? parseInt(containerID, 10) : containerID;

  if (id === CONTAINER_IDS.PRESET_ROW) {
    // Tap on preset row: cycle preset
    timerState.cyclePreset();
  } else if (containerID === CONTAINER_IDS.TIME_DISPLAY) {
    // Tap on time display: start/pause toggle
    timerState.toggleStartPause();
  } else if (
    containerID === CONTAINER_IDS.TITLE ||
    containerID === CONTAINER_IDS.STATUS
  ) {
    // Tap on title or status: reset
    timerState.resetToPreset();
  }
}

// Handle global taps (multi-tap if supported)
function handleGlobalTap(tapCount: number) {
  if (!timerState) return;

  if (tapCount === 1) {
    // Single tap: cycle preset
    timerState.cyclePreset();
  } else if (tapCount === 2) {
    // Double tap: start/pause toggle
    timerState.toggleStartPause();
  } else if (tapCount === 3) {
    // Triple tap: reset
    timerState.resetToPreset();
  }
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
