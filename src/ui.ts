import {
  PRESETS,
  TimerState,
} from './constants';
import { StartUpPageCreateResult } from '@evenrealities/even_hub_sdk';

/* ─── helpers ─────────────────────────────────────────────────────────── */

export function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function formatPresetRow(selectedPreset: number): string {
  return PRESETS.map(p => (p === selectedPreset ? `[${p}]` : `${p}`)).join(' ');
}

export function getStatusText(state: TimerState): string { return state; }

export function getTextMetrics(text: string) {
  return { contentLength: text.length, contentOffset: 0 };
}

export function createStatusIcon(_s: TimerState): Uint8Array | null { return null; }

export function resetPreviousTexts(): void {}

/* ─── module state ────────────────────────────────────────────────────── */

let currentScreenType: 'preset' | 'timer' | null = null;
let imageUpdateInProgress = false;

// Reusable canvas – avoids DOM / GC churn on every tick
let _canvas: HTMLCanvasElement | null = null;
let _ctx: CanvasRenderingContext2D | null = null;

function getCtx(): CanvasRenderingContext2D | null {
  if (!_canvas) {
    _canvas = document.createElement('canvas');
    _canvas.width = 200;
    _canvas.height = 100;
    _ctx = _canvas.getContext('2d');
    console.log('[Canvas] Canvas initialized:', { width: _canvas.width, height: _canvas.height, ctx: !!_ctx });
  }
  return _ctx;
}

/* ─── preset content builder ──────────────────────────────────────────── */

function buildPresetContent(selectedPreset: number): string {
  const col1 = [1, 3, 5, 10];
  const col2 = [15, 30, 60];
  const fmt = (p: number, sel: boolean) => (sel ? `> ${p} <` : `  ${p}  `);
  const lines: string[] = [];
  for (let i = 0; i < Math.max(col1.length, col2.length); i++) {
    const l = i < col1.length ? fmt(col1[i], col1[i] === selectedPreset) : '        ';
    const r = i < col2.length ? fmt(col2[i], col2[i] === selectedPreset) : '        ';
    lines.push(`${l}    ${r}`);
  }
  return `Scegli minuti\n\n${lines.join('\n')}\n\nSwipe: cambia  Tap: avvia`;
}

/* ─── pixel-based digit definitions (5x7 grid, scalable) ────────────── */

// Each digit is a 5x7 grid (5 wide, 7 tall)
// 1 = pixel ON (white), 0 = pixel OFF (black/transparent)
const DIGIT_PATTERNS: { [key: string]: number[][] } = {
  '0': [
    [1,1,1,1,1],
    [1,0,0,0,1],
    [1,0,0,0,1],
    [1,0,0,0,1],
    [1,0,0,0,1],
    [1,0,0,0,1],
    [1,1,1,1,1],
  ],
  '1': [
    [0,0,1,0,0],
    [0,1,1,0,0],
    [0,0,1,0,0],
    [0,0,1,0,0],
    [0,0,1,0,0],
    [0,0,1,0,0],
    [0,1,1,1,0],
  ],
  '2': [
    [1,1,1,1,1],
    [0,0,0,0,1],
    [0,0,0,0,1],
    [1,1,1,1,1],
    [1,0,0,0,0],
    [1,0,0,0,0],
    [1,1,1,1,1],
  ],
  '3': [
    [1,1,1,1,1],
    [0,0,0,0,1],
    [0,0,0,0,1],
    [1,1,1,1,1],
    [0,0,0,0,1],
    [0,0,0,0,1],
    [1,1,1,1,1],
  ],
  '4': [
    [1,0,0,0,1],
    [1,0,0,0,1],
    [1,0,0,0,1],
    [1,1,1,1,1],
    [0,0,0,0,1],
    [0,0,0,0,1],
    [0,0,0,0,1],
  ],
  '5': [
    [1,1,1,1,1],
    [1,0,0,0,0],
    [1,0,0,0,0],
    [1,1,1,1,1],
    [0,0,0,0,1],
    [0,0,0,0,1],
    [1,1,1,1,1],
  ],
  '6': [
    [1,1,1,1,1],
    [1,0,0,0,0],
    [1,0,0,0,0],
    [1,1,1,1,1],
    [1,0,0,0,1],
    [1,0,0,0,1],
    [1,1,1,1,1],
  ],
  '7': [
    [1,1,1,1,1],
    [0,0,0,0,1],
    [0,0,0,0,1],
    [0,0,0,1,0],
    [0,0,1,0,0],
    [0,1,0,0,0],
    [1,0,0,0,0],
  ],
  '8': [
    [1,1,1,1,1],
    [1,0,0,0,1],
    [1,0,0,0,1],
    [1,1,1,1,1],
    [1,0,0,0,1],
    [1,0,0,0,1],
    [1,1,1,1,1],
  ],
  '9': [
    [1,1,1,1,1],
    [1,0,0,0,1],
    [1,0,0,0,1],
    [1,1,1,1,1],
    [0,0,0,0,1],
    [0,0,0,0,1],
    [1,1,1,1,1],
  ],
  ':': [
    [0,0,0,0,0],
    [0,0,1,0,0],
    [0,0,0,0,0],
    [0,0,0,0,0],
    [0,0,0,0,0],
    [0,0,1,0,0],
    [0,0,0,0,0],
  ],
};

