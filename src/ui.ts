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
const COLON_CONTAINER_ID = 3;
const SS_CONTAINER_ID = 4;

const TEXT_CONTAINER_NAME = 'timer-text';
const MM_CONTAINER_NAME = 'timer-mm';
const COLON_CONTAINER_NAME = 'timer-colon';
const SS_CONTAINER_NAME = 'timer-ss';

const DIGIT_SCALE = 14; // 5x7 bitmap digits => 70x98 each digit
const DIGIT_BASE_WIDTH = 5;
const DIGIT_BASE_HEIGHT = 7;
const PAIR_BASE_GAP = 1;
const COLON_BASE_WIDTH = 3;

const PAIR_WIDTH = (DIGIT_BASE_WIDTH * 2 + PAIR_BASE_GAP) * DIGIT_SCALE; // 154
const PAIR_HEIGHT = DIGIT_BASE_HEIGHT * DIGIT_SCALE; // 98
const COLON_WIDTH = COLON_BASE_WIDTH * DIGIT_SCALE; // 42
const COLON_HEIGHT = PAIR_HEIGHT;

const TIMER_GROUP_GAP = 14;
const TOTAL_TIMER_WIDTH = PAIR_WIDTH + TIMER_GROUP_GAP + COLON_WIDTH + TIMER_GROUP_GAP + PAIR_WIDTH;
const TIMER_Y = Math.floor((DISPLAY_HEIGHT - PAIR_HEIGHT) / 2);
const MM_X = Math.floor((DISPLAY_WIDTH - TOTAL_TIMER_WIDTH) / 2);
const COLON_X = MM_X + PAIR_WIDTH + TIMER_GROUP_GAP;
const SS_X = COLON_X + COLON_WIDTH + TIMER_GROUP_GAP;

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
let imageUpdateInProgress = false;
let lastDisplayedTime = '';
let lastTextContent = '';
let areTimerImagesVisible = false;

const pairCache = new Map<string, number[]>();
const staticImageCache = new Map<string, number[]>();

let canvas: HTMLCanvasElement | null = null;
let ctx: CanvasRenderingContext2D | null = null;

function getContext(): CanvasRenderingContext2D | null {
  if (!canvas) {
    canvas = document.createElement('canvas');
    ctx = canvas.getContext('2d');
  }
  return ctx;
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

async function getPairPngBytes(pair: string): Promise<number[]> {
  if (pairCache.has(pair)) {
    return pairCache.get(pair)!;
  }

  const first = DIGIT_PATTERNS[pair[0]];
  const second = DIGIT_PATTERNS[pair[1]];
  if (!first || !second) {
    return [];
  }

  const bytes = await renderPng(PAIR_WIDTH, PAIR_HEIGHT, (drawCtx) => {
    drawPattern(drawCtx, first, 0, 0, DIGIT_SCALE);
    drawPattern(drawCtx, second, (DIGIT_BASE_WIDTH + PAIR_BASE_GAP) * DIGIT_SCALE, 0, DIGIT_SCALE);
  });

  if (bytes.length > 0) {
    pairCache.set(pair, bytes);
  }
  return bytes;
}

async function getColonPngBytes(): Promise<number[]> {
  const cacheKey = 'colon';
  if (staticImageCache.has(cacheKey)) {
    return staticImageCache.get(cacheKey)!;
  }

  const bytes = await renderPng(COLON_WIDTH, COLON_HEIGHT, (drawCtx) => {
    drawPattern(drawCtx, COLON_PATTERN, 0, 0, DIGIT_SCALE);
  });

  if (bytes.length > 0) {
    staticImageCache.set(cacheKey, bytes);
  }
  return bytes;
}

async function getBlankPngBytes(cacheKey: string, width: number, height: number): Promise<number[]> {
  if (staticImageCache.has(cacheKey)) {
    return staticImageCache.get(cacheKey)!;
  }

  const bytes = await renderPng(width, height, () => undefined);
  if (bytes.length > 0) {
    staticImageCache.set(cacheKey, bytes);
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

async function clearTimerImages(bridge: any, force = false): Promise<void> {
  if (!force && !areTimerImagesVisible) {
    return;
  }
  if (imageUpdateInProgress) {
    return;
  }

  imageUpdateInProgress = true;

  try {
    const pairBlank = await getBlankPngBytes('blank-pair', PAIR_WIDTH, PAIR_HEIGHT);
    const colonBlank = await getBlankPngBytes('blank-colon', COLON_WIDTH, COLON_HEIGHT);

    await pushImage(bridge, MM_CONTAINER_ID, MM_CONTAINER_NAME, pairBlank);
    await pushImage(bridge, COLON_CONTAINER_ID, COLON_CONTAINER_NAME, colonBlank);
    await pushImage(bridge, SS_CONTAINER_ID, SS_CONTAINER_NAME, pairBlank);

    lastDisplayedTime = '';
    areTimerImagesVisible = false;
  } catch (error) {
    console.error('[UI] Failed to clear timer images:', error);
  } finally {
    imageUpdateInProgress = false;
  }
}

async function updateTimerImages(bridge: any, remainingSeconds: number, forceAll = false): Promise<void> {
  if (imageUpdateInProgress) {
    return;
  }

  const time = formatTime(remainingSeconds);
  if (!forceAll && time === lastDisplayedTime && areTimerImagesVisible) {
    return;
  }

  const minutes = time.slice(0, 2);
  const seconds = time.slice(3, 5);
  const previousMinutes = lastDisplayedTime.slice(0, 2);
  const previousSeconds = lastDisplayedTime.slice(3, 5);

  imageUpdateInProgress = true;

  try {
    if (forceAll || !areTimerImagesVisible) {
      const colonBytes = await getColonPngBytes();
      await pushImage(bridge, COLON_CONTAINER_ID, COLON_CONTAINER_NAME, colonBytes);
    }

    if (forceAll || !areTimerImagesVisible || minutes !== previousMinutes) {
      const mmBytes = await getPairPngBytes(minutes);
      await pushImage(bridge, MM_CONTAINER_ID, MM_CONTAINER_NAME, mmBytes);
    }

    if (forceAll || !areTimerImagesVisible || seconds !== previousSeconds) {
      const ssBytes = await getPairPngBytes(seconds);
      await pushImage(bridge, SS_CONTAINER_ID, SS_CONTAINER_NAME, ssBytes);
    }

    lastDisplayedTime = time;
    areTimerImagesVisible = true;
  } catch (error) {
    console.error('[UI] Failed to update timer images:', error);
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
      width: PAIR_WIDTH,
      height: PAIR_HEIGHT,
    });

    const colonContainer = new ImageContainerProperty({
      containerID: COLON_CONTAINER_ID,
      containerName: COLON_CONTAINER_NAME,
      xPosition: COLON_X,
      yPosition: TIMER_Y,
      width: COLON_WIDTH,
      height: COLON_HEIGHT,
    });

    const ssContainer = new ImageContainerProperty({
      containerID: SS_CONTAINER_ID,
      containerName: SS_CONTAINER_NAME,
      xPosition: SS_X,
      yPosition: TIMER_Y,
      width: PAIR_WIDTH,
      height: PAIR_HEIGHT,
    });

    const result = await bridge.createStartUpPageContainer(
      new CreateStartUpPageContainer({
        containerTotalNum: 4,
        textObject: [textContainer],
        imageObject: [mmContainer, colonContainer, ssContainer],
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

    await clearTimerImages(bridge, true);
    return true;
  } catch (error) {
    console.error('[UI] createPageContainers error:', error);
    return false;
  }
}
