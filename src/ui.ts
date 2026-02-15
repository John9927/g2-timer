import {
  PRESETS,
  TimerState,
} from './constants';
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
export function getTextMetrics(text: string): { contentLength: number; contentOffset: number } {
  return {
    contentLength: text.length,
    contentOffset: 0,
  };
}

// Create a simple monochrome image data for status icon
export function createStatusIcon(_state: TimerState): Uint8Array | null {
  return null;
}

// Reset function (kept for compatibility)
export function resetPreviousTexts(): void {
  // No-op
}

// Track current screen type
let currentScreenType: 'preset' | 'timer' | null = null;

// Guard against concurrent image updates
let imageUpdateInProgress = false;

// ── Preset content builder (shared by multiple functions) ──────────────
function buildPresetContent(selectedPreset: number): string {
  const col1 = [1, 3, 5, 10];
  const col2 = [15, 30, 60];

  const fmt = (p: number, sel: boolean) => (sel ? `> ${p} <` : `  ${p}  `);

  const lines: string[] = [];
  const maxRows = Math.max(col1.length, col2.length);
  for (let i = 0; i < maxRows; i++) {
    const left  = i < col1.length ? fmt(col1[i], col1[i] === selectedPreset) : '        ';
    const right = i < col2.length ? fmt(col2[i], col2[i] === selectedPreset) : '        ';
    lines.push(`${left}    ${right}`);
  }

  return `Scegli minuti\n\n${lines.join('\n')}\n\nSwipe: cambia  Tap: avvia`;
}

// ── Canvas → base64 PNG rendering for the timer image ──────────────────
// The G2 display has a fixed font for text containers. The ONLY way to get
// genuinely large digits is to render them as a bitmap and push it via an
// image container (max 200 × 100 px per the SDK docs).
function renderTimerToBase64(seconds: number, status?: string): string {
  const W = 200;
  const H = 100;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;

  // Black background – on the G2, black = transparent (no light)
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, W, H);

  // White digits – on the G2, white = green LED light
  ctx.fillStyle = '#FFFFFF';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const time = formatTime(seconds); // "MM:SS"

  if (status) {
    // Timer + small status below
    ctx.font = 'bold 60px monospace';
    ctx.fillText(time, W / 2, 38);
    ctx.font = 'bold 18px monospace';
    ctx.fillText(status, W / 2, 80);
  } else {
    // Timer only – as large as possible
    ctx.font = 'bold 72px monospace';
    ctx.fillText(time, W / 2, H / 2 + 2);
  }

  // Return just the base64 payload (strip the "data:image/png;base64," prefix)
  return canvas.toDataURL('image/png').split(',')[1];
}

// ── Preset selection screen (text-only) ────────────────────────────────

// Called when we need to SWITCH to the preset screen (from timer or first time).
// Always uses rebuildPageContainer because the timer screen has a different
// container layout (text + image).
async function renderPresetSelection(
  bridge: any,
  selectedPreset: number,
): Promise<void> {
  if (!bridge) return;

  try {
    const content = buildPresetContent(selectedPreset);

    const textContainer: any = {
      xPosition: 0,
      yPosition: 0,
      width: 576,
      height: 288,
      borderWidth: 0,
      borderColor: 0,
      paddingLength: 20,
      containerID: 1,
      containerName: 'timer-main',
      content,
      isEventCapture: 1,
    };

    console.log('[UI] Rebuilding to preset screen');
    await bridge.rebuildPageContainer({
      containerTotalNum: 1,
      textObject: [textContainer],
    });
    currentScreenType = 'preset';
  } catch (error) {
    console.error('Error rendering preset selection:', error);
  }
}

// Quick update when already on the preset screen (just swap the text content).
function updatePresetContent(bridge: any, selectedPreset: number): void {
  if (!bridge) return;

  try {
    const content = buildPresetContent(selectedPreset);
    const metrics = getTextMetrics(content);

    bridge.textContainerUpgrade({
      containerID: 1,
      containerName: 'timer-main',
      content,
      contentLength: metrics.contentLength,
      contentOffset: metrics.contentOffset,
    });
  } catch (error) {
    console.error('Error updating preset content:', error);
  }
}

// ── Timer screen (text + image container) ──────────────────────────────

// Called when we need to SWITCH to the timer screen (from preset).
// Uses rebuildPageContainer to create a layout with:
//   • a thin text container (for status text + event capture)
//   • a centered image container (200×100) for the large timer digits
async function renderTimerScreen(
  bridge: any,
  state: TimerState,
  remainingSeconds: number,
  isBlinkingVisible: boolean = true,
): Promise<void> {
  if (!bridge) return;

  try {
    // Status text (shown in the text container below the image)
    let statusText = '';
    let statusForImage = '';
    if (state === TimerState.PAUSED) {
      statusText = '\n       PAUSED';
      statusForImage = 'PAUSED';
    } else if (state === TimerState.DONE && isBlinkingVisible) {
      statusText = '\n     COMPLETATO';
      statusForImage = 'COMPLETATO';
    }

    // Text container – thin strip at the bottom for status + event capture
    const textContainer: any = {
      xPosition: 0,
      yPosition: 180,
      width: 576,
      height: 108,
      borderWidth: 0,
      borderColor: 0,
      paddingLength: 0,
      containerID: 1,
      containerName: 'timer-main',
      content: statusText || '\n',
      isEventCapture: 1,
    };

    // Image container – centered, max allowed size 200×100
    const imageContainer: any = {
      xPosition: 188,   // (576 − 200) / 2 = 188
      yPosition: 40,    // push towards top so it visually "fills" the screen
      width: 200,
      height: 100,
      containerID: 2,
      containerName: 'timer-img',
    };

    console.log('[UI] Rebuilding to timer screen (image mode)');
    await bridge.rebuildPageContainer({
      containerTotalNum: 2,
      textObject: [textContainer],
      imageObject: [imageContainer],
    });
    currentScreenType = 'timer';

    // Now push the actual image data (must come AFTER container creation)
    const base64 = renderTimerToBase64(remainingSeconds, statusForImage || undefined);
    await bridge.updateImageRawData({
      containerID: 2,
      containerName: 'timer-img',
      imageData: base64,
    });
    console.log('[UI] Timer image sent');
  } catch (error) {
    console.error('Error rendering timer screen:', error);
  }
}

