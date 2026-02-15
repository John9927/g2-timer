import {
  CANVAS_WIDTH,
  CANVAS_HEIGHT,
  PRESETS,
  CONTAINER_IDS,
  CONTAINER_NAMES,
  LAYOUT,
  TimerState,
} from './constants';
import type { TimerStateData } from './timerState';
import { StartUpPageCreateResult } from '@evenrealities/even_hub_sdk';

// Format seconds as MM:SS
export function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

// Create text content for preset row with highlighting
export function formatPresetRow(selectedPreset: number): string {
  return PRESETS.map((preset) => {
    if (preset === selectedPreset) {
      return `[${preset}]`;
    }
    return `${preset}`;
  }).join(' ');
}

// Get status text
export function getStatusText(state: TimerState): string {
  return state;
}

// Calculate text content length and offset for textContainerUpgrade
// IMPORTANT: Based on working project, contentLength should be string length, not byte length!
export function getTextMetrics(text: string): { contentLength: number; contentOffset: number } {
  // For Even Hub SDK, contentLength is the STRING LENGTH, not byte length
  // Always use contentOffset: 0 for updates (as per working project)
  return {
    contentLength: text.length,
    contentOffset: 0,
  };
}

// Create a simple monochrome image data for status icon
// Returns a small green square/icon as Uint8Array (1-bit per pixel, packed)
export function createStatusIcon(state: TimerState): Uint8Array | null {
  // For simplicity, create a small 8x8 icon
  // In a real implementation, you'd create proper icon data
  // For now, return null to avoid image updates unless needed
  // If you want to add icons, create 8x8 or 16x16 monochrome bitmaps
  return null;
}

// Reset function (kept for compatibility, but not needed with new approach)
export function resetPreviousTexts(): void {
  // No-op: we always use contentOffset: 0 now
}

// Track current screen type
let currentScreenType: 'preset' | 'timer' | null = null;

// Render preset selection screen (IDLE state)
async function renderPresetSelection(
  bridge: any,
  selectedPreset: number
): Promise<void> {
  if (!bridge) return;

  try {
    // Create beautiful preset selection screen
    const presetLines = PRESETS.map((preset) => {
      if (preset === selectedPreset) {
        // Selected preset: highlighted with brackets and spacing
        return `  > ${preset} min  <`;
      }
      return `    ${preset} min`;
    }).join('\n');

    const content = `Scegli i minuti\n\n${presetLines}\n\nSwipe per cambiare\nTocca per avviare`;

    const textContainer: any = {
      xPosition: 0,
      yPosition: 0,
      width: 576,
      height: 288,
      borderWidth: 0,
      borderColor: 0,
      paddingLength: 20,
      containerID: 1,
      containerName: "preset-selection",
      content: content,
      isEventCapture: 1,
    };

    const container: any = {
      containerTotalNum: 1,
      textObject: [textContainer],
    };

    console.log('[UI] Rebuilding to preset selection screen');
    await bridge.rebuildPageContainer(container);
    currentScreenType = 'preset';
  } catch (error) {
    console.error('Error rendering preset selection:', error);
  }
}

// Render timer screen (RUNNING/PAUSED/DONE state) - FULL SCREEN LARGE
async function renderTimerScreen(
  bridge: any,
  state: TimerState,
  remainingSeconds: number,
  isBlinkingVisible: boolean = true
): Promise<void> {
  if (!bridge) return;

  try {
    const timeText = formatTime(remainingSeconds);
    
    // Create a FULL SCREEN timer with maximum spacing
    // Use many newlines to center vertically and make it appear larger
    // The font is fixed size, but we can use spacing to make it feel bigger
    const verticalPadding = '\n\n\n\n\n\n\n\n\n\n'; // 10 newlines top
    const verticalPaddingBottom = '\n\n\n\n\n\n\n\n\n\n'; // 10 newlines bottom
    
    // Center horizontally by adding spaces (approximate centering)
    // Timer format is MM:SS (5 chars), screen is ~576px wide
    // With padding 20, we have ~536px for text
    // Try to center by adding spaces before
    const horizontalPadding = '                    '; // ~20 spaces
    
    let content = `${verticalPadding}${horizontalPadding}${timeText}${verticalPaddingBottom}`;
    
    // Add status if paused
    if (state === TimerState.PAUSED) {
      content = `${verticalPadding}${horizontalPadding}${timeText}\n\n${horizontalPadding}PAUSED${verticalPaddingBottom}`;
    } else if (state === TimerState.DONE && isBlinkingVisible) {
      content = `${verticalPadding}${horizontalPadding}${timeText}\n\n${horizontalPadding}COMPLETATO${verticalPaddingBottom}`;
    }

    const textContainer: any = {
      xPosition: 0,
      yPosition: 0,
      width: 576,
      height: 288,
      borderWidth: 0,
      borderColor: 0,
      paddingLength: 0, // No padding to maximize space
      containerID: 1,
      containerName: "timer-display",
      content: content,
      isEventCapture: 1,
    };

    const container: any = {
      containerTotalNum: 1,
      textObject: [textContainer],
    };

    console.log('[UI] Rebuilding to timer screen (full screen)');
    await bridge.rebuildPageContainer(container);
    currentScreenType = 'timer';
  } catch (error) {
    console.error('Error rendering timer screen:', error);
  }
}

