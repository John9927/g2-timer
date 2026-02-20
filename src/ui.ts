import { TimerState } from './constants';
import {
  StartUpPageCreateResult,
  CreateStartUpPageContainer,
  TextContainerProperty,
  TextContainerUpgrade,
  ImageRawDataUpdate,
  ImageContainerProperty,
} from '@evenrealities/even_hub_sdk';

// ── Display geometry ──────────────────────────────────────────────
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

// ── Pixel font patterns ──────────────────────────────────────────
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

// ── State ─────────────────────────────────────────────────────────
let currentScreenType: 'preset' | 'timer' | null = null;
let lastDisplayedTime = '';
let lastTextContent = '';
let areTimerImagesVisible = false;

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

// ── Helpers ───────────────────────────────────────────────────────
export function getTextMetrics(text: string) {
  return { contentLength: new TextEncoder().encode(text).length, contentOffset: 0 };
}

export function formatTime(seconds: number): string {
  const s = Math.max(0, seconds);
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
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

// ── PNG generation (cached) ───────────────────────────────────────
function drawPattern(c: CanvasRenderingContext2D, pattern: PixelPattern, x: number, y: number, s: number) {
  for (let py = 0; py < pattern.length; py++)
    for (let px = 0; px < pattern[py].length; px++)
      if (pattern[py][px]) c.fillRect(x + px * s, y + py * s, s, s);
}

async function renderPng(w: number, h: number, draw: (c: CanvasRenderingContext2D) => void): Promise<number[]> {
  const c = getContext();
  if (!c || !canvas) return [];
  canvas.width = w;
  canvas.height = h;
  c.fillStyle = '#000';
  c.fillRect(0, 0, w, h);
  c.fillStyle = '#FFF';
  draw(c);
  try {
    const blob: Blob = await new Promise((ok, fail) =>
      canvas!.toBlob(b => b ? ok(b) : fail(new Error('toBlob')), 'image/png'));
    return Array.from(new Uint8Array(await blob.arrayBuffer()));
  } catch { return []; }
}

async function cachedPng(key: string, w: number, h: number, draw: (c: CanvasRenderingContext2D) => void): Promise<number[]> {
  if (imageCache.has(key)) return imageCache.get(key)!;
  const bytes = await renderPng(w, h, draw);
  if (bytes.length) imageCache.set(key, bytes);
  return bytes;
}

function getMpBytes(digit: string) {
  const p = DIGIT_PATTERNS[digit];
  if (!p) return Promise.resolve([] as number[]);
  return cachedPng(`mp:${digit}`, MP_WIDTH, DIGIT_HEIGHT, c => drawPattern(c, p, 0, 0, DIGIT_SCALE));
}

function getMssBytes(minOnes: string, secs: string) {
  return cachedPng(`mss:${minOnes}${secs}`, MSS_WIDTH, DIGIT_HEIGHT, c => {
    const mo = DIGIT_PATTERNS[minOnes], st = DIGIT_PATTERNS[secs[0]], so = DIGIT_PATTERNS[secs[1]];
    if (!mo || !st || !so) return;
    drawPattern(c, mo, 0, 0, DIGIT_SCALE);
    drawPattern(c, COLON_PATTERN, (DIGIT_BASE_WIDTH + MINUTE_COLON_GAP) * DIGIT_SCALE, 0, DIGIT_SCALE);
    drawPattern(c, st, (DIGIT_BASE_WIDTH + MINUTE_COLON_GAP + COLON_BASE_WIDTH + COLON_SECOND_GAP) * DIGIT_SCALE, 0, DIGIT_SCALE);
    drawPattern(c, so, (DIGIT_BASE_WIDTH + MINUTE_COLON_GAP + COLON_BASE_WIDTH + COLON_SECOND_GAP + DIGIT_BASE_WIDTH + SECOND_DIGIT_GAP) * DIGIT_SCALE, 0, DIGIT_SCALE);
  });
}

function getBlankBytes(key: string, w: number, h: number) {
  return cachedPng(key, w, h, () => {});
}

// ── Bridge helpers ────────────────────────────────────────────────
async function pushImage(bridge: any, id: number, name: string, data: number[]) {
  if (!data.length) return;
  await bridge.updateImageRawData(new ImageRawDataUpdate({ containerID: id, containerName: name, imageData: data }));
}

function pushText(bridge: any, content: string, force = false) {
  if (!force && content === lastTextContent) return;
  const m = getTextMetrics(content);
  bridge.textContainerUpgrade(new TextContainerUpgrade({
    containerID: TEXT_CONTAINER_ID, containerName: TEXT_CONTAINER_NAME,
    content, contentLength: m.contentLength, contentOffset: m.contentOffset,
  }));
  lastTextContent = content;
}

// When multiple pushes run at once, only the latest completion should update state
let timerUpdateSequence = 0;

async function applyTimerImages(bridge: any, seconds: number, forceAll: boolean) {
  const time = formatTime(seconds);
  const mySeq = ++timerUpdateSequence;

  const mTens = time[0], mOnes = time[1], ss = time.slice(3, 5);
  const prevMTens = lastDisplayedTime[0], prevMOnes = lastDisplayedTime[1];
  const prevSS = lastDisplayedTime.slice(3, 5);

  const needMp = forceAll || !areTimerImagesVisible || mTens !== prevMTens;
  const needMss = forceAll || !areTimerImagesVisible || mOnes !== prevMOnes || ss !== prevSS;
  if (!needMp && !needMss && !forceAll) return;

  if (needMss) {
    const mssData = await getMssBytes(mOnes, ss);
    await pushImage(bridge, MSS_CONTAINER_ID, MSS_CONTAINER_NAME, mssData);
  }
  if (needMp) {
    const mpData = await getMpBytes(mTens);
    await pushImage(bridge, MP_CONTAINER_ID, MP_CONTAINER_NAME, mpData);
  }

  // Only commit if we're still the latest (avoid old push overwriting newer)
  if (mySeq === timerUpdateSequence) {
    lastDisplayedTime = time;
    areTimerImagesVisible = true;
  }
}

/**
 * Send timer images to glasses. Called every second; overlapping pushes allowed
 * so the display updates every 1s (device shows latest).
 */
export async function updateGlassesTimer(bridge: any, seconds: number, forceAll = false): Promise<void> {
  try {
    await applyTimerImages(bridge, seconds, forceAll);
  } catch (err) {
    console.error('[UI] glasses update error:', err);
  }
}

// ── Clear digit containers ────────────────────────────────────────
async function clearTimerImages(bridge: any) {
  if (!areTimerImagesVisible) return;
  try {
    await pushImage(bridge, MP_CONTAINER_ID, MP_CONTAINER_NAME, await getBlankBytes('blank-mp', MP_WIDTH, DIGIT_HEIGHT));
    await pushImage(bridge, MSS_CONTAINER_ID, MSS_CONTAINER_NAME, await getBlankBytes('blank-mss', MSS_WIDTH, DIGIT_HEIGHT));
    lastDisplayedTime = '';
    areTimerImagesVisible = false;
  } catch (err) {
    console.error('[UI] clearTimerImages error:', err);
  }
}

// ── Public API ────────────────────────────────────────────────────
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
    if (debugMessage) { pushText(bridge, debugMessage, true); return; }

    if (state === TimerState.IDLE) {
      if (currentScreenType !== 'preset') await clearTimerImages(bridge);
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
    await updateGlassesTimer(bridge, remainingSeconds);
  } catch (err) {
    console.error('[UI] renderUI error:', err);
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

    currentScreenType = 'preset';
    lastTextContent = presetContent;
    lastDisplayedTime = '';
    areTimerImagesVisible = false;

    await clearTimerImages(bridge);
    return true;
  } catch (err) {
    console.error('[UI] createPageContainers error:', err);
    return false;
  }
}

// Legacy exports kept for compatibility
export function resetPreviousTexts(): void {
  lastDisplayedTime = '';
  lastTextContent = '';
  areTimerImagesVisible = false;
  pendingUpdate = null;
}
