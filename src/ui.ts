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

/* ─── canvas → base64 PNG (pixel-based rendering) ─────────────────── */

function renderTimerImage(seconds: number, status?: string): string {
  const c = getCtx();
  if (!c || !_canvas) {
    console.error('[Canvas] Context or canvas not available');
    return '';
  }
  const W = _canvas.width, H = _canvas.height;
  console.log('[Canvas] Rendering timer image:', { seconds, status, W, H });

  // Black background (transparent on G2)
  c.fillStyle = '#000';
  c.fillRect(0, 0, W, H);

  // White pixels (visible on G2)
  c.fillStyle = '#FFF';

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
  const startX = (W - totalWidth) / 2;
  const startY = (H - digitHeight) / 2;

  console.log('[Canvas] Layout:', { totalWidth, startX, startY, digitWidth, digitHeight });

  // Draw each character
  let currentX = startX;
  for (let i = 0; i < time.length; i++) {
    const char = time[i];
    console.log('[Canvas] Drawing char:', char, 'at x:', currentX);
    if (char === ':') {
      drawPixelDigit(c, ':', currentX, startY, pixelSize);
      currentX += colonWidth + spacing;
    } else {
      drawPixelDigit(c, char, currentX, startY, pixelSize);
      currentX += digitWidth + spacing;
    }
  }

  // Draw status text below if needed (using small pixel font)
  if (status) {
    const statusY = startY + digitHeight + 20;
    c.font = 'bold 14px monospace';
    c.textAlign = 'center';
    c.textBaseline = 'top';
    c.fillText(status, W / 2, statusY);
  }

  const dataURL = _canvas.toDataURL('image/png');
  console.log('[Canvas] Image generated, length:', dataURL.length);
  return dataURL;
}

/* ─── dataURL → Uint8Array (smaller over BLE than base64 string) ──── */

function toBytes(dataURL: string): Uint8Array | string {
  try {
    const b64 = dataURL.split(',')[1] || dataURL;
    const bin = atob(b64);
    const u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    return u8;
  } catch {
    return dataURL;
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
 * Fire-and-forget image push.
 * Respects the SDK rule "one image at a time" via the imageUpdateInProgress guard.
 * If a previous transfer is still in flight the call is silently skipped –
 * the next tick (1 s later) will pick up the latest time.
 */
function pushImage(bridge: any, seconds: number, status?: string) {
  if (imageUpdateInProgress) {
    console.log('[UI] Image update skipped (already in progress)');
    return;
  }
  imageUpdateInProgress = true;

  const url = renderTimerImage(seconds, status);
  if (!url) {
    console.error('[UI] Failed to render timer image');
    imageUpdateInProgress = false;
    return;
  }

  console.log('[UI] Pushing timer image update...');
  bridge.updateImageRawData({
    containerID: 2,
    containerName: 'timer-img',
    imageData: toBytes(url),
  })
    .then(() => {
      console.log('[UI] Image update completed');
      imageUpdateInProgress = false;
    })
    .catch((err: any) => {
      console.error('[UI] Image update failed:', err);
      imageUpdateInProgress = false;
    });
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
      // If we're coming from timer screen, rebuild to preset (text-only)
      if (currentScreenType === 'timer') {
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
        await bridge.rebuildPageContainer({
          containerTotalNum: 1,
          textObject: [textContainer],
        });
        currentScreenType = 'preset';
      } else {
        // Already on preset screen, just update text
        pushText(bridge, buildPresetContent(selectedPreset));
      }
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
    pushImage(bridge, remainingSeconds, imgStatus);
  } catch (e) {
    console.error('renderUI error:', e);
  }
}

/* ─── initial container creation ──────────────────────────────────────── */

/**
 * Creates ONLY the text container at startup (SDK limitation: image containers
 * cannot be created with createStartUpPageContainer).
 * When switching to timer mode, we use rebuildPageContainer ONCE to add the
 * image container, then update only the image data (no more rebuilds).
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

    console.log('[Boot] Creating text container…');
    const result = await bridge.createStartUpPageContainer({
      containerTotalNum: 1,
      textObject: [textContainer],
    });
    console.log('[Boot] Result:', result);

    const ok =
      result === StartUpPageCreateResult.success ||
      result === 0 ||
      result === 1 ||
      result === 'success';

    if (ok) {
      console.log('[Boot] Container created OK');
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
 * Switch to timer screen: rebuild with text + image containers.
 * Called ONCE when transitioning from preset to timer.
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

    // Text container – thin strip at bottom for status + event capture
    let statusText = ' ';
    if (state === TimerState.PAUSED) {
      statusText = '\n\n\n\n\n\n\n\n       PAUSED';
    } else if (state === TimerState.DONE) {
      statusText = '\n\n\n\n\n\n\n\n     COMPLETATO';
    }

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
      content: statusText,
      isEventCapture: 1,
    };

    // Image container – centered for large timer display
    const imageContainer: any = {
      xPosition: 188,
      yPosition: 40,
      width: 200,
      height: 100,
      borderWidth: 0,
      borderColor: 0,
      containerID: 2,
      containerName: 'timer-img',
    };

    console.log('[UI] Rebuilding to timer screen (one-time)');
    const rebuildResult = await bridge.rebuildPageContainer({
      containerTotalNum: 2,
      textObject: [textContainer],
      imageObject: [imageContainer],
    });
    console.log('[UI] Rebuild result:', rebuildResult);
    currentScreenType = 'timer';

    // Longer delay to ensure container is fully ready on hardware
    await new Promise(resolve => setTimeout(resolve, 200));
    
    // Generate and send the image
    const url = renderTimerImage(remainingSeconds, status);
    if (!url) {
      console.error('[UI] Failed to generate timer image');
      return;
    }
    
    console.log('[UI] Sending initial timer image...');
    try {
      await bridge.updateImageRawData({
        containerID: 2,
        containerName: 'timer-img',
        imageData: toBytes(url),
      });
      console.log('[UI] Initial image sent successfully');
    } catch (err: any) {
      console.error('[UI] Error sending initial image:', err);
      imageUpdateInProgress = false; // Reset on error
    }
  } catch (e) {
    console.error('[UI] Error switching to timer screen:', e);
    imageUpdateInProgress = false; // Reset on error
  }
}
