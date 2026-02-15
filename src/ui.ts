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

    await bridge.rebuildPageContainer(container);
  } catch (error) {
    console.error('Error rendering preset selection:', error);
  }
}

// Render timer screen (RUNNING/PAUSED/DONE state)
async function renderTimerScreen(
  bridge: any,
  state: TimerState,
  remainingSeconds: number,
  isBlinkingVisible: boolean = true
): Promise<void> {
  if (!bridge) return;

  try {
    const timeText = formatTime(remainingSeconds);
    
    // Large timer display - center the time
    // Add extra spacing to make it really big and centered
    const paddingTop = '\n\n\n\n\n\n';
    const paddingBottom = '\n\n\n\n\n\n';
    
    let content = `${paddingTop}${timeText}${paddingBottom}`;
    
    // Add status if paused (but not if blinking/done)
    if (state === TimerState.PAUSED) {
      content = `${paddingTop}${timeText}\n\nPAUSED${paddingBottom}`;
    } else if (state === TimerState.DONE && isBlinkingVisible) {
      content = `${paddingTop}${timeText}\n\nCOMPLETATO${paddingBottom}`;
    }

    const textContainer: any = {
      xPosition: 0,
      yPosition: 0,
      width: 576,
      height: 288,
      borderWidth: 0,
      borderColor: 0,
      paddingLength: 20,
      containerID: 1,
      containerName: "timer-display",
      content: content,
      isEventCapture: 1,
    };

    const container: any = {
      containerTotalNum: 1,
      textObject: [textContainer],
    };

    await bridge.rebuildPageContainer(container);
  } catch (error) {
    console.error('Error rendering timer screen:', error);
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
      const textContainer: any = {
        xPosition: 0,
        yPosition: 0,
        width: 576,
        height: 288,
        borderWidth: 0,
        borderColor: 0,
        paddingLength: 20,
        containerID: 1,
        containerName: "debug",
        content: debugMessage,
        isEventCapture: 1,
      };
      const container: any = {
        containerTotalNum: 1,
        textObject: [textContainer],
      };
      await bridge.rebuildPageContainer(container);
      return;
    }

    // Show preset selection when IDLE
    if (state === TimerState.IDLE) {
      await renderPresetSelection(bridge, selectedPreset);
    } else {
      // Show timer screen when RUNNING, PAUSED, or DONE
      await renderTimerScreen(bridge, state, remainingSeconds, isBlinkingVisible);
    }
  } catch (error) {
    console.error('Error rendering UI:', error);
  }
}

// Create initial page containers - shows preset selection screen
export async function createPageContainers(bridge: any, selectedPreset: number = 5): Promise<boolean> {
  if (!bridge) return false;

  try {
    // Create preset selection screen as initial view
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
    
    console.log('Creating containers with:', {
      totalNum: container.containerTotalNum,
      container: {
        id: textContainer.containerID,
        name: textContainer.containerName,
        content: textContainer.content.substring(0, 50) + '...',
        pos: `(${textContainer.xPosition}, ${textContainer.yPosition})`,
        size: `${textContainer.width}x${textContainer.height}`
      }
    });
    
    console.log('[Boot] 📺 Creazione contenitore display...');
    const result = await bridge.createStartUpPageContainer(container);
    console.log('[Boot] 📊 CreateStartUpPageContainer result:', result);
    console.log('[Boot] 📊 StartUpPageCreateResult.success:', StartUpPageCreateResult.success);
    console.log('[Boot] 📊 Result type:', typeof result);
    console.log('[Boot] 📊 Result === 0:', result === 0);
    console.log('[Boot] 📊 Result === 1:', result === 1);
    console.log('[Boot] 📊 Result === StartUpPageCreateResult.success:', result === StartUpPageCreateResult.success);
    
    // On real hardware, sometimes we need to wait a bit for containers to be ready
    // The result might be successful but containers need time to initialize
    const isSuccess = result === StartUpPageCreateResult.success || result === 0 || result === 1 || result === 'success';
    
    if (isSuccess) {
      console.log('[Display] ✅ Contenitore display creato con successo');
    } else {
      console.error('[Display] ❌ Errore creazione contenitore:', result);
      console.log('[Display] 🔄 Tentativo di aggiornare contenitore esistente...');
      // Even if creation "fails", try to update anyway (like working project does)
    }
    
    return isSuccess;
  } catch (error) {
    console.error('Error creating page containers:', error);
    return false;
  }
}
