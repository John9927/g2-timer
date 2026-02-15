import { waitForEvenAppBridge } from '@evenrealities/even_hub_sdk';
import { TimerStateManager } from './timerState';
import { createPageContainers, renderUI } from './ui';
import { TimerState, CONTAINER_IDS } from './constants';

let bridge: any = null;
let timerState: TimerStateManager | null = null;
let isInitialized = false;
let isInForeground = true;

// Initialize the app
async function init() {
  try {
    bridge = await waitForEvenAppBridge();
    console.log('Even Hub bridge connected');

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
    });

    // Create page containers once
    createPageContainers(bridge);

    // Initial render
    if (timerState) {
      renderUI(
        bridge,
        timerState.getState(),
        timerState.getSelectedPreset(),
        timerState.getRemainingSeconds(),
        timerState.getBlinkVisibility()
      );
    }

    // Set up event handlers
    setupEventHandlers();

    isInitialized = true;
  } catch (error) {
    console.error('Failed to initialize Even Hub app:', error);
  }
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
function handleContainerTap(containerID: string, tapCount: number) {
  if (!timerState) return;

  if (containerID === CONTAINER_IDS.PRESET_ROW) {
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