/**
 * Draw a pixel-based digit/character on the canvas.
 * @param ctx Canvas context
 * @param char Character to draw ('0'-'9' or ':')
 * @param x X position (left edge)
 * @param y Y position (top edge)
 * @param pixelSize Size of each scaled pixel
 */
function drawPixelDigit(
  ctx: CanvasRenderingContext2D,
  char: string,
  x: number,
  y: number,
  pixelSize: number,
): void {
  const pattern = DIGIT_PATTERNS[char];
  if (!pattern) {
    console.warn('[Canvas] No pattern for char:', char);
    return;
  }

  const baseWidth = pattern[0].length; // 5
  const baseHeight = pattern.length;   // 7

  // Draw each pixel in the pattern
  let pixelsDrawn = 0;
  for (let py = 0; py < baseHeight; py++) {
    for (let px = 0; px < baseWidth; px++) {
      if (pattern[py][px] === 1) {
        // Draw a scaled pixel
        ctx.fillRect(
          x + px * pixelSize,
          y + py * pixelSize,
          pixelSize,
          pixelSize
        );
        pixelsDrawn++;
      }
    }
  }
  if (pixelsDrawn === 0) {
    console.warn('[Canvas] No pixels drawn for char:', char);
  }
}

/**
 * Render timer as PNG bytes (number[]) using toBlob() for hardware compatibility.
 * Returns empty array on error.
 */
async function renderTimerPngBytes(seconds: number, status?: string): Promise<number[]> {
  const ctx = getCtx();
  if (!ctx || !_canvas) {
    console.error('[Canvas] Context or canvas not available');
    return [];
  }
  const W = _canvas.width, H = _canvas.height;
  console.log('[Canvas] Rendering timer image:', { seconds, status, W, H });

  // Black background (transparent on G2)
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);

  // White pixels (visible on G2)
  ctx.fillStyle = '#FFF';

  const time = formatTime(seconds); // "MM:SS"
  console.log('[Canvas] Time string:', time);
  
  // Calculate scale: we want digits to be as large as possible
  // Each digit is 5x7 base, we'll scale it up
  // With scale=6, each digit becomes 30x42 pixels
  const scale = 6;
  const pixelSize = scale;
  const digitWidth = 5 * pixelSize;   // 30
  const digitHeight = 7 * pixelSize;  // 42
  const colonWidth = 2 * pixelSize;   // 12 (colon is narrower)
  const spacing = 2 * pixelSize;      // 12 (space between digits)

  // Calculate total width: MM:SS = 2 digits + colon + 2 digits = 4 digits + 1 colon
  const totalWidth = 4 * digitWidth + colonWidth + 3 * spacing; // ~174 pixels
  const startX = Math.floor((W - totalWidth) / 2);
  const startY = Math.floor((H - digitHeight) / 2);

  console.log('[Canvas] Layout:', { 
    totalWidth, 
    startX, 
    startY, 
    digitWidth, 
    digitHeight,
    canvasW: W,
    canvasH: H,
    fits: totalWidth <= W && digitHeight <= H
  });

  // Draw each character
  let currentX = startX;
  for (const ch of time) {
    if (ch === ':') {
      drawPixelDigit(ctx, ':', currentX, startY, pixelSize);
      currentX += colonWidth + spacing;
    } else {
      drawPixelDigit(ctx, ch, currentX, startY, pixelSize);
      currentX += digitWidth + spacing;
    }
  }

  // Draw status text below if needed
  if (status) {
    ctx.font = 'bold 14px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(status, W / 2, startY + digitHeight + 10);
  }

  // Convert to PNG blob, then to arrayBuffer, then to number[]
  try {
    const blob: Blob = await new Promise((resolve, reject) => {
      _canvas!.toBlob(b => b ? resolve(b) : reject(new Error('toBlob failed')), 'image/png');
    });
    const buf = await blob.arrayBuffer();
    const bytes = Array.from(new Uint8Array(buf)); // number[] for best compatibility
    console.log('[Canvas] PNG bytes generated, length:', bytes.length);
    return bytes;
  } catch (error) {
    console.error('[Canvas] Failed to convert canvas to PNG bytes:', error);
    return [];
  }
}

/* ─── low-level SDK wrappers (zero console.log in hot path) ──────────── */

function pushText(bridge: any, content: string) {
  const m = getTextMetrics(content);
  bridge.textContainerUpgrade({
    containerID: 1,
    containerName: 'timer-main',
    content,
    contentLength: m.contentLength,
    contentOffset: m.contentOffset,
  });
}

/**
 * Push timer image as PNG bytes (number[]) to hardware.
 * Respects the SDK rule "one image at a time" via the imageUpdateInProgress guard.
 * Always logs the result for debugging hardware issues.
 */