// Called every second while the timer is already showing – just updates the
// image data (no layout rebuild needed).
async function updateTimerScreen(
  bridge: any,
  state: TimerState,
  remainingSeconds: number,
  isBlinkingVisible: boolean = true,
): Promise<void> {
  if (!bridge || imageUpdateInProgress) return;

  imageUpdateInProgress = true;
  try {
    // Determine status
    let statusText = '';
    let statusForImage = '';
    if (state === TimerState.PAUSED) {
      statusText = '\n       PAUSED';
      statusForImage = 'PAUSED';
    } else if (state === TimerState.DONE && isBlinkingVisible) {
      statusText = '\n     COMPLETATO';
      statusForImage = 'COMPLETATO';
    }

    // Update the text strip (status)
    const statusContent = statusText || '\n';
    const metrics = getTextMetrics(statusContent);
    bridge.textContainerUpgrade({
      containerID: 1,
      containerName: 'timer-main',
      content: statusContent,
      contentLength: metrics.contentLength,
      contentOffset: metrics.contentOffset,
    });

    // Update the timer image
    const base64 = renderTimerToBase64(remainingSeconds, statusForImage || undefined);
    await bridge.updateImageRawData({
      containerID: 2,
      containerName: 'timer-img',
      imageData: base64,
    });
  } catch (error) {
    console.error('Error updating timer screen:', error);
  } finally {
    imageUpdateInProgress = false;
  }
}

// ── Public renderUI dispatcher ─────────────────────────────────────────

export async function renderUI(
  bridge: any,
  state: TimerState,
  selectedPreset: number,
  remainingSeconds: number,
  isBlinkingVisible: boolean = true,
  debugMessage?: string,
): Promise<void> {
  if (!bridge) return;

  try {
    // Show a raw debug message if requested
    if (debugMessage) {
      const metrics = getTextMetrics(debugMessage);
      bridge.textContainerUpgrade({
        containerID: 1,
        containerName: 'timer-main',
        content: debugMessage,
        contentLength: metrics.contentLength,
        contentOffset: metrics.contentOffset,
      });
      return;
    }

    // ── IDLE → preset selection screen ──
    if (state === TimerState.IDLE) {
      if (currentScreenType !== 'preset') {
        // Rebuild: switching from timer (image layout) to preset (text-only)
        await renderPresetSelection(bridge, selectedPreset);
      } else {
        // Just update text content in the existing preset container
        updatePresetContent(bridge, selectedPreset);
      }
      return;
    }

    // ── RUNNING / PAUSED / DONE → timer screen with image ──
    if (currentScreenType !== 'timer') {
      // Rebuild: switching from preset to timer (text + image layout)
      await renderTimerScreen(bridge, state, remainingSeconds, isBlinkingVisible);
    } else {
      // Already on timer screen – update image + status only
      await updateTimerScreen(bridge, state, remainingSeconds, isBlinkingVisible);
    }
  } catch (error) {
    console.error('Error rendering UI:', error);
  }
}

// ── Initial container creation ─────────────────────────────────────────

export async function createPageContainers(bridge: any, selectedPreset: number = 5): Promise<boolean> {
  if (!bridge) return false;

  try {
    // Start with a text-only preset selection screen.
    // Image containers CANNOT carry data at startup (SDK limitation), so we
    // only create the text container here and switch to the image layout later
    // via rebuildPageContainer when the timer starts.
    const content = buildPresetContent(selectedPreset);

    const textContainer: any = {
      xPosition: 0,
      yPosition: 0,
      width: 576,
      height: 288,
      borderWidth: 0,
      borderColor: 0,
      paddingLength: 20,
      containerID: 1,
      containerName: 'timer-main',
      content,
      isEventCapture: 1,
    };

    const container: any = {
      containerTotalNum: 1,
      textObject: [textContainer],
    };

    resetPreviousTexts();

    console.log('[Boot] 📺 Creazione contenitore display...');
    const result = await bridge.createStartUpPageContainer(container);
    console.log('[Boot] 📊 CreateStartUpPageContainer result:', result);

    const isSuccess =
      result === StartUpPageCreateResult.success ||
      result === 0 ||
      result === 1 ||
      result === 'success';

    if (isSuccess) {
      console.log('[Display] ✅ Contenitore display creato con successo');
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
