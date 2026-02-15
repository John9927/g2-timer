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
const MM_CONTAINER_ID = 2;
const ST_CONTAINER_ID = 3; // colon + second tens
const SO_CONTAINER_ID = 4; // second ones

const TEXT_CONTAINER_NAME = 'timer-text';
const MM_CONTAINER_NAME = 'timer-mm';
const ST_CONTAINER_NAME = 'timer-st';
const SO_CONTAINER_NAME = 'timer-so';

const DIGIT_SCALE = 13; // large but lighter than previous scale
const DIGIT_BASE_WIDTH = 5;
const DIGIT_BASE_HEIGHT = 7;
const GAP_BASE = 1;
const COLON_BASE_WIDTH = 3;

const DIGIT_WIDTH = DIGIT_BASE_WIDTH * DIGIT_SCALE; // 65
const DIGIT_HEIGHT = DIGIT_BASE_HEIGHT * DIGIT_SCALE; // 91
const MM_WIDTH = (DIGIT_BASE_WIDTH * 2 + GAP_BASE) * DIGIT_SCALE; // 143
const ST_WIDTH = (COLON_BASE_WIDTH + GAP_BASE + DIGIT_BASE_WIDTH) * DIGIT_SCALE; // 117

const TIMER_GROUP_GAP = 12;
const TOTAL_TIMER_WIDTH = MM_WIDTH + TIMER_GROUP_GAP + ST_WIDTH + TIMER_GROUP_GAP + DIGIT_WIDTH;
const TIMER_Y = Math.floor((DISPLAY_HEIGHT - DIGIT_HEIGHT) / 2);
const MM_X = Math.floor((DISPLAY_WIDTH - TOTAL_TIMER_WIDTH) / 2);
const ST_X = MM_X + MM_WIDTH + TIMER_GROUP_GAP;
const SO_X = ST_X + ST_WIDTH + TIMER_GROUP_GAP;

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

let cacheWarmupStarted = false;

const imageCache = new Map<string, number[]>();

let canvas: HTMLCanvasElement | null = null;
let ctx: CanvasRenderingContext2D | null = null;

function getContext(): CanvasRenderingContext2D | null {
  if (!canvas) {
    canvas = document.createElement('canvas');
    ctx = canvas.getContext('2d');
  }
  return ctx;
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
  const col1 = [1, 3, 5, 10];
  const col2 = [15, 30, 60];
  const fmt = (preset: number, isSelected: boolean) => (isSelected ? `> ${preset} <` : `  ${preset}  `);
  const lines: string[] = [];

  for (let i = 0; i < Math.max(col1.length, col2.length); i++) {
    const left = i < col1.length ? fmt(col1[i], col1[i] === selectedPreset) : '        ';
    const right = i < col2.length ? fmt(col2[i], col2[i] === selectedPreset) : '        ';
    lines.push(`${left}    ${right}`);
  }

  return `Scegli minuti\n\n${lines.join('\n')}\n\nSwipe: cambia  Tap: avvia`;
}

