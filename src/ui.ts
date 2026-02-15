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

// Render preset selection screen (IDLE state) - 2 columns layout
function renderPresetSelection(
  bridge: any,
  selectedPreset: number
): void {
  if (!bridge) return;

  try {
    // Organize presets in 2 columns for better space usage
    // Column 1: 1, 3, 5, 10
    // Column 2: 15, 30, 60
    const col1 = [1, 3, 5, 10];
    const col2 = [15, 30, 60];
    
    // Format each column with larger spacing
    const formatPreset = (preset: number, isSelected: boolean) => {
      if (isSelected) {
        return `> ${preset} <`;
      }
      return `  ${preset}  `;
    };
    
    // Build two columns side by side with spacing
    const lines: string[] = [];
    const maxRows = Math.max(col1.length, col2.length);
    
    for (let i = 0; i < maxRows; i++) {
      const left = i < col1.length ? formatPreset(col1[i], col1[i] === selectedPreset) : '        ';
      const right = i < col2.length ? formatPreset(col2[i], col2[i] === selectedPreset) : '        ';
      lines.push(`${left}    ${right}`);
    }
    
    const presetGrid = lines.join('\n');
    
    // Compact header and footer
    const content = `Scegli minuti\n\n${presetGrid}\n\nSwipe: cambia  Tap: avvia`;
    const metrics = getTextMetrics(content);

    console.log('[UI] Updating preset selection (2 columns)');
    
    bridge.textContainerUpgrade({
      containerID: 1,
      containerName: "timer-main",
      content: content,
      contentLength: metrics.contentLength,
      contentOffset: metrics.contentOffset,
    });
    currentScreenType = 'preset';
  } catch (error) {
    console.error('Error rendering preset selection:', error);
  }
}

// Use full-width characters to make the timer visually larger but still readable.
const FULLWIDTH_MAP: Record<string, string> = {
  '0': '０',
  '1': '１',
  '2': '２',
  '3': '３',
  '4': '４',
  '5': '５',
  '6': '６',
  '7': '７',
  '8': '８',
  '9': '９',
  ':': '：',
};

function buildLargeTimerLine(seconds: number): string {
  const time = formatTime(seconds); // MM:SS
  return time
    .split('')
    .map((ch) => FULLWIDTH_MAP[ch] || ch)
    .join('');
}

// Render timer screen (RUNNING/PAUSED/DONE state) - FULL SCREEN LARGE
// Use rebuildPageContainer only when switching from preset to timer
async function renderTimerScreen(
  bridge: any,
  state: TimerState,
  remainingSeconds: number,
  isBlinkingVisible: boolean = true
): Promise<void> {
  if (!bridge) return;

  try {
    const largeTime = buildLargeTimerLine(remainingSeconds);
    // Keep a compact line count to avoid vertical scrollbar.
    let content = `\n\n\n        ${largeTime}\n\n`;

    if (state === TimerState.PAUSED) {
      content = `\n\n\n        ${largeTime}\n\n        PAUSED`;
    } else if (state === TimerState.DONE && isBlinkingVisible) {
      content = `\n\n\n        ${largeTime}\n\n      COMPLETATO`;
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
      containerName: "timer-main",
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
    const largeTime = buildLargeTimerLine(remainingSeconds);
    let content = `\n\n\n        ${largeTime}\n\n`;

    if (state === TimerState.PAUSED) {
      content = `\n\n\n        ${largeTime}\n\n        PAUSED`;
    } else if (state === TimerState.DONE && isBlinkingVisible) {
      content = `\n\n\n        ${largeTime}\n\n      COMPLETATO`;
    }

    const metrics = getTextMetrics(content);
    
    bridge.textContainerUpgrade({
      containerID: 1,
      containerName: "timer-main",
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
        containerName: "timer-main",
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
        // Just update content if already showing preset (2 columns)
        const col1 = [1, 3, 5, 10];
        const col2 = [15, 30, 60];
        const formatPreset = (preset: number, isSelected: boolean) => {
          if (isSelected) {
            return `> ${preset} <`;
          }
          return `  ${preset}  `;
        };
        const lines: string[] = [];
        const maxRows = Math.max(col1.length, col2.length);
        for (let i = 0; i < maxRows; i++) {
          const left = i < col1.length ? formatPreset(col1[i], col1[i] === selectedPreset) : '        ';
          const right = i < col2.length ? formatPreset(col2[i], col2[i] === selectedPreset) : '        ';
          lines.push(`${left}    ${right}`);
        }
        const presetGrid = lines.join('\n');
        const content = `Scegli minuti\n\n${presetGrid}\n\nSwipe: cambia  Tap: avvia`;
        const metrics = getTextMetrics(content);
        bridge.textContainerUpgrade({
          containerID: 1,
          containerName: "timer-main",
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
    // Use 2 columns layout to avoid scrollbar
    const col1 = [1, 3, 5, 10];
    const col2 = [15, 30, 60];
    const formatPreset = (preset: number, isSelected: boolean) => {
      if (isSelected) {
        return `> ${preset} <`;
      }
      return `  ${preset}  `;
    };
    const lines: string[] = [];
    const maxRows = Math.max(col1.length, col2.length);
    for (let i = 0; i < maxRows; i++) {
      const left = i < col1.length ? formatPreset(col1[i], col1[i] === selectedPreset) : '        ';
      const right = i < col2.length ? formatPreset(col2[i], col2[i] === selectedPreset) : '        ';
      lines.push(`${left}    ${right}`);
    }
    const presetGrid = lines.join('\n');
    const content = `Scegli minuti\n\n${presetGrid}\n\nSwipe: cambia  Tap: avvia`;

    const textContainer: any = {
      xPosition: 0,
      yPosition: 0,
      width: 576,
      height: 288,
      borderWidth: 0,
      borderColor: 0,
      paddingLength: 20,
      containerID: 1,
      containerName: "timer-main",
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
    console.log('[Boot] Content:', content.substring(0, 100));
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