async function pushImage(bridge: any, seconds: number, status?: string): Promise<void> {
  if (imageUpdateInProgress) {
    console.log('[UI] Image update skipped (already in progress)');
    return;
  }
  imageUpdateInProgress = true;
  
  try {
    const pngBytes = await renderTimerPngBytes(seconds, status);
    if (pngBytes.length === 0) {
      console.error('[UI] Failed to generate PNG bytes');
      return;
    }

    console.log('[UI] Pushing timer image update, bytes:', pngBytes.length);
    const result = await bridge.updateImageRawData({
      containerID: 2,
      containerName: 'timer-img',
      imageData: pngBytes, // number[] for best hardware compatibility
    });
    console.log('[UI] ImageRawDataUpdateResult:', result);
  } catch (err: any) {
    console.error('[UI] Image update failed:', err);
  } finally {
    imageUpdateInProgress = false;
  }
}


/* ─── public renderUI dispatcher ──────────────────────────────────────── */

export async function renderUI(
  bridge: any,
  state: TimerState,
  selectedPreset: number,
  remainingSeconds: number,
  isBlinkingVisible = true,
  debugMessage?: string,
): Promise<void> {
  if (!bridge) return;

  try {
    if (debugMessage) { pushText(bridge, debugMessage); return; }

    /* ── IDLE → show preset selection ── */
    if (state === TimerState.IDLE) {
      // Update text container to show preset selection
      // Image container stays empty/black (transparent) - no need to clear it
      pushText(bridge, buildPresetContent(selectedPreset));
      currentScreenType = 'preset';
      return;
    }

    /* ── RUNNING / PAUSED / DONE → show timer ── */
    // If not on timer screen yet, rebuild ONCE to add image container
    if (currentScreenType !== 'timer') {
      let status: string | undefined;
      if (state === TimerState.PAUSED) status = 'PAUSED';
      else if (state === TimerState.DONE && isBlinkingVisible) status = 'COMPLETATO';
      await switchToTimerScreen(bridge, state, remainingSeconds, status);
      return;
    }

    // Already on timer screen – just update text status and image
    let imgStatus: string | undefined;
    let txt = ' ';

    if (state === TimerState.PAUSED) {
      imgStatus = 'PAUSED';
      txt = '\n\n\n\n\n\n\n\n       PAUSED';
    } else if (state === TimerState.DONE && isBlinkingVisible) {
      imgStatus = 'COMPLETATO';
      txt = '\n\n\n\n\n\n\n\n     COMPLETATO';
    }

    pushText(bridge, txt);
    await pushImage(bridge, remainingSeconds, imgStatus);
  } catch (e) {
    console.error('renderUI error:', e);
  }
}

/* ─── initial container creation ──────────────────────────────────────── */

/**
 * Creates BOTH text and image containers at startup.
 * This avoids rebuildPageContainer which can be fragile on hardware.
 * In preset mode: show text, image container is empty/black (transparent).
 * In timer mode: update text + image.
 */
export async function createPageContainers(
  bridge: any,
  selectedPreset = 5,
): Promise<boolean> {
  if (!bridge) return false;

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

    // Image container – centered, will be empty/black initially (transparent on G2)
    const imageContainer: any = {
      xPosition: 188,   // (576 − 200) / 2
      yPosition: 40,
      width: 200,
      height: 100,
      borderWidth: 0,
      borderColor: 0,
      containerID: 2,
      containerName: 'timer-img',
    };

    console.log('[Boot] Creating text + image containers…');
    const result = await bridge.createStartUpPageContainer({
      containerTotalNum: 2,
      textObject: [textContainer],
      imageObject: [imageContainer],
    });
    console.log('[Boot] Result:', result);

    const ok =
      result === StartUpPageCreateResult.success ||
      result === 0 ||
      result === 1 ||
      result === 'success';

    if (ok) {
      console.log('[Boot] Containers created OK');
      currentScreenType = 'preset';
    } else {
      console.error('[Boot] Container creation failed:', result);
    }

    return ok;
  } catch (e) {
    console.error('createPageContainers error:', e);
    return false;
  }
}

/**
 * Switch to timer screen: update text container layout and send initial image.
 * Since both containers already exist (created at startup), we just update them.
 */
async function switchToTimerScreen(
  bridge: any,
  state: TimerState,
  remainingSeconds: number,
  status?: string,
): Promise<void> {
  if (!bridge) return;

  try {
    // Reset the image update flag to ensure we can send the image
    imageUpdateInProgress = false;

    // Update text container to show status at bottom
    let statusText = ' ';
    if (state === TimerState.PAUSED) {
      statusText = '\n\n\n\n\n\n\n\n       PAUSED';
    } else if (state === TimerState.DONE) {
      statusText = '\n\n\n\n\n\n\n\n     COMPLETATO';
    }

    // Update text container (no rebuild needed, just content update)
    pushText(bridge, statusText);
    currentScreenType = 'timer';

    // Wait for hardware to be ready (500-800ms for robust settling)
    await new Promise(resolve => setTimeout(resolve, 600));
    
    // Generate and send the image using PNG bytes
    console.log('[UI] Sending initial timer image...');
    await pushImage(bridge, remainingSeconds, status);
  } catch (e) {
    console.error('[UI] Error switching to timer screen:', e);
    imageUpdateInProgress = false; // Reset on error
  }
}
