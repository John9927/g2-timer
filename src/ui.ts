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

    console.log('[UI] Rendering preset selection screen...');
    const result = await bridge.rebuildPageContainer(container);
    console.log('[UI] rebuildPageContainer result:', result);
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

    console.log('[UI] Rendering timer screen...');
    const result = await bridge.rebuildPageContainer(container);
    console.log('[UI] rebuildPageContainer result:', result);
  } catch (error) {
    console.error('Error rendering timer screen:', error);
  }
}

// Track current screen state to know when to rebuild
let currentScreenState: TimerState | null = null;

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

    // Check if we need to rebuild (state changed from IDLE to RUNNING/PAUSED or vice versa)
    const needsRebuild = currentScreenState === null || 
                        (currentScreenState === TimerState.IDLE && state !== TimerState.IDLE) ||
                        (currentScreenState !== TimerState.IDLE && state === TimerState.IDLE);

    console.log('[UI] renderUI called:', { state, needsRebuild, currentScreenState });

    // Always rebuild when state changes, or use upgrade for updates
    // Show preset selection when IDLE
    if (state === TimerState.IDLE) {
      if (needsRebuild) {
        console.log('[UI] Rebuilding to preset selection screen');
        await renderPresetSelection(bridge, selectedPreset);
        currentScreenState = state;
      } else {
        // Just update content if already showing preset selection
        console.log('[UI] Updating preset selection content');
        const presetLines = PRESETS.map((preset) => {
          if (preset === selectedPreset) {
            return `  > ${preset} min  <`;
          }
          return `    ${preset} min`;
        }).join('\n');
        const content = `Scegli i minuti\n\n${presetLines}\n\nSwipe per cambiare\nTocca per avviare`;
        const metrics = getTextMetrics(content);
        try {
          await bridge.textContainerUpgrade({
            containerID: 1,
            containerName: "preset-selection",
            content: content,
            contentLength: metrics.contentLength,
            contentOffset: metrics.contentOffset,
          });
          console.log('[UI] textContainerUpgrade success');
        } catch (err) {
          console.error('[UI] textContainerUpgrade failed, rebuilding:', err);
          await renderPresetSelection(bridge, selectedPreset);
          currentScreenState = state;
        }
      }
    } else {
      // Show timer screen when RUNNING, PAUSED, or DONE
      if (needsRebuild) {
        console.log('[UI] Rebuilding to timer screen');
        await renderTimerScreen(bridge, state, remainingSeconds, isBlinkingVisible);
        currentScreenState = state;
      } else {
        // Just update time if already showing timer screen
        console.log('[UI] Updating timer content');
        const timeText = formatTime(remainingSeconds);
        const paddingTop = '\n\n\n\n\n\n';
        const paddingBottom = '\n\n\n\n\n\n';
        let content = `${paddingTop}${timeText}${paddingBottom}`;
        
        if (state === TimerState.PAUSED) {
          content = `${paddingTop}${timeText}\n\nPAUSED${paddingBottom}`;
        } else if (state === TimerState.DONE && isBlinkingVisible) {
          content = `${paddingTop}${timeText}\n\nCOMPLETATO${paddingBottom}`;
        }
        
        const metrics = getTextMetrics(content);
        try {
          await bridge.textContainerUpgrade({
            containerID: 1,
            containerName: "timer-display",
            content: content,
            contentLength: metrics.contentLength,
            contentOffset: metrics.contentOffset,
          });
          console.log('[UI] textContainerUpgrade success');
        } catch (err) {
          console.error('[UI] textContainerUpgrade failed, rebuilding:', err);
          await renderTimerScreen(bridge, state, remainingSeconds, isBlinkingVisible);
          currentScreenState = state;
        }
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
    // Create preset selection screen as initial view
    const presetLines = PRESETS.map((preset) => {
      if (preset === selectedPreset) {
        return `  > ${preset} min  <`;
      }
      return `    ${preset} min`;
    }).join('\n');

    const content = `Scegli i minuti\n\n${presetLines}\n\nSwipe per cambiare\nTocca per avviare`;

    console.log('[UI] Creating initial container with content:', content.substring(0, 100) + '...');

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
    console.log('[Boot] Container details:', {
      totalNum: container.containerTotalNum,
      container: {
        id: textContainer.containerID,
        name: textContainer.containerName,
        content: textContainer.content.substring(0, 80) + '...',
        pos: `(${textContainer.xPosition}, ${textContainer.yPosition})`,
        size: `${textContainer.width}x${textContainer.height}`
      }
    });
    
    const result = await bridge.createStartUpPageContainer(container);
    console.log('[Boot] 📊 CreateStartUpPageContainer result:', result);
    console.log('[Boot] 📊 StartUpPageCreateResult.success:', StartUpPageCreateResult.success);
    console.log('[Boot] 📊 Result type:', typeof result);
    
    // On real hardware, sometimes we need to wait a bit for containers to be ready
    // The result might be successful but containers need time to initialize
    const isSuccess = result === StartUpPageCreateResult.success || result === 0 || result === 1 || result === 'success';
    
    if (isSuccess) {
      console.log('[Display] ✅ Contenitore display creato con successo');
      // Reset current screen state since we just created it
      currentScreenState = TimerState.IDLE;
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
