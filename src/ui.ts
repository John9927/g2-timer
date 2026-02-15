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

// Render all UI elements
// SIMPLIFIED: Update single container like working project
export function renderUI(
  bridge: any,
  state: TimerState,
  selectedPreset: number,
  remainingSeconds: number,
  isBlinkingVisible: boolean = true,
  debugMessage?: string
): void {
  if (!bridge) return;

  try {
    // Build content for single container
    const timeText = formatTime(remainingSeconds);
    const presetText = formatPresetRow(selectedPreset);
    const statusText = getStatusText(state);
    const displayStatusText = isBlinkingVisible ? statusText : '';
    
    let content = `TIMER\n\n${timeText}\n\n${presetText}\n\n${displayStatusText}`;
    
    // If debug message, show it instead
    if (debugMessage) {
      content = debugMessage;
    }
    
    const metrics = getTextMetrics(content);
    
    // Update single container (ID: 1, like working project)
    bridge.textContainerUpgrade({
      containerID: 1,
      containerName: "timer-main",
      content: content,
      contentLength: metrics.contentLength,
      contentOffset: metrics.contentOffset,
    });
  } catch (error) {
    console.error('Error rendering UI:', error);
  }
}

// Create initial page containers
export async function createPageContainers(bridge: any): Promise<boolean> {
  if (!bridge) return false;

  try {
    // SIMPLIFIED: Create a SINGLE large container like the working project
    // This is a test to see if at least ONE container appears on glasses
    const textContainer: any = {
      xPosition: 20,
      yPosition: 20,
      width: 536, // 576 - 40 (margins)
      height: 248, // 288 - 40 (margins)
      borderWidth: 1,
      borderColor: 15, // white border to make it visible
      paddingLength: 10,
      containerID: 1,
      containerName: "timer-main",
      content: "TIMER\n\n05:00\n\n1 3 5 10 15 30 60\n\nIDLE",
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
        content: textContainer.content,
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
