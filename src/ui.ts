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
const MP_CONTAINER_ID = 2;
const MSS_CONTAINER_ID = 3;
const TEXT_CONTAINER_NAME = 'timer-text';
const MP_CONTAINER_NAME = 'timer-mp';
const MSS_CONTAINER_NAME = 'timer-mss';

const DIGIT_SCALE = 10;
const DIGIT_BASE_WIDTH = 5;
const DIGIT_BASE_HEIGHT = 7;
const COLON_BASE_WIDTH = 3;

const DIGIT_HEIGHT = DIGIT_BASE_HEIGHT * DIGIT_SCALE;
const MP_WIDTH = DIGIT_BASE_WIDTH * DIGIT_SCALE;
const MINUTE_COLON_GAP = 0;
const COLON_SECOND_GAP = 1;
const SECOND_DIGIT_GAP = 1;
const MSS_WIDTH =
  (DIGIT_BASE_WIDTH + MINUTE_COLON_GAP + COLON_BASE_WIDTH + COLON_SECOND_GAP +
    DIGIT_BASE_WIDTH + SECOND_DIGIT_GAP + DIGIT_BASE_WIDTH) * DIGIT_SCALE;

const TIMER_GROUP_GAP = 12;
const TOTAL_TIMER_WIDTH = MP_WIDTH + TIMER_GROUP_GAP + MSS_WIDTH;
const TIMER_Y = Math.floor((DISPLAY_HEIGHT - DIGIT_HEIGHT) / 2);
const MP_X = Math.floor((DISPLAY_WIDTH - TOTAL_TIMER_WIDTH) / 2);
const MSS_X = MP_X + MP_WIDTH + TIMER_GROUP_GAP;

type PixelPattern = number[][];

const DIGIT_PATTERNS: Record<string, PixelPattern> = {
  '0': [[1,1,1,1,1],[1,0,0,0,1],[1,0,0,0,1],[1,0,0,0,1],[1,0,0,0,1],[1,0,0,0,1],[1,1,1,1,1]],
  '1': [[0,0,1,0,0],[0,1,1,0,0],[0,0,1,0,0],[0,0,1,0,0],[0,0,1,0,0],[0,0,1,0,0],[0,1,1,1,0]],
  '2': [[1,1,1,1,1],[0,0,0,0,1],[0,0,0,0,1],[1,1,1,1,1],[1,0,0,0,0],[1,0,0,0,0],[1,1,1,1,1]],
  '3': [[1,1,1,1,1],[0,0,0,0,1],[0,0,0,0,1],[1,1,1,1,1],[0,0,0,0,1],[0,0,0,0,1],[1,1,1,1,1]],
  '4': [[1,0,0,0,1],[1,0,0,0,1],[1,0,0,0,1],[1,1,1,1,1],[0,0,0,0,1],[0,0,0,0,1],[0,0,0,0,1]],
  '5': [[1,1,1,1,1],[1,0,0,0,0],[1,0,0,0,0],[1,1,1,1,1],[0,0,0,0,1],[0,0,0,0,1],[1,1,1,1,1]],
  '6': [[1,1,1,1,1],[1,0,0,0,0],[1,0,0,0,0],[1,1,1,1,1],[1,0,0,0,1],[1,0,0,0,1],[1,1,1,1,1]],
  '7': [[1,1,1,1,1],[0,0,0,0,1],[0,0,0,0,1],[0,0,0,1,0],[0,0,1,0,0],[0,1,0,0,0],[1,0,0,0,0]],
  '8': [[1,1,1,1,1],[1,0,0,0,1],[1,0,0,0,1],[1,1,1,1,1],[1,0,0,0,1],[1,0,0,0,1],[1,1,1,1,1]],
  '9': [[1,1,1,1,1],[1,0,0,0,1],[1,0,0,0,1],[1,1,1,1,1],[0,0,0,0,1],[0,0,0,0,1],[1,1,1,1,1]],
};

const COLON_PATTERN: PixelPattern = [
  [0,0,0],[0,1,0],[0,0,0],[0,0,0],[0,0,0],[0,1,0],[0,0,0],
];

let currentScreenType: 'preset' | 'timer' | null = null;
let lastDisplayedTime = '';
let lastTextContent = '';
let areTimerImagesVisible = false;
let glassesUpdateInFlight = false;
let pendingUpdate: { bridge: any; seconds: number; forceAll: boolean; sessionId: number } | null = null;
let cacheWarmPromise: Promise<void> | null = null;
let renderSessionId = 0;

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

