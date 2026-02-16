import { PRESETS, TimerState } from './constants';
import {
  StartUpPageCreateResult,
  CreateStartUpPageContainer,
  TextContainerProperty,
  TextContainerUpgrade,
  ImageRawDataUpdate,
  ImageContainerProperty,
} from '@evenrealities/even_hub_sdk';

const DISPLAY_WIDTH = 576;
const DISPLAY_HEIGHT = 288;

const TEXT_CONTAINER_ID = 1;
const MP_CONTAINER_ID = 2; // "M" block (minute tens)
const MSS_CONTAINER_ID = 3; // "M:SS" block (minute ones + colon + seconds)
const PRESET_CONTAINER_ID = 4;

const TEXT_CONTAINER_NAME = 'timer-text';
const MP_CONTAINER_NAME = 'timer-mp';
const MSS_CONTAINER_NAME = 'timer-mss';
const PRESET_CONTAINER_NAME = 'preset-display';

const PRESET_COLOR_BG = '#000000';
const PRESET_COLOR_TEXT = '#00ff88';
const PRESET_COLOR_ACCENT = '#00cc6a';
const PRESET_COLOR_SELECTED_BG = 'rgba(0, 255, 136, 0.15)';

const DIGIT_SCALE = 10;
const DIGIT_BASE_WIDTH = 5;
const DIGIT_BASE_HEIGHT = 7;
const COLON_BASE_WIDTH = 3;

const DIGIT_HEIGHT = DIGIT_BASE_HEIGHT * DIGIT_SCALE;
const MP_WIDTH = DIGIT_BASE_WIDTH * DIGIT_SCALE; // "M"
const MINUTE_COLON_GAP = 0;
const COLON_SECOND_GAP = 1;
const SECOND_DIGIT_GAP = 1;
const MSS_WIDTH =
  (DIGIT_BASE_WIDTH +
    MINUTE_COLON_GAP +
    COLON_BASE_WIDTH +
    COLON_SECOND_GAP +
    DIGIT_BASE_WIDTH +
    SECOND_DIGIT_GAP +
    DIGIT_BASE_WIDTH) *
  DIGIT_SCALE; // "M:SS" (max 200)

const TIMER_GROUP_GAP = 12;
const TOTAL_TIMER_WIDTH = MP_WIDTH + TIMER_GROUP_GAP + MSS_WIDTH;
const TIMER_Y = Math.floor((DISPLAY_HEIGHT - DIGIT_HEIGHT) / 2);
const MP_X = Math.floor((DISPLAY_WIDTH - TOTAL_TIMER_WIDTH) / 2);
const MSS_X = MP_X + MP_WIDTH + TIMER_GROUP_GAP;

type PixelPattern = number[][];

