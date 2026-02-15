import {
  PRESETS,
  TimerState,
} from './constants';
import {
  StartUpPageCreateResult,
  CreateStartUpPageContainer,
  TextContainerProperty,
  TextContainerUpgrade,
  ImageRawDataUpdate,
} from '@evenrealities/even_hub_sdk';

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
  // Use UTF-8 byte length for hardware compatibility
  const contentLength = new TextEncoder().encode(text).length;
  return { contentLength, contentOffset: 0 };
}

export function createStatusIcon(_s: TimerState): Uint8Array | null { return null; }

export function resetPreviousTexts(): void {}

/* ─── module state ────────────────────────────────────────────────────── */

let currentScreenType: 'preset' | 'timer' | null = null;
let imageUpdateInProgress = false;

// Track last displayed digits to update only what changed
let lastDisplayedDigits: string = ''; // "MM:SS" format

// Cache for pre-generated digit PNGs (number[])
// Key: '0'-'9' or ':', Value: number[] (PNG bytes)
const digitCache: Map<string, number[]> = new Map();

// Canvas for pre-generating digit images (one-time use)
let _canvas: HTMLCanvasElement | null = null;
let _ctx: CanvasRenderingContext2D | null = null;

function getCtx(): CanvasRenderingContext2D | null {
  if (!_canvas) {
    _canvas = document.createElement('canvas');
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

/* ─── Digit container dimensions ──────────────────────────────────────── */

// Each digit container: 60×84 pixels (scale=12, so 5×7 base becomes 60×84)
const DIGIT_WIDTH = 60;
const DIGIT_HEIGHT = 84;
const DIGIT_SCALE = 12;
const COLON_WIDTH = DIGIT_WIDTH; // Same width as digits (pattern is 5 columns)
const COLON_HEIGHT = DIGIT_HEIGHT;
const CONTAINER_SPACING = 10;

/**
 * Pre-generate PNG bytes for a single digit/character and cache it.
 * Returns cached bytes if available, otherwise generates and caches.
 */
async function getDigitPngBytes(char: string): Promise<number[]> {
  // Check cache first
  if (digitCache.has(char)) {
    return digitCache.get(char)!;
  }

  const ctx = getCtx();
  if (!ctx || !_canvas) {
    console.error('[Digit] Context not available');
    return [];
  }

  // Set canvas size for this digit
  if (char === ':') {
    _canvas.width = COLON_WIDTH;
    _canvas.height = COLON_HEIGHT;
  } else {
    _canvas.width = DIGIT_WIDTH;
    _canvas.height = DIGIT_HEIGHT;
  }

  // Black background (transparent on G2)
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, _canvas.width, _canvas.height);

  // White pixels (visible on G2)
  ctx.fillStyle = '#FFF';

  // Draw the digit
  const pixelSize = DIGIT_SCALE;
  drawPixelDigit(ctx, char, 0, 0, pixelSize);

  // Convert to PNG bytes
  try {
    const blob: Blob = await new Promise((resolve, reject) => {
      _canvas!.toBlob(b => b ? resolve(b) : reject(new Error('toBlob failed')), 'image/png');
    });
    const buf = await blob.arrayBuffer();
    const bytes = Array.from(new Uint8Array(buf));
    digitCache.set(char, bytes);
    console.log(`[Digit] Cached PNG for "${char}", bytes:`, bytes.length);
    return bytes;
  } catch (error) {
    console.error('[Digit] Failed to generate PNG for', char, error);
    return [];
  }
}

/**
 * Pre-generate and cache all digits (0-9) and colon.
 * Call this AFTER creating containers to avoid blocking on hardware.
 */
async function pregenerateDigitCache(): Promise<void> {
  console.log('[Digit] Pre-generating digit cache (lazy, on-demand)...');
  // Generate only the most common digits first (0-5, colon)
  // Others will be generated on-demand
  const priorityChars = ['0', '1', '2', '3', '4', '5', ':'];
  for (const char of priorityChars) {
    try {
      await getDigitPngBytes(char);
    } catch (err) {
      console.warn(`[Digit] Failed to pre-generate ${char}, will generate on-demand:`, err);
    }
  }
  console.log('[Digit] Priority cache ready, size:', digitCache.size);
}

/* ─── low-level SDK wrappers (zero console.log in hot path) ──────────── */

function pushText(bridge: any, content: string) {
  const m = getTextMetrics(content);
  console.log('[UI] pushText:', content.substring(0, 50), 'length:', m.contentLength);
  try {
    bridge.textContainerUpgrade(
      new TextContainerUpgrade({
        containerID: 1,
        containerName: 'timer-main',
        content,
        contentLength: m.contentLength,
        contentOffset: m.contentOffset,
      })
    );
  } catch (err: any) {
    console.error('[UI] pushText failed:', err);
  }
}

/**
 * Update individual digit containers. Only updates containers that changed.
 * Container IDs:
 *  2 = M (minutes tens)
 *  3 = M (minutes ones)
 *  4 = : (colon, fixed, only set once)
 *  5 = S (seconds tens)
 *  6 = S (seconds ones)
 */
/**
 * Update individual digit containers. Only updates containers that changed.
 * Updates are SEQUENTIAL (one at a time) for hardware compatibility.
 */
async function updateDigitContainers(bridge: any, seconds: number): Promise<void> {
  if (imageUpdateInProgress) {
    return; // Skip if another update is in progress
  }

  const time = formatTime(seconds); // "MM:SS"
  const [mTens, mOnes, , sTens, sOnes] = time.split(''); // colon is at index 2, we don't need it

  // Compare with last displayed
  if (time === lastDisplayedDigits) {
    return; // Nothing changed
  }

  imageUpdateInProgress = true;

  try {
    // Update only changed digits - SEQUENTIALLY (one at a time)
    // Hardware BLE often fails with parallel updates

    // Colon is set once (containerID 4)
    if (lastDisplayedDigits === '') {
      const bytes = await getDigitPngBytes(':');
      if (bytes.length > 0) {
        try {
          const result = await bridge.updateImageRawData(
            new ImageRawDataUpdate({
              containerID: 4,
              containerName: 'timer-colon',
              imageData: bytes,
            })
          );
          console.log('[UI] Colon set, result:', result);
        } catch (err: any) {
          console.error('[UI] Colon update failed:', err);
        }
      }
    }

    if (lastDisplayedDigits[0] !== mTens) {
      const bytes = await getDigitPngBytes(mTens);
      if (bytes.length > 0) {
        try {
          const result = await bridge.updateImageRawData(
            new ImageRawDataUpdate({
              containerID: 2,
              containerName: 'timer-m-tens',
              imageData: bytes,
            })
          );
          console.log('[UI] M tens updated, result:', result);
        } catch (err: any) {
          console.error('[UI] M tens update failed:', err);
        }
      }
    }

    if (lastDisplayedDigits[1] !== mOnes) {
      const bytes = await getDigitPngBytes(mOnes);
      if (bytes.length > 0) {
        try {
          const result = await bridge.updateImageRawData(
            new ImageRawDataUpdate({
              containerID: 3,
              containerName: 'timer-m-ones',
              imageData: bytes,
            })
          );
          console.log('[UI] M ones updated, result:', result);
        } catch (err: any) {
          console.error('[UI] M ones update failed:', err);
        }
      }
    }

    if (lastDisplayedDigits[3] !== sTens) {
      const bytes = await getDigitPngBytes(sTens);
      if (bytes.length > 0) {
        try {
          const result = await bridge.updateImageRawData(
            new ImageRawDataUpdate({
              containerID: 5,
              containerName: 'timer-s-tens',
              imageData: bytes,
            })
          );
          console.log('[UI] S tens updated, result:', result);
        } catch (err: any) {
          console.error('[UI] S tens update failed:', err);
        }
      }
    }

    if (lastDisplayedDigits[4] !== sOnes) {
      const bytes = await getDigitPngBytes(sOnes);
      if (bytes.length > 0) {
        try {
          const result = await bridge.updateImageRawData(
            new ImageRawDataUpdate({
              containerID: 6,
              containerName: 'timer-s-ones',
              imageData: bytes,
            })
          );
          console.log('[UI] S ones updated, result:', result);
        } catch (err: any) {
          console.error('[UI] S ones update failed:', err);
        }
      }
    }

    lastDisplayedDigits = time;
  } catch (err: any) {
    console.error('[UI] Digit container update failed:', err);
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
    if (debugMessage) {
      const debugBytes = new TextEncoder().encode(debugMessage).length;
      bridge.textContainerUpgrade(
        new TextContainerUpgrade({
          containerID: 1,
          containerName: 'timer-main',
          content: debugMessage,
          contentLength: debugBytes,
          contentOffset: 0,
        })
      );
      return;
    }

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

    // Already on timer screen – just update text status and digits
    let txt = ' ';
    if (state === TimerState.PAUSED) {
      txt = '\n\n\n\n\n\n\n\n       PAUSED';
    } else if (state === TimerState.DONE && isBlinkingVisible) {
      txt = '\n\n\n\n\n\n\n\n     COMPLETATO';
    }

    pushText(bridge, txt);
    await updateDigitContainers(bridge, remainingSeconds);
  } catch (e) {
    console.error('renderUI error:', e);
  }
}

/* ─── initial container creation ──────────────────────────────────────── */

/**
 * Creates 5 separate digit containers + 1 text container for status.
 * Container layout:
 *  1 = Text container (status, full screen for preset)
 *  2 = M tens (minutes tens)
 *  3 = M ones (minutes ones)
 *  4 = Colon (fixed, set once)
 *  5 = S tens (seconds tens)
 *  6 = S ones (seconds ones)
 */
export async function createPageContainers(
  bridge: any,
  selectedPreset = 5,
): Promise<boolean> {
  if (!bridge) return false;

  try {
    const content = buildPresetContent(selectedPreset);

    // STEP 1: Create ONLY text container first (simplest test)
    console.log('[Boot] STEP 1: Creating ONLY text container…');
    const textContainer = new TextContainerProperty({
      containerID: 1,
      containerName: 'timer-main',
      xPosition: 0,
      yPosition: 0,
      width: 576,
      height: 288,
      paddingLength: 20,
      borderWidth: 0,
      borderColor: 0,
      content: 'TEST TEXT\n\nSe vedi questo, il text container funziona!',
      isEventCapture: 1,
    });

    const result = await bridge.createStartUpPageContainer(
      new CreateStartUpPageContainer({
        containerTotalNum: 1,
        textObject: [textContainer],
      })
    );
    console.log('[Boot] createStartUpPageContainer result:', result, 'type:', typeof result);

    // Check result
    const isSuccess = result === StartUpPageCreateResult.success;
    if (!isSuccess) {
      console.error('[Boot] Container creation failed. Result:', result, 'Expected:', StartUpPageCreateResult.success);
      return false;
    }

    console.log('[Boot] Text container created OK');
    currentScreenType = 'preset';

    // Wait for hardware to settle
    await new Promise(resolve => setTimeout(resolve, 800));

    // Test: Update text to verify it works
    const testText = 'HELLO G2 - Se vedi questo funziona!';
    const testBytes = new TextEncoder().encode(testText).length;
    console.log('[Boot] Test: Updating text container…');
    try {
      const updateResult = await bridge.textContainerUpgrade(
        new TextContainerUpgrade({
          containerID: 1,
          containerName: 'timer-main',
          content: testText,
          contentLength: testBytes,
          contentOffset: 0,
        })
      );
      console.log('[Boot] Text update result:', updateResult);
    } catch (err: any) {
      console.error('[Boot] Text update failed:', err);
    }

    // Restore preset content
    await new Promise(resolve => setTimeout(resolve, 2000));
    const contentBytes = new TextEncoder().encode(content).length;
    await bridge.textContainerUpgrade(
      new TextContainerUpgrade({
        containerID: 1,
        containerName: 'timer-main',
        content,
        contentLength: contentBytes,
        contentOffset: 0,
      })
    );

    return true;
  } catch (e) {
    console.error('createPageContainers error:', e);
    return false;
  }
}

/**
 * Switch to timer screen: update text container and initialize all digits.
 * Since all containers already exist (created at startup), we just update them.
 */
async function switchToTimerScreen(
  bridge: any,
  state: TimerState,
  remainingSeconds: number,
  _status?: string,
): Promise<void> {
  if (!bridge) return;

  try {
    // Reset tracking to force full update
    lastDisplayedDigits = '';

    // Update text container to show timer (temporarily using text only)
    const time = formatTime(remainingSeconds);
    let statusText = time;
    if (state === TimerState.PAUSED) {
      statusText = `${time}\n\nPAUSED`;
    } else if (state === TimerState.DONE) {
      statusText = `${time}\n\nCOMPLETATO`;
    }

    pushText(bridge, statusText);
    currentScreenType = 'timer';

    // TODO: Re-enable digit containers after text container works
    // await new Promise(resolve => setTimeout(resolve, 300));
    // await updateDigitContainers(bridge, remainingSeconds);
  } catch (e) {
    console.error('[UI] Error switching to timer screen:', e);
    imageUpdateInProgress = false; // Reset on error
  }
}