function startRenderSession(nextScreen: 'preset' | 'timer'): number {
  renderSessionId++;
  currentScreenType = nextScreen;
  pendingUpdate = null;
  return renderSessionId;
}

function isTimerSessionActive(sessionId: number): boolean {
  return currentScreenType === 'timer' && sessionId === renderSessionId;
}

function isPresetSessionActive(sessionId: number): boolean {
  return currentScreenType === 'preset' && sessionId === renderSessionId;
}

export function getTextMetrics(text: string) {
  return { contentLength: new TextEncoder().encode(text).length, contentOffset: 0 };
}

export function formatTime(seconds: number): string {
  const safe = Math.max(0, seconds);
  const minutes = Math.floor(safe / 60);
  return `${String(minutes).padStart(2, '0')}:${String(safe % 60).padStart(2, '0')}`;
}

function timeStringToSeconds(time: string): number {
  if (!time || time.length < 5) return Number.MAX_SAFE_INTEGER;
  const minutes = parseInt(time.slice(0, 2), 10);
  const seconds = parseInt(time.slice(3, 5), 10);
  return minutes * 60 + seconds;
}

function buildPresetContent(selectedPreset: number): string {
  const minutes = String(Math.min(99, Math.max(0, selectedPreset))).padStart(2, '0');
  const rowA = [1, 3, 5, 10].map(p => p === selectedPreset ? `[${p}]` : `${p}`).join('  ');
  const rowB = [15, 30, 60].map(p => p === selectedPreset ? `[${p}]` : `${p}`).join('  ');
  return ['G2 Timer', '', `Minutes: ${minutes}`, '', rowA, rowB, '', 'Swipe: change', 'Tap: start'].join('\n');
}

function buildTimerOverlayText(state: TimerState, blinkVisible: boolean): string {
  if (state === TimerState.PAUSED) return 'PAUSED';
  if (state === TimerState.DONE) return blinkVisible ? 'DONE' : ' ';
  return ' ';
}

function drawPattern(c: CanvasRenderingContext2D, pattern: PixelPattern, x: number, y: number, s: number) {
  for (let py = 0; py < pattern.length; py++)
    for (let px = 0; px < pattern[py].length; px++)
      if (pattern[py][px]) c.fillRect(x + px * s, y + py * s, s, s);
}

async function renderPng(width: number, height: number, draw: (c: CanvasRenderingContext2D) => void): Promise<number[]> {
  const c = getContext();
  if (!c || !canvas) return [];

  canvas.width = width;
  canvas.height = height;
  c.fillStyle = '#000';
  c.fillRect(0, 0, width, height);
  c.fillStyle = '#FFF';
  draw(c);

  try {
    const blob: Blob = await new Promise((resolve, reject) =>
      canvas!.toBlob(b => b ? resolve(b) : reject(new Error('toBlob')), 'image/png'));
    return Array.from(new Uint8Array(await blob.arrayBuffer()));
  } catch {
    return [];
  }
}

async function cachedPng(key: string, width: number, height: number, draw: (c: CanvasRenderingContext2D) => void): Promise<number[]> {
  const cached = imageCache.get(key);
  if (cached) return cached;
  const bytes = await renderPng(width, height, draw);
  if (bytes.length) imageCache.set(key, bytes);
  return bytes;
}

function getMpBytes(digit: string): Promise<number[]> {
  const pattern = DIGIT_PATTERNS[digit];
  if (!pattern) return Promise.resolve([]);
  return cachedPng(`mp:${digit}`, MP_WIDTH, DIGIT_HEIGHT, c => drawPattern(c, pattern, 0, 0, DIGIT_SCALE));
}

function getMssBytes(minuteOnes: string, seconds: string): Promise<number[]> {
  return cachedPng(`mss:${minuteOnes}${seconds}`, MSS_WIDTH, DIGIT_HEIGHT, c => {
    const mo = DIGIT_PATTERNS[minuteOnes];
    const st = DIGIT_PATTERNS[seconds[0]];
    const so = DIGIT_PATTERNS[seconds[1]];
    if (!mo || !st || !so) return;

    drawPattern(c, mo, 0, 0, DIGIT_SCALE);
    drawPattern(c, COLON_PATTERN, (DIGIT_BASE_WIDTH + MINUTE_COLON_GAP) * DIGIT_SCALE, 0, DIGIT_SCALE);
    drawPattern(c, st, (DIGIT_BASE_WIDTH + MINUTE_COLON_GAP + COLON_BASE_WIDTH + COLON_SECOND_GAP) * DIGIT_SCALE, 0, DIGIT_SCALE);
    drawPattern(c, so, (DIGIT_BASE_WIDTH + MINUTE_COLON_GAP + COLON_BASE_WIDTH + COLON_SECOND_GAP + DIGIT_BASE_WIDTH + SECOND_DIGIT_GAP) * DIGIT_SCALE, 0, DIGIT_SCALE);
  });
}

