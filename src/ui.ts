import { TimerState } from './constants';
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
const MINUTE_TENS_CONTAINER_ID = 2;
const MINUTE_ONES_CONTAINER_ID = 3;
const COLON_CONTAINER_ID = 4;
const SECOND_TENS_CONTAINER_ID = 5;
const SECOND_ONES_CONTAINER_ID = 6;

const TEXT_CONTAINER_NAME = 'timer-text';
const MINUTE_TENS_CONTAINER_NAME = 'timer-m10';
const MINUTE_ONES_CONTAINER_NAME = 'timer-m1';
const COLON_CONTAINER_NAME = 'timer-colon';
const SECOND_TENS_CONTAINER_NAME = 'timer-s10';
const SECOND_ONES_CONTAINER_NAME = 'timer-s1';

const DIGIT_SCALE = 10;
const DIGIT_BASE_WIDTH = 5;
const DIGIT_BASE_HEIGHT = 7;
const COLON_BASE_WIDTH = 3;

const DIGIT_WIDTH = DIGIT_BASE_WIDTH * DIGIT_SCALE;
const DIGIT_HEIGHT = DIGIT_BASE_HEIGHT * DIGIT_SCALE;
const COLON_WIDTH = COLON_BASE_WIDTH * DIGIT_SCALE;

const DIGIT_GAP = 2;
const COLON_GAP = 2;
const TIMER_TOTAL_WIDTH =
  DIGIT_WIDTH * 4 + COLON_WIDTH + DIGIT_GAP * 3 + COLON_GAP * 2;
const TIMER_Y = Math.floor((DISPLAY_HEIGHT - DIGIT_HEIGHT) / 2);
const TIMER_START_X = Math.floor((DISPLAY_WIDTH - TIMER_TOTAL_WIDTH) / 2);

const M10_X = TIMER_START_X;
const M1_X = M10_X + DIGIT_WIDTH + DIGIT_GAP;
const COLON_X = M1_X + DIGIT_WIDTH + COLON_GAP;
const S10_X = COLON_X + COLON_WIDTH + COLON_GAP;
const S1_X = S10_X + DIGIT_WIDTH + DIGIT_GAP;

type PixelPattern = number[][];