const DIGIT_PATTERNS: Record<string, PixelPattern> = {
  '0': [
    [1, 1, 1, 1, 1],
    [1, 0, 0, 0, 1],
    [1, 0, 0, 0, 1],
    [1, 0, 0, 0, 1],
    [1, 0, 0, 0, 1],
    [1, 0, 0, 0, 1],
    [1, 1, 1, 1, 1],
  ],
  '1': [
    [0, 0, 1, 0, 0],
    [0, 1, 1, 0, 0],
    [0, 0, 1, 0, 0],
    [0, 0, 1, 0, 0],
    [0, 0, 1, 0, 0],
    [0, 0, 1, 0, 0],
    [0, 1, 1, 1, 0],
  ],
  '2': [
    [1, 1, 1, 1, 1],
    [0, 0, 0, 0, 1],
    [0, 0, 0, 0, 1],
    [1, 1, 1, 1, 1],
    [1, 0, 0, 0, 0],
    [1, 0, 0, 0, 0],
    [1, 1, 1, 1, 1],
  ],
  '3': [
    [1, 1, 1, 1, 1],
    [0, 0, 0, 0, 1],
    [0, 0, 0, 0, 1],
    [1, 1, 1, 1, 1],
    [0, 0, 0, 0, 1],
    [0, 0, 0, 0, 1],
    [1, 1, 1, 1, 1],
  ],
  '4': [
    [1, 0, 0, 0, 1],
    [1, 0, 0, 0, 1],
    [1, 0, 0, 0, 1],
    [1, 1, 1, 1, 1],
    [0, 0, 0, 0, 1],
    [0, 0, 0, 0, 1],
    [0, 0, 0, 0, 1],
  ],
  '5': [
    [1, 1, 1, 1, 1],
    [1, 0, 0, 0, 0],
    [1, 0, 0, 0, 0],
    [1, 1, 1, 1, 1],
    [0, 0, 0, 0, 1],
    [0, 0, 0, 0, 1],
    [1, 1, 1, 1, 1],
  ],
  '6': [
    [1, 1, 1, 1, 1],
    [1, 0, 0, 0, 0],
    [1, 0, 0, 0, 0],
    [1, 1, 1, 1, 1],
    [1, 0, 0, 0, 1],
    [1, 0, 0, 0, 1],
    [1, 1, 1, 1, 1],
  ],
  '7': [
    [1, 1, 1, 1, 1],
    [0, 0, 0, 0, 1],
    [0, 0, 0, 0, 1],
    [0, 0, 0, 1, 0],
    [0, 0, 1, 0, 0],
    [0, 1, 0, 0, 0],
    [1, 0, 0, 0, 0],
  ],
  '8': [
    [1, 1, 1, 1, 1],
    [1, 0, 0, 0, 1],
    [1, 0, 0, 0, 1],
    [1, 1, 1, 1, 1],
    [1, 0, 0, 0, 1],
    [1, 0, 0, 0, 1],
    [1, 1, 1, 1, 1],
  ],
  '9': [
    [1, 1, 1, 1, 1],
    [1, 0, 0, 0, 1],
    [1, 0, 0, 0, 1],
    [1, 1, 1, 1, 1],
    [0, 0, 0, 0, 1],
    [0, 0, 0, 0, 1],
    [1, 1, 1, 1, 1],
  ],
};

const COLON_PATTERN: PixelPattern = [
  [0, 0, 0],
  [0, 1, 0],
  [0, 0, 0],
  [0, 0, 0],
  [0, 0, 0],
  [0, 1, 0],
  [0, 0, 0],
];

let currentScreenType: 'preset' | 'timer' | null = null;
let lastDisplayedTime = '';
let lastTextContent = '';
let areTimerImagesVisible = false;

let imageUpdateInProgress = false;
let pendingTimerBridge: any = null;
let pendingTimerSeconds: number | null = null;
let pendingTimerForceAll = false;

const imageCache = new Map<string, number[]>();

let canvas: HTMLCanvasElement | null = null;
let ctx: CanvasRenderingContext2D | null = null;
let cropCanvas: HTMLCanvasElement | null = null;

function getContext(): CanvasRenderingContext2D | null {
  if (!canvas) {
    canvas = document.createElement('canvas');
    ctx = canvas.getContext('2d');
  }
  return ctx;
}