function buildTimerOverlayText(state: TimerState, isBlinkingVisible: boolean): string {
  if (state === TimerState.PAUSED) {
    return 'PAUSA';
  }
  if (state === TimerState.DONE) {
    return isBlinkingVisible ? 'COMPLETATO' : ' ';
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

async function getMinutesPngBytes(minutes: string): Promise<number[]> {
  const cacheKey = `mm:${minutes}`;
  if (imageCache.has(cacheKey)) {
    return imageCache.get(cacheKey)!;
  }

  const left = DIGIT_PATTERNS[minutes[0]];
  const right = DIGIT_PATTERNS[minutes[1]];
  if (!left || !right) {
    return [];
  }

  const bytes = await renderPng(MM_WIDTH, DIGIT_HEIGHT, (drawCtx) => {
    drawPattern(drawCtx, left, 0, 0, DIGIT_SCALE);
    drawPattern(drawCtx, right, (DIGIT_BASE_WIDTH + GAP_BASE) * DIGIT_SCALE, 0, DIGIT_SCALE);
  });

  if (bytes.length > 0) {
    imageCache.set(cacheKey, bytes);
  }
  return bytes;
}

async function getSecondTensPngBytes(tens: string): Promise<number[]> {
  const cacheKey = `st:${tens}`;
  if (imageCache.has(cacheKey)) {
    return imageCache.get(cacheKey)!;
  }

  const tensPattern = DIGIT_PATTERNS[tens];
  if (!tensPattern) {
    return [];
  }

  const bytes = await renderPng(ST_WIDTH, DIGIT_HEIGHT, (drawCtx) => {
    drawPattern(drawCtx, COLON_PATTERN, 0, 0, DIGIT_SCALE);
    drawPattern(drawCtx, tensPattern, (COLON_BASE_WIDTH + GAP_BASE) * DIGIT_SCALE, 0, DIGIT_SCALE);
  });

  if (bytes.length > 0) {
    imageCache.set(cacheKey, bytes);
  }
  return bytes;
}

async function getSecondOnesPngBytes(ones: string): Promise<number[]> {
  const cacheKey = `so:${ones}`;
  if (imageCache.has(cacheKey)) {
    return imageCache.get(cacheKey)!;
  }

  const onesPattern = DIGIT_PATTERNS[ones];
  if (!onesPattern) {
    return [];
  }

  const bytes = await renderPng(DIGIT_WIDTH, DIGIT_HEIGHT, (drawCtx) => {
    drawPattern(drawCtx, onesPattern, 0, 0, DIGIT_SCALE);
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

function consumeQueuedTimerUpdate():
  | { bridge: any; remainingSeconds: number; forceAll: boolean }
  | null {
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

  const minutes = time.slice(0, 2);
  const secondTens = time[3];
  const secondOnes = time[4];

  const previousMinutes = lastDisplayedTime.slice(0, 2);
  const previousSecondTens = lastDisplayedTime[3];
  const previousSecondOnes = lastDisplayedTime[4];

  if (forceAll || !areTimerImagesVisible || minutes !== previousMinutes) {
    const mmBytes = await getMinutesPngBytes(minutes);
    await pushImage(bridge, MM_CONTAINER_ID, MM_CONTAINER_NAME, mmBytes);
  }

  if (forceAll || !areTimerImagesVisible || secondTens !== previousSecondTens) {
    const stBytes = await getSecondTensPngBytes(secondTens);
    await pushImage(bridge, ST_CONTAINER_ID, ST_CONTAINER_NAME, stBytes);
  }

  if (forceAll || !areTimerImagesVisible || secondOnes !== previousSecondOnes) {
    const soBytes = await getSecondOnesPngBytes(secondOnes);
    await pushImage(bridge, SO_CONTAINER_ID, SO_CONTAINER_NAME, soBytes);
  }

  lastDisplayedTime = time;
  areTimerImagesVisible = true;
}

async function updateTimerImages(bridge: any, remainingSeconds: number, forceAll = false): Promise<void> {
  if (imageUpdateInProgress) {
    queueLatestTimerUpdate(bridge, remainingSeconds, forceAll);
    return;
  }

  imageUpdateInProgress = true;

  try {
    await applyTimerImages(bridge, remainingSeconds, forceAll);

    let queued = consumeQueuedTimerUpdate();
    while (queued) {
      await applyTimerImages(queued.bridge, queued.remainingSeconds, queued.forceAll);
      queued = consumeQueuedTimerUpdate();
    }
  } catch (error) {
    console.error('[UI] Failed to update timer images:', error);
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
    const blankMM = await getBlankPngBytes('blank-mm', MM_WIDTH, DIGIT_HEIGHT);
    const blankST = await getBlankPngBytes('blank-st', ST_WIDTH, DIGIT_HEIGHT);
    const blankSO = await getBlankPngBytes('blank-so', DIGIT_WIDTH, DIGIT_HEIGHT);

    await pushImage(bridge, MM_CONTAINER_ID, MM_CONTAINER_NAME, blankMM);
    await pushImage(bridge, ST_CONTAINER_ID, ST_CONTAINER_NAME, blankST);
    await pushImage(bridge, SO_CONTAINER_ID, SO_CONTAINER_NAME, blankSO);

    lastDisplayedTime = '';
    areTimerImagesVisible = false;
  } catch (error) {
    console.error('[UI] Failed to clear timer images:', error);
  } finally {
    imageUpdateInProgress = false;
  }
}

async function warmupCache(selectedPreset: number): Promise<void> {
  const presetMinutes = String(Math.min(99, Math.max(0, selectedPreset))).padStart(2, '0');
  await getMinutesPngBytes('00');
  await getMinutesPngBytes(presetMinutes);

  for (let digit = 0; digit <= 9; digit++) {
    await getSecondOnesPngBytes(String(digit));
  }
  for (let digit = 0; digit <= 5; digit++) {
    await getSecondTensPngBytes(String(digit));
  }
}

function startWarmup(selectedPreset: number): void {
  if (cacheWarmupStarted) {
    return;
  }
  cacheWarmupStarted = true;
  void warmupCache(selectedPreset).catch((error) => {
    console.warn('[UI] Cache warmup failed:', error);
  });
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
      }
      pushText(bridge, buildPresetContent(selectedPreset));
      currentScreenType = 'preset';
      return;
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

    const mmContainer = new ImageContainerProperty({
      containerID: MM_CONTAINER_ID,
      containerName: MM_CONTAINER_NAME,
      xPosition: MM_X,
      yPosition: TIMER_Y,
      width: MM_WIDTH,
      height: DIGIT_HEIGHT,
    });

    const stContainer = new ImageContainerProperty({
      containerID: ST_CONTAINER_ID,
      containerName: ST_CONTAINER_NAME,
      xPosition: ST_X,
      yPosition: TIMER_Y,
      width: ST_WIDTH,
      height: DIGIT_HEIGHT,
    });

    const soContainer = new ImageContainerProperty({
      containerID: SO_CONTAINER_ID,
      containerName: SO_CONTAINER_NAME,
      xPosition: SO_X,
      yPosition: TIMER_Y,
      width: DIGIT_WIDTH,
      height: DIGIT_HEIGHT,
    });

    const result = await bridge.createStartUpPageContainer(
      new CreateStartUpPageContainer({
        containerTotalNum: 4,
        textObject: [textContainer],
        imageObject: [mmContainer, stContainer, soContainer],
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
    startWarmup(selectedPreset);

    return true;
  } catch (error) {
    console.error('[UI] createPageContainers error:', error);
    return false;
  }
}