const DIGIT_PATTERNS: Record<string, PixelPattern> = {
  '0': [[1, 1, 1, 1, 1], [1, 0, 0, 0, 1], [1, 0, 0, 0, 1], [1, 0, 0, 0, 1], [1, 0, 0, 0, 1], [1, 0, 0, 0, 1], [1, 1, 1, 1, 1]],
  '1': [[0, 0, 1, 0, 0], [0, 1, 1, 0, 0], [0, 0, 1, 0, 0], [0, 0, 1, 0, 0], [0, 0, 1, 0, 0], [0, 0, 1, 0, 0], [0, 1, 1, 1, 0]],
  '2': [[1, 1, 1, 1, 1], [0, 0, 0, 0, 1], [0, 0, 0, 0, 1], [1, 1, 1, 1, 1], [1, 0, 0, 0, 0], [1, 0, 0, 0, 0], [1, 1, 1, 1, 1]],
  '3': [[1, 1, 1, 1, 1], [0, 0, 0, 0, 1], [0, 0, 0, 0, 1], [1, 1, 1, 1, 1], [0, 0, 0, 0, 1], [0, 0, 0, 0, 1], [1, 1, 1, 1, 1]],
  '4': [[1, 0, 0, 0, 1], [1, 0, 0, 0, 1], [1, 0, 0, 0, 1], [1, 1, 1, 1, 1], [0, 0, 0, 0, 1], [0, 0, 0, 0, 1], [0, 0, 0, 0, 1]],
  '5': [[1, 1, 1, 1, 1], [1, 0, 0, 0, 0], [1, 0, 0, 0, 0], [1, 1, 1, 1, 1], [0, 0, 0, 0, 1], [0, 0, 0, 0, 1], [1, 1, 1, 1, 1]],
  '6': [[1, 1, 1, 1, 1], [1, 0, 0, 0, 0], [1, 0, 0, 0, 0], [1, 1, 1, 1, 1], [1, 0, 0, 0, 1], [1, 0, 0, 0, 1], [1, 1, 1, 1, 1]],
  '7': [[1, 1, 1, 1, 1], [0, 0, 0, 0, 1], [0, 0, 0, 0, 1], [0, 0, 0, 1, 0], [0, 0, 1, 0, 0], [0, 1, 0, 0, 0], [1, 0, 0, 0, 0]],
  '8': [[1, 1, 1, 1, 1], [1, 0, 0, 0, 1], [1, 0, 0, 0, 1], [1, 1, 1, 1, 1], [1, 0, 0, 0, 1], [1, 0, 0, 0, 1], [1, 1, 1, 1, 1]],
  '9': [[1, 1, 1, 1, 1], [1, 0, 0, 0, 1], [1, 0, 0, 0, 1], [1, 1, 1, 1, 1], [0, 0, 0, 0, 1], [0, 0, 0, 0, 1], [1, 1, 1, 1, 1]],
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
let glassesUpdateInFlight = false;
let pendingUpdate: { bridge: any; seconds: number; forceAll: boolean } | null = null;
let cacheWarmPromise: Promise<void> | null = null;

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

export function getTextMetrics(text: string) {
  return { contentLength: new TextEncoder().encode(text).length, contentOffset: 0 };
}

export function formatTime(seconds: number): string {
  const safeSeconds = Math.max(0, seconds);
  const minutes = Math.floor(safeSeconds / 60);
  return `${String(minutes).padStart(2, '0')}:${String(safeSeconds % 60).padStart(2, '0')}`;
}

function timeStringToSeconds(time: string): number {
  if (!time || time.length < 5) {
    return Number.MAX_SAFE_INTEGER;
  }
  const minutes = parseInt(time.slice(0, 2), 10);
  const seconds = parseInt(time.slice(3, 5), 10);
  return minutes * 60 + seconds;
}

function buildPresetContent(selectedPreset: number): string {
  const minutes = String(Math.min(99, Math.max(0, selectedPreset))).padStart(2, '0');
  const rowA = [1, 3, 5, 10].map((preset) => (preset === selectedPreset ? `[${preset}]` : `${preset}`)).join('  ');
  const rowB = [15, 30, 60].map((preset) => (preset === selectedPreset ? `[${preset}]` : `${preset}`)).join('  ');
  return ['G2 Timer', '', `Minutes: ${minutes}`, '', rowA, rowB, '', 'Swipe: change', 'Tap: start'].join('\n');
}

function buildTimerOverlayText(state: TimerState, blinkVisible: boolean): string {
  if (state === TimerState.PAUSED) {
    return 'PAUSED';
  }
  if (state === TimerState.DONE) {
    return blinkVisible ? 'DONE' : ' ';
  }
  return ' ';
}

function drawPattern(
  context: CanvasRenderingContext2D,
  pattern: PixelPattern,
  x: number,
  y: number,
  scale: number,
) {
  for (let py = 0; py < pattern.length; py++) {
    for (let px = 0; px < pattern[py].length; px++) {
      if (pattern[py][px]) {
        context.fillRect(x + px * scale, y + py * scale, scale, scale);
      }
    }
  }
}

async function renderPng(
  width: number,
  height: number,
  draw: (context: CanvasRenderingContext2D) => void,
): Promise<number[]> {
  const context = getContext();
  if (!context || !canvas) {
    return [];
  }

  canvas.width = width;
  canvas.height = height;
  context.fillStyle = '#000';
  context.fillRect(0, 0, width, height);
  context.fillStyle = '#FFF';
  draw(context);

  try {
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas!.toBlob((result) => (result ? resolve(result) : reject(new Error('toBlob failed'))), 'image/png'),
    );
    return Array.from(new Uint8Array(await blob.arrayBuffer()));
  } catch {
    return [];
  }
}

async function cachedPng(
  key: string,
  width: number,
  height: number,
  draw: (context: CanvasRenderingContext2D) => void,
): Promise<number[]> {
  const cached = imageCache.get(key);
  if (cached) {
    return cached;
  }
  const bytes = await renderPng(width, height, draw);
  if (bytes.length) {
    imageCache.set(key, bytes);
  }
  return bytes;
}

function getDigitBytes(digit: string): Promise<number[]> {
  const pattern = DIGIT_PATTERNS[digit];
  if (!pattern) {
    return Promise.resolve([]);
  }
  return cachedPng(`digit:${digit}`, DIGIT_WIDTH, DIGIT_HEIGHT, (context) =>
    drawPattern(context, pattern, 0, 0, DIGIT_SCALE),
  );
}