function getCropCanvas(width: number, height: number): HTMLCanvasElement {
  if (!cropCanvas || cropCanvas.width !== width || cropCanvas.height !== height) {
    cropCanvas = document.createElement('canvas');
    cropCanvas.width = width;
    cropCanvas.height = height;
  }
  return cropCanvas;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function getTextMetrics(text: string) {
  const contentLength = new TextEncoder().encode(text).length;
  return { contentLength, contentOffset: 0 };
}

export function formatTime(seconds: number): string {
  const safeSeconds = Math.max(0, seconds);
  const mins = Math.floor(safeSeconds / 60);
  const secs = safeSeconds % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function formatPresetRow(selectedPreset: number): string {
  return PRESETS.map((preset) => (preset === selectedPreset ? `[${preset}]` : `${preset}`)).join(' ');
}

export function getStatusText(state: TimerState): string {
  return state;
}

export function createStatusIcon(_state: TimerState): Uint8Array | null {
  return null;
}

export function resetPreviousTexts(): void {
  lastDisplayedTime = '';
  lastTextContent = '';
  areTimerImagesVisible = false;
  pendingTimerBridge = null;
  pendingTimerSeconds = null;
  pendingTimerForceAll = false;
}

function buildPresetContent(selectedPreset: number): string {
  const minutes = String(Math.min(99, Math.max(0, selectedPreset))).padStart(2, '0');
  const rowA = [1, 3, 5, 10]
    .map((preset) => (preset === selectedPreset ? `[${preset}]` : `${preset}`))
    .join('  ');
  const rowB = [15, 30, 60]
    .map((preset) => (preset === selectedPreset ? `[${preset}]` : `${preset}`))
    .join('  ');

  // Keep this screen compact to avoid text-container scrolling on G2.
  return [
    'G2 Timer',
    '',
    `Minutes: ${minutes}`,
    '',
    rowA,
    rowB,
    '',
    'Swipe: change',
    'Tap: start',
  ].join('\n');
}

function drawPresetScreen(drawCtx: CanvasRenderingContext2D, selectedPreset: number): void {
  const w = DISPLAY_WIDTH;
  const h = DISPLAY_HEIGHT;
  const padding = 24;
  const titleFont = 'bold 22px monospace';
  const labelFont = '14px monospace';
  const presetFont = 'bold 18px monospace';
  const hintFont = '12px monospace';

  drawCtx.fillStyle = PRESET_COLOR_BG;
  drawCtx.fillRect(0, 0, w, h);

  drawCtx.fillStyle = PRESET_COLOR_TEXT;
  drawCtx.font = titleFont;
  drawCtx.textAlign = 'center';
  drawCtx.fillText('G2 Timer', w / 2, 42);

  const minutesStr = String(Math.min(99, Math.max(0, selectedPreset))).padStart(2, '0');
  drawCtx.font = labelFont;
  drawCtx.fillStyle = PRESET_COLOR_ACCENT;
  drawCtx.fillText(`Minutes: ${minutesStr}`, w / 2, 72);

  const row1 = [1, 3, 5, 10];
  const row2 = [15, 30, 60];
  const cellW = 72;
  const cellH = 36;
  const gap = 12;
  const startY = 100;

  const drawRow = (presets: number[], rowIndex: number) => {
    const totalWidth = presets.length * cellW + (presets.length - 1) * gap;
    let x = (w - totalWidth) / 2 + cellW / 2 + gap / 2;
    const y = startY + rowIndex * (cellH + gap) + cellH / 2 + 8;
    drawCtx.font = presetFont;
    drawCtx.textAlign = 'center';
    drawCtx.textBaseline = 'middle';
    for (const p of presets) {
      const isSelected = p === selectedPreset;
      const cellX = x - cellW / 2 - gap / 2;
      const cellY = y - cellH / 2 - 8;
      if (isSelected) {
        const bw = cellW + gap;
        const bh = cellH;
        drawCtx.fillStyle = PRESET_COLOR_SELECTED_BG;
        const r = 8;
        if (typeof drawCtx.roundRect === 'function') {
          drawCtx.beginPath();
          drawCtx.roundRect(cellX, cellY, bw, bh, r);
          drawCtx.fill();
          drawCtx.strokeStyle = PRESET_COLOR_ACCENT;
          drawCtx.lineWidth = 2;
          drawCtx.stroke();
        } else {
          drawCtx.fillRect(cellX, cellY, bw, bh);
          drawCtx.strokeStyle = PRESET_COLOR_ACCENT;
          drawCtx.lineWidth = 2;
          drawCtx.strokeRect(cellX, cellY, bw, bh);
        }
      }
      drawCtx.fillStyle = isSelected ? PRESET_COLOR_TEXT : PRESET_COLOR_ACCENT;
      drawCtx.fillText(String(p), x, y);
      x += cellW + gap;
    }
  };
  drawRow(row1, 0);
  drawRow(row2, 1);

  drawCtx.textBaseline = 'alphabetic';
  drawCtx.font = hintFont;
  drawCtx.fillStyle = PRESET_COLOR_ACCENT;
  drawCtx.textAlign = 'center';
  drawCtx.globalAlpha = 0.85;
  drawCtx.fillText('Swipe: change duration', w / 2, h - 44);
  drawCtx.fillText('Tap: start timer', w / 2, h - 24);
  drawCtx.globalAlpha = 1;
}

function renderPresetToCanvas(selectedPreset: number): void {
  const drawCtx = getContext();
  if (!drawCtx || !canvas) return;
  canvas.width = DISPLAY_WIDTH;
  canvas.height = DISPLAY_HEIGHT;
  drawCtx.fillStyle = PRESET_COLOR_BG;
  drawCtx.fillRect(0, 0, DISPLAY_WIDTH, DISPLAY_HEIGHT);
  drawPresetScreen(drawCtx, selectedPreset);
}

async function getPresetImageBytes(selectedPreset: number): Promise<number[]> {
  const cacheKey = `preset:${selectedPreset}`;
  if (imageCache.has(cacheKey)) {
    return imageCache.get(cacheKey)!;
  }
  const bytes = await renderPng(DISPLAY_WIDTH, DISPLAY_HEIGHT, (drawCtx) =>
    drawPresetScreen(drawCtx, selectedPreset)
  );
  if (bytes.length > 0) {
    imageCache.set(cacheKey, bytes);
  }
  return bytes;
}

/** Crop of the preset image for the digit area so it blends in (no black rectangle). */
async function getPresetDigitAreaBytes(
  selectedPreset: number,
  x: number,
  y: number,
  w: number,
  h: number
): Promise<number[]> {
  const cacheKey = `preset-crop:${selectedPreset}:${x}:${y}:${w}:${h}`;
  if (imageCache.has(cacheKey)) {
    return imageCache.get(cacheKey)!;
  }
  renderPresetToCanvas(selectedPreset);
  const drawCtx = getContext();
  if (!drawCtx || !canvas) return [];
  const imageData = drawCtx.getImageData(x, y, w, h);
  const crop = getCropCanvas(w, h);
  const cropCtx = crop.getContext('2d');
  if (!cropCtx) return [];
  cropCtx.putImageData(imageData, 0, 0);
  try {
    const blob: Blob = await new Promise((resolve, reject) => {
      crop.toBlob((result) => {
        if (!result) {
          reject(new Error('toBlob failed'));
          return;
        }
        resolve(result);
      }, 'image/png');
    });
    const buffer = await blob.arrayBuffer();
    const bytes = Array.from(new Uint8Array(buffer));
    if (bytes.length > 0) {
      imageCache.set(cacheKey, bytes);
    }
    return bytes;
  } catch (error) {
    console.error('[UI] Preset crop PNG failed:', error);
    return [];
  }
}

async function getBlankPresetPngBytes(): Promise<number[]> {
  return getBlankPngBytes('blank-preset', DISPLAY_WIDTH, DISPLAY_HEIGHT);
}

async function clearPresetImage(bridge: any): Promise<void> {
  const blank = await getBlankPresetPngBytes();
  await pushImage(bridge, PRESET_CONTAINER_ID, PRESET_CONTAINER_NAME, blank);
}

function buildTimerOverlayText(state: TimerState, isBlinkingVisible: boolean): string {
  if (state === TimerState.PAUSED) {
    return 'PAUSED';
  }
  if (state === TimerState.DONE) {
    return isBlinkingVisible ? 'DONE' : ' ';
  }
  return ' ';
}

function drawPattern(
  drawCtx: CanvasRenderingContext2D,
  pattern: PixelPattern,
  x: number,
  y: number,
  pixelSize: number,
): void {
  for (let py = 0; py < pattern.length; py++) {
    for (let px = 0; px < pattern[py].length; px++) {
      if (pattern[py][px] === 1) {
        drawCtx.fillRect(x + px * pixelSize, y + py * pixelSize, pixelSize, pixelSize);
      }
    }
  }
}

async function renderPng(
  width: number,
  height: number,
  drawFn: (drawCtx: CanvasRenderingContext2D) => void,
): Promise<number[]> {
  const drawCtx = getContext();
  if (!drawCtx || !canvas) {
    return [];
  }

  canvas.width = width;
  canvas.height = height;

  drawCtx.fillStyle = '#000';
  drawCtx.fillRect(0, 0, width, height);
  drawCtx.fillStyle = '#FFF';
  drawFn(drawCtx);

  try {
    const blob: Blob = await new Promise((resolve, reject) => {
      canvas!.toBlob((result) => {
        if (!result) {
          reject(new Error('toBlob failed'));
          return;
        }
        resolve(result);
      }, 'image/png');
    });
    const buffer = await blob.arrayBuffer();
    return Array.from(new Uint8Array(buffer));
  } catch (error) {
    console.error('[UI] PNG generation failed:', error);
    return [];
  }
}

async function getMinutePrefixPngBytes(minuteTens: string): Promise<number[]> {
  const cacheKey = `mp:${minuteTens}`;
  if (imageCache.has(cacheKey)) {
    return imageCache.get(cacheKey)!;
  }

  const tens = DIGIT_PATTERNS[minuteTens];
  if (!tens) {
    return [];
  }

  const bytes = await renderPng(MP_WIDTH, DIGIT_HEIGHT, (drawCtx) => {
    drawPattern(drawCtx, tens, 0, 0, DIGIT_SCALE);
  });

  if (bytes.length > 0) {
    imageCache.set(cacheKey, bytes);
  }
  return bytes;
}

async function getMinuteSuffixPngBytes(minuteOnes: string, seconds: string): Promise<number[]> {
  const cacheKey = `mss:${minuteOnes}${seconds}`;
  if (imageCache.has(cacheKey)) {
    return imageCache.get(cacheKey)!;
  }

  const minuteOnesPattern = DIGIT_PATTERNS[minuteOnes];
  const tens = DIGIT_PATTERNS[seconds[0]];
  const ones = DIGIT_PATTERNS[seconds[1]];
  if (!minuteOnesPattern || !tens || !ones) {
    return [];
  }

  const colonX = (DIGIT_BASE_WIDTH + MINUTE_COLON_GAP) * DIGIT_SCALE;
  const tensX = (DIGIT_BASE_WIDTH + MINUTE_COLON_GAP + COLON_BASE_WIDTH + COLON_SECOND_GAP) * DIGIT_SCALE;
  const onesX =
    (DIGIT_BASE_WIDTH +
      MINUTE_COLON_GAP +
      COLON_BASE_WIDTH +
      COLON_SECOND_GAP +
      DIGIT_BASE_WIDTH +
      SECOND_DIGIT_GAP) *
    DIGIT_SCALE;

  const bytes = await renderPng(MSS_WIDTH, DIGIT_HEIGHT, (drawCtx) => {
    drawPattern(drawCtx, minuteOnesPattern, 0, 0, DIGIT_SCALE);
    drawPattern(drawCtx, COLON_PATTERN, colonX, 0, DIGIT_SCALE);
    drawPattern(drawCtx, tens, tensX, 0, DIGIT_SCALE);
    drawPattern(drawCtx, ones, onesX, 0, DIGIT_SCALE);
  });

  if (bytes.length > 0) {
    imageCache.set(cacheKey, bytes);
  }
  return bytes;
}

async function getBlankPngBytes(cacheKey: string, width: number, height: number): Promise<number[]> {
  if (imageCache.has(cacheKey)) {
    return imageCache.get(cacheKey)!;
  }

  const bytes = await renderPng(width, height, () => undefined);
  if (bytes.length > 0) {
    imageCache.set(cacheKey, bytes);
  }
  return bytes;
}

/** Returns a fully transparent PNG so the preset container doesn't cover the timer. */
async function getTransparentPngBytes(width: number, height: number): Promise<number[]> {
  const cacheKey = `transparent:${width}x${height}`;
  if (imageCache.has(cacheKey)) {
    return imageCache.get(cacheKey)!;
  }
  const drawCtx = getContext();
  if (!drawCtx || !canvas) {
    return [];
  }
  canvas.width = width;
  canvas.height = height;
  drawCtx.clearRect(0, 0, width, height);
  try {
    const blob: Blob = await new Promise((resolve, reject) => {
      canvas!.toBlob((result) => {
        if (!result) {
          reject(new Error('toBlob failed'));
          return;
        }
        resolve(result);
      }, 'image/png');
    });
    const buffer = await blob.arrayBuffer();
    const bytes = Array.from(new Uint8Array(buffer));
    if (bytes.length > 0) {
      imageCache.set(cacheKey, bytes);
    }
    return bytes;
  } catch (error) {
    console.error('[UI] Transparent PNG failed:', error);
    return [];
  }
}

async function pushImage(bridge: any, containerID: number, containerName: string, imageData: number[]): Promise<void> {
  if (imageData.length === 0) {
    return;
  }

  await bridge.updateImageRawData(
    new ImageRawDataUpdate({
      containerID,
      containerName,
      imageData,
    }),
  );
}

function pushText(bridge: any, content: string, force = false): void {
  if (!force && content === lastTextContent) {
    return;
  }

  const metrics = getTextMetrics(content);
  bridge.textContainerUpgrade(
    new TextContainerUpgrade({
      containerID: TEXT_CONTAINER_ID,
      containerName: TEXT_CONTAINER_NAME,
      content,
      contentLength: metrics.contentLength,
      contentOffset: metrics.contentOffset,
    }),
  );
  lastTextContent = content;
}

function queueLatestTimerUpdate(bridge: any, remainingSeconds: number, forceAll: boolean): void {
  pendingTimerBridge = bridge;
  pendingTimerSeconds = remainingSeconds;
  pendingTimerForceAll = pendingTimerForceAll || forceAll;
}

function consumeQueuedTimerUpdate(): { bridge: any; remainingSeconds: number; forceAll: boolean } | null {
  if (!pendingTimerBridge || pendingTimerSeconds === null) {
    return null;
  }

  const queued = {
    bridge: pendingTimerBridge,
    remainingSeconds: pendingTimerSeconds,
    forceAll: pendingTimerForceAll,
  };

  pendingTimerBridge = null;
  pendingTimerSeconds = null;
  pendingTimerForceAll = false;
  return queued;
}

async function applyTimerImages(bridge: any, remainingSeconds: number, forceAll: boolean): Promise<void> {
  const time = formatTime(remainingSeconds);
  if (!forceAll && time === lastDisplayedTime && areTimerImagesVisible) {
    return;
  }

  const minuteTens = time[0];
  const minuteOnes = time[1];
  const seconds = time.slice(3, 5);
  const previousMinuteTens = lastDisplayedTime[0];
  const previousMinuteOnes = lastDisplayedTime[1];
  const previousSeconds = lastDisplayedTime.slice(3, 5);

  const shouldUpdatePrefix = forceAll || !areTimerImagesVisible || minuteTens !== previousMinuteTens;
  const shouldUpdateSuffix =
    forceAll ||
    !areTimerImagesVisible ||
    minuteOnes !== previousMinuteOnes ||
    seconds !== previousSeconds;

  if (shouldUpdatePrefix && shouldUpdateSuffix && minuteTens !== previousMinuteTens) {
    // At 10-minute boundaries, update prefix first to avoid huge transient jumps.
    const mpBytes = await getMinutePrefixPngBytes(minuteTens);
    await pushImage(bridge, MP_CONTAINER_ID, MP_CONTAINER_NAME, mpBytes);

    const mssBytes = await getMinuteSuffixPngBytes(minuteOnes, seconds);
    await pushImage(bridge, MSS_CONTAINER_ID, MSS_CONTAINER_NAME, mssBytes);
  } else {
    // Normal path: suffix first keeps minute rollover visually coherent.
    if (shouldUpdateSuffix) {
      const mssBytes = await getMinuteSuffixPngBytes(minuteOnes, seconds);
      await pushImage(bridge, MSS_CONTAINER_ID, MSS_CONTAINER_NAME, mssBytes);
    }

    if (shouldUpdatePrefix) {
      const mpBytes = await getMinutePrefixPngBytes(minuteTens);
      await pushImage(bridge, MP_CONTAINER_ID, MP_CONTAINER_NAME, mpBytes);
    }
  }

  lastDisplayedTime = time;
  areTimerImagesVisible = true;
}

const TIMER_IMAGE_UPDATE_TIMEOUT_MS = 2000;

async function updateTimerImages(bridge: any, remainingSeconds: number, forceAll = false): Promise<void> {
  if (imageUpdateInProgress) {
    queueLatestTimerUpdate(bridge, remainingSeconds, forceAll);
    return;
  }

  imageUpdateInProgress = true;

  try {
    await Promise.race([
      (async () => {
        await applyTimerImages(bridge, remainingSeconds, forceAll);
        let queued = consumeQueuedTimerUpdate();
        while (queued) {
          await applyTimerImages(queued.bridge, queued.remainingSeconds, queued.forceAll);
          queued = consumeQueuedTimerUpdate();
        }
      })(),
      new Promise<void>((_, reject) =>
        setTimeout(() => reject(new Error('timer image update timeout')), TIMER_IMAGE_UPDATE_TIMEOUT_MS)
      ),
    ]);
  } catch (error) {
    console.error('[UI] Timer images update failed or timed out:', error);
  } finally {
    imageUpdateInProgress = false;
  }
}

async function waitForImageChannel(timeoutMs = 1800): Promise<void> {
  const start = Date.now();
  while (imageUpdateInProgress && Date.now() - start < timeoutMs) {
    await delay(8);
  }
}

async function clearTimerImages(bridge: any, force = false): Promise<void> {
  if (!force && !areTimerImagesVisible) {
    return;
  }

  pendingTimerBridge = null;
  pendingTimerSeconds = null;
  pendingTimerForceAll = false;

  await waitForImageChannel();
  if (imageUpdateInProgress) {
    return;
  }

  imageUpdateInProgress = true;

  try {
    const blankMP = await getBlankPngBytes('blank-mp', MP_WIDTH, DIGIT_HEIGHT);
    const blankMSS = await getBlankPngBytes('blank-mss', MSS_WIDTH, DIGIT_HEIGHT);

    await pushImage(bridge, MP_CONTAINER_ID, MP_CONTAINER_NAME, blankMP);
    await pushImage(bridge, MSS_CONTAINER_ID, MSS_CONTAINER_NAME, blankMSS);

    lastDisplayedTime = '';
    areTimerImagesVisible = false;
  } catch (error) {
    console.error('[UI] Failed to clear timer images:', error);
  } finally {
    imageUpdateInProgress = false;
  }
}

export async function renderUI(
  bridge: any,
  state: TimerState,
  selectedPreset: number,
  remainingSeconds: number,
  isBlinkingVisible = true,
  debugMessage?: string,
): Promise<void> {
  if (!bridge) {
    return;
  }

  try {
    if (debugMessage) {
      pushText(bridge, debugMessage, true);
      return;
    }

    if (state === TimerState.IDLE) {
      if (currentScreenType !== 'preset') {
        await clearTimerImages(bridge, true);
        await clearPresetImage(bridge);
      }
      const presetBytes = await getPresetImageBytes(selectedPreset);
      await pushImage(bridge, PRESET_CONTAINER_ID, PRESET_CONTAINER_NAME, presetBytes);
      // Use preset crop in digit areas so they blend in (no black rectangle)
      const mpPresetBytes = await getPresetDigitAreaBytes(selectedPreset, MP_X, TIMER_Y, MP_WIDTH, DIGIT_HEIGHT);
      const mssPresetBytes = await getPresetDigitAreaBytes(selectedPreset, MSS_X, TIMER_Y, MSS_WIDTH, DIGIT_HEIGHT);
      if (mpPresetBytes.length > 0) await pushImage(bridge, MP_CONTAINER_ID, MP_CONTAINER_NAME, mpPresetBytes);
      if (mssPresetBytes.length > 0) await pushImage(bridge, MSS_CONTAINER_ID, MSS_CONTAINER_NAME, mssPresetBytes);
      lastDisplayedTime = '';
      areTimerImagesVisible = false;
      pushText(bridge, ' ', true);
      lastTextContent = ' ';
      currentScreenType = 'preset';
      return;
    }

    if (currentScreenType === 'preset') {
      await clearPresetImage(bridge);
    }
    pushText(bridge, buildTimerOverlayText(state, isBlinkingVisible));

    if (currentScreenType !== 'timer') {
      currentScreenType = 'timer';
      lastDisplayedTime = '';
      await updateTimerImages(bridge, remainingSeconds, true);
      return;
    }

    await updateTimerImages(bridge, remainingSeconds);
  } catch (error) {
    console.error('[UI] renderUI error:', error);
  }
}

export async function createPageContainers(bridge: any, selectedPreset = 5): Promise<boolean> {
  if (!bridge) {
    return false;
  }

  try {
    const presetContent = buildPresetContent(selectedPreset);

    const textContainer = new TextContainerProperty({
      containerID: TEXT_CONTAINER_ID,
      containerName: TEXT_CONTAINER_NAME,
      xPosition: 0,
      yPosition: 0,
      width: DISPLAY_WIDTH,
      height: DISPLAY_HEIGHT,
      borderWidth: 0,
      borderColor: 0,
      paddingLength: 20,
      content: presetContent,
      isEventCapture: 1,
    });

    const mpContainer = new ImageContainerProperty({
      containerID: MP_CONTAINER_ID,
      containerName: MP_CONTAINER_NAME,
      xPosition: MP_X,
      yPosition: TIMER_Y,
      width: MP_WIDTH,
      height: DIGIT_HEIGHT,
    });

    const mssContainer = new ImageContainerProperty({
      containerID: MSS_CONTAINER_ID,
      containerName: MSS_CONTAINER_NAME,
      xPosition: MSS_X,
      yPosition: TIMER_Y,
      width: MSS_WIDTH,
      height: DIGIT_HEIGHT,
    });

    const presetContainer = new ImageContainerProperty({
      containerID: PRESET_CONTAINER_ID,
      containerName: PRESET_CONTAINER_NAME,
      xPosition: 0,
      yPosition: 0,
      width: DISPLAY_WIDTH,
      height: DISPLAY_HEIGHT,
    });

    // Preset container first so it is drawn behind the digit containers (MP, MSS).
    // When timer runs we clear it with black; digits stay on top and remain visible.
    const result = await bridge.createStartUpPageContainer(
      new CreateStartUpPageContainer({
        containerTotalNum: 4,
        textObject: [textContainer],
        imageObject: [presetContainer, mpContainer, mssContainer],
      }),
    );

    if (StartUpPageCreateResult.normalize(result) !== StartUpPageCreateResult.success) {
      console.error('[UI] createStartUpPageContainer failed:', result);
      return false;
    }

    currentScreenType = 'preset';
    lastTextContent = presetContent;
    lastDisplayedTime = '';
    areTimerImagesVisible = false;
    pendingTimerBridge = null;
    pendingTimerSeconds = null;
    pendingTimerForceAll = false;

    await clearTimerImages(bridge, true);

    return true;
  } catch (error) {
    console.error('[UI] createPageContainers error:', error);
    return false;
  }
}