function getBlankBytes(key: string, width: number, height: number): Promise<number[]> {
  return cachedPng(key, width, height, () => {});
}

function prefetchSecond(seconds: number): void {
  const time = formatTime(seconds);
  const mTens = time[0];
  const mOnes = time[1];
  const ss = time.slice(3, 5);
  void getMpBytes(mTens);
  void getMssBytes(mOnes, ss);
}

async function warmBaseCache(): Promise<void> {
  if (cacheWarmPromise) return cacheWarmPromise;

  cacheWarmPromise = (async () => {
    for (let digit = 0; digit <= 9; digit++) {
      await getMpBytes(String(digit));
    }
    await getBlankBytes('blank-mp', MP_WIDTH, DIGIT_HEIGHT);
    await getBlankBytes('blank-mss', MSS_WIDTH, DIGIT_HEIGHT);
    for (let second = 0; second < 60; second++) {
      const ss = String(second).padStart(2, '0');
      await getMssBytes('0', ss);
    }
  })().catch((error) => {
    console.warn('[UI] warmBaseCache failed:', error);
  });

  return cacheWarmPromise;
}

async function pushImage(bridge: any, id: number, name: string, data: number[]): Promise<void> {
  if (!data.length) return;
  await bridge.updateImageRawData(new ImageRawDataUpdate({ containerID: id, containerName: name, imageData: data }));
}

function pushText(bridge: any, content: string, force = false): void {
  if (!force && content === lastTextContent) return;
  const metrics = getTextMetrics(content);
  bridge.textContainerUpgrade(new TextContainerUpgrade({
    containerID: TEXT_CONTAINER_ID, containerName: TEXT_CONTAINER_NAME,
    content, contentLength: metrics.contentLength, contentOffset: metrics.contentOffset,
  }));
  lastTextContent = content;
}

async function applyTimerImages(bridge: any, seconds: number, forceAll: boolean): Promise<void> {
  const sessionId = renderSessionId;
  if (!isTimerSessionActive(sessionId)) return;

  const time = formatTime(seconds);
  const mTens = time[0];
  const mOnes = time[1];
  const ss = time.slice(3, 5);
  const prevMTens = lastDisplayedTime[0];
  const prevMOnes = lastDisplayedTime[1];
  const prevSS = lastDisplayedTime.slice(3, 5);

  const needMp = forceAll || !areTimerImagesVisible || mTens !== prevMTens;
  const needMss = forceAll || !areTimerImagesVisible || mOnes !== prevMOnes || ss !== prevSS;
  if (!needMp && !needMss && !forceAll) return;

  if (needMss) {
    const mssData = await getMssBytes(mOnes, ss);
    if (!isTimerSessionActive(sessionId)) return;
    await pushImage(bridge, MSS_CONTAINER_ID, MSS_CONTAINER_NAME, mssData);
  }
  if (needMp) {
    const mpData = await getMpBytes(mTens);
    if (!isTimerSessionActive(sessionId)) return;
    await pushImage(bridge, MP_CONTAINER_ID, MP_CONTAINER_NAME, mpData);
  }

  if (!isTimerSessionActive(sessionId)) return;
  lastDisplayedTime = time;
  areTimerImagesVisible = true;

  if (seconds > 0 && isTimerSessionActive(sessionId)) {
    prefetchSecond(seconds - 1);
    if (seconds > 1) prefetchSecond(seconds - 2);
  }
}

export async function updateGlassesTimer(bridge: any, seconds: number, forceAll = false, sessionId = renderSessionId): Promise<void> {
  if (!isTimerSessionActive(sessionId)) return;

  if (glassesUpdateInFlight) {
    pendingUpdate = { bridge, seconds, forceAll: Boolean(pendingUpdate?.forceAll || forceAll), sessionId };
    return;
  }

  glassesUpdateInFlight = true;
  try {
    if (!isTimerSessionActive(sessionId)) return;
    await applyTimerImages(bridge, seconds, forceAll);
    if (pendingUpdate) {
      const queued = pendingUpdate;
      pendingUpdate = null;

      if (isTimerSessionActive(queued.sessionId)) {
        const lastSec = timeStringToSeconds(lastDisplayedTime);
        if (queued.seconds <= lastSec || queued.forceAll) {
          await applyTimerImages(queued.bridge, queued.seconds, queued.forceAll);
        }
      }
    }
  } catch (error) {
    console.error('[UI] updateGlassesTimer error:', error);
  } finally {
    glassesUpdateInFlight = false;
  }
}