function getColonBytes(): Promise<number[]> {
  return cachedPng('colon', COLON_WIDTH, DIGIT_HEIGHT, (context) =>
    drawPattern(context, COLON_PATTERN, 0, 0, DIGIT_SCALE),
  );
}

function getBlankBytes(key: string, width: number, height: number): Promise<number[]> {
  return cachedPng(key, width, height, () => {});
}

async function warmDigitCache(): Promise<void> {
  if (cacheWarmPromise) {
    return cacheWarmPromise;
  }

  cacheWarmPromise = (async () => {
    for (let digit = 0; digit <= 9; digit++) {
      await getDigitBytes(String(digit));
    }
    await getColonBytes();
    await getBlankBytes('blank-digit', DIGIT_WIDTH, DIGIT_HEIGHT);
    await getBlankBytes('blank-colon', COLON_WIDTH, DIGIT_HEIGHT);
  })().catch((error) => {
    console.warn('[UI] warmDigitCache failed:', error);
  });

  return cacheWarmPromise;
}

async function pushImage(bridge: any, id: number, name: string, data: number[]): Promise<void> {
  if (!data.length) {
    return;
  }
  await bridge.updateImageRawData(
    new ImageRawDataUpdate({
      containerID: id,
      containerName: name,
      imageData: data,
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

async function applyTimerImages(bridge: any, seconds: number, forceAll: boolean): Promise<void> {
  const time = formatTime(seconds);
  const minuteTens = time[0];
  const minuteOnes = time[1];
  const secondTens = time[3];
  const secondOnes = time[4];

  const previous = lastDisplayedTime.padEnd(5, ' ');
  const needMinuteTens = forceAll || !areTimerImagesVisible || minuteTens !== previous[0];
  const needMinuteOnes = forceAll || !areTimerImagesVisible || minuteOnes !== previous[1];
  const needSecondTens = forceAll || !areTimerImagesVisible || secondTens !== previous[3];
  const needSecondOnes = forceAll || !areTimerImagesVisible || secondOnes !== previous[4];
  const needColon = forceAll || !areTimerImagesVisible;

  if (!needMinuteTens && !needMinuteOnes && !needSecondTens && !needSecondOnes && !needColon) {
    return;
  }

  if (needMinuteTens) {
    await pushImage(bridge, MINUTE_TENS_CONTAINER_ID, MINUTE_TENS_CONTAINER_NAME, await getDigitBytes(minuteTens));
  }
  if (needMinuteOnes) {
    await pushImage(bridge, MINUTE_ONES_CONTAINER_ID, MINUTE_ONES_CONTAINER_NAME, await getDigitBytes(minuteOnes));
  }
  if (needColon) {
    await pushImage(bridge, COLON_CONTAINER_ID, COLON_CONTAINER_NAME, await getColonBytes());
  }
  if (needSecondTens) {
    await pushImage(bridge, SECOND_TENS_CONTAINER_ID, SECOND_TENS_CONTAINER_NAME, await getDigitBytes(secondTens));
  }
  if (needSecondOnes) {
    await pushImage(bridge, SECOND_ONES_CONTAINER_ID, SECOND_ONES_CONTAINER_NAME, await getDigitBytes(secondOnes));
  }

  lastDisplayedTime = time;
  areTimerImagesVisible = true;
}

export async function updateGlassesTimer(bridge: any, seconds: number, forceAll = false): Promise<void> {
  if (glassesUpdateInFlight) {
    pendingUpdate = {
      bridge,
      seconds,
      forceAll: Boolean(pendingUpdate?.forceAll || forceAll),
    };
    return;
  }

  glassesUpdateInFlight = true;
  try {
    await applyTimerImages(bridge, seconds, forceAll);
    if (pendingUpdate) {
      const queued = pendingUpdate;
      pendingUpdate = null;

      const lastSeconds = timeStringToSeconds(lastDisplayedTime);
      if (queued.seconds <= lastSeconds || queued.forceAll) {
        await applyTimerImages(queued.bridge, queued.seconds, queued.forceAll);
      }
    }
  } catch (error) {
    console.error('[UI] updateGlassesTimer error:', error);
  } finally {
    glassesUpdateInFlight = false;
  }
}

async function clearTimerImages(bridge: any): Promise<void> {
  if (!areTimerImagesVisible) {
    return;
  }

  const deadline = Date.now() + 3000;
  while (glassesUpdateInFlight && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 80));
  }

  try {
    const blankDigit = await getBlankBytes('blank-digit', DIGIT_WIDTH, DIGIT_HEIGHT);
    const blankColon = await getBlankBytes('blank-colon', COLON_WIDTH, DIGIT_HEIGHT);
    await pushImage(bridge, MINUTE_TENS_CONTAINER_ID, MINUTE_TENS_CONTAINER_NAME, blankDigit);
    await pushImage(bridge, MINUTE_ONES_CONTAINER_ID, MINUTE_ONES_CONTAINER_NAME, blankDigit);
    await pushImage(bridge, COLON_CONTAINER_ID, COLON_CONTAINER_NAME, blankColon);
    await pushImage(bridge, SECOND_TENS_CONTAINER_ID, SECOND_TENS_CONTAINER_NAME, blankDigit);
    await pushImage(bridge, SECOND_ONES_CONTAINER_ID, SECOND_ONES_CONTAINER_NAME, blankDigit);
    lastDisplayedTime = '';
    areTimerImagesVisible = false;
  } catch (error) {
    console.error('[UI] clearTimerImages error:', error);
  }
}

export async function renderUI(
  bridge: any,
  state: TimerState,
  selectedPreset: number,
  remainingSeconds: number,
  blinkVisible = true,
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
        await clearTimerImages(bridge);
      }
      pushText(bridge, buildPresetContent(selectedPreset));
      currentScreenType = 'preset';
      return;
    }

    pushText(bridge, buildTimerOverlayText(state, blinkVisible));

    if (currentScreenType !== 'timer') {
      currentScreenType = 'timer';
      lastDisplayedTime = '';
      await updateGlassesTimer(bridge, remainingSeconds, true);
      return;
    }

    await updateGlassesTimer(bridge, remainingSeconds, false);
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

    const minuteTensContainer = new ImageContainerProperty({
      containerID: MINUTE_TENS_CONTAINER_ID,
      containerName: MINUTE_TENS_CONTAINER_NAME,
      xPosition: M10_X,
      yPosition: TIMER_Y,
      width: DIGIT_WIDTH,
      height: DIGIT_HEIGHT,
    });
    const minuteOnesContainer = new ImageContainerProperty({
      containerID: MINUTE_ONES_CONTAINER_ID,
      containerName: MINUTE_ONES_CONTAINER_NAME,
      xPosition: M1_X,
      yPosition: TIMER_Y,
      width: DIGIT_WIDTH,
      height: DIGIT_HEIGHT,
    });
    const colonContainer = new ImageContainerProperty({
      containerID: COLON_CONTAINER_ID,
      containerName: COLON_CONTAINER_NAME,
      xPosition: COLON_X,
      yPosition: TIMER_Y,
      width: COLON_WIDTH,
      height: DIGIT_HEIGHT,
    });
    const secondTensContainer = new ImageContainerProperty({
      containerID: SECOND_TENS_CONTAINER_ID,
      containerName: SECOND_TENS_CONTAINER_NAME,
      xPosition: S10_X,
      yPosition: TIMER_Y,
      width: DIGIT_WIDTH,
      height: DIGIT_HEIGHT,
    });
    const secondOnesContainer = new ImageContainerProperty({
      containerID: SECOND_ONES_CONTAINER_ID,
      containerName: SECOND_ONES_CONTAINER_NAME,
      xPosition: S1_X,
      yPosition: TIMER_Y,
      width: DIGIT_WIDTH,
      height: DIGIT_HEIGHT,
    });

    const result = await bridge.createStartUpPageContainer(
      new CreateStartUpPageContainer({
        containerTotalNum: 6,
        textObject: [textContainer],
        imageObject: [
          minuteTensContainer,
          minuteOnesContainer,
          colonContainer,
          secondTensContainer,
          secondOnesContainer,
        ],
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
    pendingUpdate = null;

    await warmDigitCache();
    await clearTimerImages(bridge);
    return true;
  } catch (error) {
    console.error('[UI] createPageContainers error:', error);
    return false;
  }
}

export function resetPreviousTexts(): void {
  lastDisplayedTime = '';
  lastTextContent = '';
  areTimerImagesVisible = false;
  pendingUpdate = null;
}