// Update timer screen content (when already showing timer)
function updateTimerScreen(
  bridge: any,
  state: TimerState,
  remainingSeconds: number,
  isBlinkingVisible: boolean = true
): void {
  if (!bridge) return;

  try {
    const timeText = formatTime(remainingSeconds);
    
    const verticalPadding = '\n\n\n\n\n\n\n\n\n\n';
    const verticalPaddingBottom = '\n\n\n\n\n\n\n\n\n\n';
    const horizontalPadding = '                    ';
    
    let content = `${verticalPadding}${horizontalPadding}${timeText}${verticalPaddingBottom}`;
    
    if (state === TimerState.PAUSED) {
      content = `${verticalPadding}${horizontalPadding}${timeText}\n\n${horizontalPadding}PAUSED${verticalPaddingBottom}`;
    } else if (state === TimerState.DONE && isBlinkingVisible) {
      content = `${verticalPadding}${horizontalPadding}${timeText}\n\n${horizontalPadding}COMPLETATO${verticalPaddingBottom}`;
    }

    const metrics = getTextMetrics(content);
    
    bridge.textContainerUpgrade({
      containerID: 1,
      containerName: "timer-display",
      content: content,
      contentLength: metrics.contentLength,
      contentOffset: metrics.contentOffset,
    });
  } catch (error) {
    console.error('Error updating timer screen:', error);
  }
}

// Render all UI elements - switches between preset selection and timer screen
export async function renderUI(
  bridge: any,
  state: TimerState,
  selectedPreset: number,
  remainingSeconds: number,
  isBlinkingVisible: boolean = true,
  debugMessage?: string
): Promise<void> {
  if (!bridge) return;

  try {
    // If debug message, show it
    if (debugMessage) {
      const metrics = getTextMetrics(debugMessage);
      bridge.textContainerUpgrade({
        containerID: 1,
        containerName: currentScreenType === 'timer' ? "timer-display" : "preset-selection",
        content: debugMessage,
        contentLength: metrics.contentLength,
        contentOffset: metrics.contentOffset,
      });
      return;
    }

    // Show preset selection when IDLE
    if (state === TimerState.IDLE) {
      if (currentScreenType !== 'preset') {
        await renderPresetSelection(bridge, selectedPreset);
      } else {
        // Just update content if already showing preset
        const presetLines = PRESETS.map((preset) => {
          if (preset === selectedPreset) {
            return `  > ${preset} min  <`;
          }
          return `    ${preset} min`;
        }).join('\n');
        const content = `Scegli i minuti\n\n${presetLines}\n\nSwipe per cambiare\nTocca per avviare`;
        const metrics = getTextMetrics(content);
        bridge.textContainerUpgrade({
          containerID: 1,
          containerName: "preset-selection",
          content: content,
          contentLength: metrics.contentLength,
          contentOffset: metrics.contentOffset,
        });
      }
    } else {
      // Show timer screen when RUNNING, PAUSED, or DONE
      if (currentScreenType !== 'timer') {
        // Rebuild to timer screen (full screen, large)
        await renderTimerScreen(bridge, state, remainingSeconds, isBlinkingVisible);
      } else {
        // Just update time if already showing timer
        updateTimerScreen(bridge, state, remainingSeconds, isBlinkingVisible);
      }
    }
  } catch (error) {
    console.error('Error rendering UI:', error);
  }
}

// Create initial page containers - shows preset selection screen
export async function createPageContainers(bridge: any, selectedPreset: number = 5): Promise<boolean> {
  if (!bridge) return false;

  try {
    // Create preset selection screen directly as initial view
    const presetLines = PRESETS.map((preset) => {
      if (preset === selectedPreset) {
        return `  > ${preset} min  <`;
      }
      return `    ${preset} min`;
    }).join('\n');

    const content = `Scegli i minuti\n\n${presetLines}\n\nSwipe per cambiare\nTocca per avviare`;

    const textContainer: any = {
      xPosition: 0,
      yPosition: 0,
      width: 576,
      height: 288,
      borderWidth: 0,
      borderColor: 0,
      paddingLength: 20,
      containerID: 1,
      containerName: "preset-selection",
      content: content,
      isEventCapture: 1,
    };

    const container: any = {
      containerTotalNum: 1,
      textObject: [textContainer],
    };

    // Reset previous texts when creating new containers
    resetPreviousTexts();
    
    console.log('[Boot] 📺 Creazione contenitore display...');
    const result = await bridge.createStartUpPageContainer(container);
    console.log('[Boot] 📊 CreateStartUpPageContainer result:', result);
    
    // On real hardware, sometimes we need to wait a bit for containers to be ready
    const isSuccess = result === StartUpPageCreateResult.success || result === 0 || result === 1 || result === 'success';
    
    if (isSuccess) {
      console.log('[Display] ✅ Contenitore display creato con successo');
      // Set current screen type
      currentScreenType = 'preset';
    } else {
      console.error('[Display] ❌ Errore creazione contenitore:', result);
    }
    
    return isSuccess;
  } catch (error) {
    console.error('Error creating page containers:', error);
    return false;
  }
}