async function clearTimerImages(bridge: any, sessionId: number): Promise<void> {
  if (!isPresetSessionActive(sessionId)) return;

  try {
    const blankMp = await getBlankBytes('blank-mp', MP_WIDTH, DIGIT_HEIGHT);
    const blankMss = await getBlankBytes('blank-mss', MSS_WIDTH, DIGIT_HEIGHT);
    if (!isPresetSessionActive(sessionId)) return;

    await pushImage(bridge, MP_CONTAINER_ID, MP_CONTAINER_NAME, blankMp);
    if (!isPresetSessionActive(sessionId)) return;

    await pushImage(bridge, MSS_CONTAINER_ID, MSS_CONTAINER_NAME, blankMss);
    if (!isPresetSessionActive(sessionId)) return;

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
  if (!bridge) return;
  try {
    if (debugMessage) {
      pushText(bridge, debugMessage, true);
      return;
    }

    if (state === TimerState.IDLE) {
      const switchedFromTimer = currentScreenType !== 'preset';
      const sessionId = switchedFromTimer ? startRenderSession('preset') : renderSessionId;

      pushText(bridge, buildPresetContent(selectedPreset));

      if (switchedFromTimer || areTimerImagesVisible) {
        void clearTimerImages(bridge, sessionId);

        // A second delayed clear avoids stale timer images when a previous push finishes late.
        if (switchedFromTimer) {
          setTimeout(() => {
            if (isPresetSessionActive(sessionId)) {
              void clearTimerImages(bridge, sessionId);
            }
          }, 140);
        }
      }

      return;
    }

    pushText(bridge, buildTimerOverlayText(state, blinkVisible));

    let sessionId = renderSessionId;
    if (currentScreenType !== 'timer') {
      sessionId = startRenderSession('timer');
      lastDisplayedTime = '';
      await updateGlassesTimer(bridge, remainingSeconds, true, sessionId);
      return;
    }
    await updateGlassesTimer(bridge, remainingSeconds, false, sessionId);
  } catch (error) {
    console.error('[UI] renderUI error:', error);
  }
}

export async function createPageContainers(bridge: any, selectedPreset = 5): Promise<boolean> {
  if (!bridge) return false;
  try {
    const presetContent = buildPresetContent(selectedPreset);
    const textContainer = new TextContainerProperty({
      containerID: TEXT_CONTAINER_ID, containerName: TEXT_CONTAINER_NAME,
      xPosition: 0, yPosition: 0, width: DISPLAY_WIDTH, height: DISPLAY_HEIGHT,
      borderWidth: 0, borderColor: 0, paddingLength: 20,
      content: presetContent, isEventCapture: 1,
    });
    const mpContainer = new ImageContainerProperty({
      containerID: MP_CONTAINER_ID, containerName: MP_CONTAINER_NAME,
      xPosition: MP_X, yPosition: TIMER_Y, width: MP_WIDTH, height: DIGIT_HEIGHT,
    });
    const mssContainer = new ImageContainerProperty({
      containerID: MSS_CONTAINER_ID, containerName: MSS_CONTAINER_NAME,
      xPosition: MSS_X, yPosition: TIMER_Y, width: MSS_WIDTH, height: DIGIT_HEIGHT,
    });

    const result = await bridge.createStartUpPageContainer(
      new CreateStartUpPageContainer({ containerTotalNum: 3, textObject: [textContainer], imageObject: [mpContainer, mssContainer] }),
    );

    if (StartUpPageCreateResult.normalize(result) !== StartUpPageCreateResult.success) {
      console.error('[UI] createStartUpPageContainer failed:', result);
      return false;
    }

    startRenderSession('preset');
    lastTextContent = presetContent;
    lastDisplayedTime = '';
    areTimerImagesVisible = false;

    void warmBaseCache();
    await clearTimerImages(bridge, renderSessionId);
    return true;
  } catch (error) {
    console.error('[UI] createPageContainers error:', error);
    return false;
  }
}

export function resetPreviousTexts(): void {
  renderSessionId++;
  currentScreenType = null;
  lastDisplayedTime = '';
  lastTextContent = '';
  areTimerImagesVisible = false;
  pendingUpdate = null;
}
