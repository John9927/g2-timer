import { TimerState } from './constants';
import {
  StartUpPageCreateResult,
  CreateStartUpPageContainer,
  TextContainerProperty,
  TextContainerUpgrade,
  ImageRawDataUpdate,
  ImageContainerProperty,
} from '@evenrealities/even_hub_sdk';

export type UiDebugLogFn = (line: string) => void;

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
const SO_WIDTH = DIGIT_BASE_WIDTH * DIGIT_SCALE;
const MMS_WIDTH =
  (DIGIT_BASE_WIDTH + 1 + DIGIT_BASE_WIDTH + 1 + COLON_BASE_WIDTH + 1 + DIGIT_BASE_WIDTH) * DIGIT_SCALE;
const MINUTE_DIGIT_GAP = 1;
const MINUTE_COLON_GAP = 1;
const COLON_SECOND_TENS_GAP = 1;

const TIMER_GROUP_GAP = DIGIT_SCALE;
const TOTAL_TIMER_WIDTH = MMS_WIDTH + TIMER_GROUP_GAP + SO_WIDTH;
const TIMER_Y = Math.floor((DISPLAY_HEIGHT - DIGIT_HEIGHT) / 2);
const MMS_X = Math.floor((DISPLAY_WIDTH - TOTAL_TIMER_WIDTH) / 2);
const SO_X = MMS_X + MMS_WIDTH + TIMER_GROUP_GAP;

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
let uiDebugLog: UiDebugLogFn | null = null;

const imageCache = new Map<string, number[]>();

let canvas: HTMLCanvasElement | null = null;
let ctx: CanvasRenderingContext2D | null = null;

function debug(line: string): void {
  if (uiDebugLog) {
    uiDebugLog(`[UI] ${line}`);
  }
}

export function setUiDebugLogger(logger: UiDebugLogFn | null): void {
  uiDebugLog = logger;
  debug(`debug logger ${logger ? 'attached' : 'detached'}`);
}

function getContext(): CanvasRenderingContext2D | null {
  if (!canvas) {
    canvas = document.createElement('canvas');
    ctx = canvas.getContext('2d');
    debug(`canvas context created available=${Boolean(ctx)}`);
  }
  return ctx;
}

function startRenderSession(nextScreen: 'preset' | 'timer'): number {
  const previousScreen = currentScreenType;
  renderSessionId++;
  currentScreenType = nextScreen;
  pendingUpdate = null;
  debug(`startRenderSession #${renderSessionId} ${String(previousScreen)} -> ${nextScreen}`);
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
  if (!c || !canvas) {
    debug(`renderPng skipped no canvas context (${width}x${height})`);
    return [];
  }

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
  debug(`cache miss key=${key}`);
  const bytes = await renderPng(width, height, draw);
  if (bytes.length) imageCache.set(key, bytes);
  else debug(`cache fill empty key=${key}`);
  return bytes;
}

function getMmsBytes(minuteTens: string, minuteOnes: string, secondTens: string): Promise<number[]> {
  return cachedPng(`mms:${minuteTens}${minuteOnes}${secondTens}`, MMS_WIDTH, DIGIT_HEIGHT, c => {
    const mt = DIGIT_PATTERNS[minuteTens];
    const mo = DIGIT_PATTERNS[minuteOnes];
    const st = DIGIT_PATTERNS[secondTens];
    if (!mt || !mo || !st) return;

    drawPattern(c, mt, 0, 0, DIGIT_SCALE);
    drawPattern(c, mo, (DIGIT_BASE_WIDTH + MINUTE_DIGIT_GAP) * DIGIT_SCALE, 0, DIGIT_SCALE);
    drawPattern(
      c,
      COLON_PATTERN,
      (DIGIT_BASE_WIDTH + MINUTE_DIGIT_GAP + DIGIT_BASE_WIDTH + MINUTE_COLON_GAP) * DIGIT_SCALE,
      0,
      DIGIT_SCALE,
    );
    drawPattern(
      c,
      st,
      (DIGIT_BASE_WIDTH + MINUTE_DIGIT_GAP + DIGIT_BASE_WIDTH + MINUTE_COLON_GAP + COLON_BASE_WIDTH + COLON_SECOND_TENS_GAP) * DIGIT_SCALE,
      0,
      DIGIT_SCALE,
    );
  });
}

function getSoBytes(secondOnes: string): Promise<number[]> {
  return cachedPng(`so:${secondOnes}`, SO_WIDTH, DIGIT_HEIGHT, c => {
    const so = DIGIT_PATTERNS[secondOnes];
    if (!so) return;
    drawPattern(c, so, 0, 0, DIGIT_SCALE);
  });
}

function getBlankBytes(key: string, width: number, height: number): Promise<number[]> {
  return cachedPng(key, width, height, () => {});
}

function prefetchSecond(seconds: number): void {
  const time = formatTime(seconds);
  const mTens = time[0];
  const mOnes = time[1];
  const st = time[3];
  const so = time[4];
  debug(`prefetchSecond ${time}`);
  void getMmsBytes(mTens, mOnes, st);
  void getSoBytes(so);
}

async function warmBaseCache(): Promise<void> {
  if (cacheWarmPromise) {
    debug('warmBaseCache already in progress/completed');
    return cacheWarmPromise;
  }

  debug('warmBaseCache start');
  cacheWarmPromise = (async () => {
    for (let minute = 0; minute <= 60; minute++) {
      const mm = String(minute).padStart(2, '0');
      for (let st = 0; st <= 5; st++) {
        await getMmsBytes(mm[0], mm[1], String(st));
      }
    }
    await getBlankBytes('blank-mp', MMS_WIDTH, DIGIT_HEIGHT);
    await getBlankBytes('blank-mss', SO_WIDTH, DIGIT_HEIGHT);
    for (let secondOnes = 0; secondOnes <= 9; secondOnes++) {
      await getSoBytes(String(secondOnes));
    }
    debug('warmBaseCache completed');
  })().catch((error) => {
    debug(`warmBaseCache failed ${String(error)}`);
    console.warn('[UI] warmBaseCache failed:', error);
  });

  return cacheWarmPromise;
}

async function pushImage(bridge: any, id: number, name: string, data: number[]): Promise<void> {
  if (!data.length) {
    debug(`pushImage skipped empty id=${id} name=${name}`);
    return;
  }
  const startedAt = performance.now();
  await bridge.updateImageRawData(new ImageRawDataUpdate({ containerID: id, containerName: name, imageData: data }));
  debug(`pushImage ok id=${id} name=${name} bytes=${data.length} took=${(performance.now() - startedAt).toFixed(1)}ms`);
}

function pushText(bridge: any, content: string, force = false): void {
  if (!force && content === lastTextContent) {
    debug('pushText skipped unchanged');
    return;
  }
  const metrics = getTextMetrics(content);
  const startedAt = performance.now();
  bridge.textContainerUpgrade(new TextContainerUpgrade({
    containerID: TEXT_CONTAINER_ID, containerName: TEXT_CONTAINER_NAME,
    content, contentLength: metrics.contentLength, contentOffset: metrics.contentOffset,
  }));
  const firstLine = content.split('\n')[0] || '';
  debug(`pushText ${force ? 'force' : 'normal'} len=${metrics.contentLength} firstLine="${firstLine}" took=${(performance.now() - startedAt).toFixed(1)}ms`);
  lastTextContent = content;
}

async function applyTimerImages(bridge: any, seconds: number, forceAll: boolean): Promise<void> {
  const sessionId = renderSessionId;
  if (!isTimerSessionActive(sessionId)) {
    debug(`applyTimerImages skipped stale session=${sessionId}`);
    return;
  }

  const time = formatTime(seconds);
  const mTens = time[0];
  const mOnes = time[1];
  const st = time[3];
  const so = time[4];
  const prevMTens = lastDisplayedTime[0];
  const prevMOnes = lastDisplayedTime[1];
  const prevST = lastDisplayedTime[3];
  const prevSO = lastDisplayedTime[4];

  const needMms = forceAll || !areTimerImagesVisible || mTens !== prevMTens || mOnes !== prevMOnes || st !== prevST;
  const needSo = forceAll || !areTimerImagesVisible || so !== prevSO;
  if (!needMms && !needSo && !forceAll) {
    debug(`applyTimerImages skip no-diff time=${time}`);
    return;
  }
  debug(`applyTimerImages time=${time} needMms=${needMms} needSo=${needSo} force=${forceAll}`);

  if (needSo) {
    const soData = await getSoBytes(so);
    if (!isTimerSessionActive(sessionId)) {
      debug(`applyTimerImages stale before SO push session=${sessionId}`);
      return;
    }
    await pushImage(bridge, MSS_CONTAINER_ID, MSS_CONTAINER_NAME, soData);
  }
  if (needMms) {
    const mmsData = await getMmsBytes(mTens, mOnes, st);
    if (!isTimerSessionActive(sessionId)) {
      debug(`applyTimerImages stale before MMS push session=${sessionId}`);
      return;
    }
    await pushImage(bridge, MP_CONTAINER_ID, MP_CONTAINER_NAME, mmsData);
  }

  if (!isTimerSessionActive(sessionId)) {
    debug(`applyTimerImages stale after pushes session=${sessionId}`);
    return;
  }
  lastDisplayedTime = time;
  areTimerImagesVisible = true;
  debug(`applyTimerImages committed time=${time}`);

  if (seconds > 0 && isTimerSessionActive(sessionId)) {
    prefetchSecond(seconds - 1);
    if (seconds > 1) prefetchSecond(seconds - 2);
  }
}

export async function updateGlassesTimer(bridge: any, seconds: number, forceAll = false, sessionId = renderSessionId): Promise<void> {
  if (!isTimerSessionActive(sessionId)) {
    debug(`updateGlassesTimer skipped stale session=${sessionId} seconds=${seconds}`);
    return;
  }

  if (glassesUpdateInFlight) {
    const previousPending = pendingUpdate ? `${pendingUpdate.seconds}` : 'none';
    pendingUpdate = { bridge, seconds, forceAll: Boolean(pendingUpdate?.forceAll || forceAll), sessionId };
    debug(`updateGlassesTimer queued seconds=${seconds} force=${forceAll} prevPending=${previousPending}`);
    return;
  }

  glassesUpdateInFlight = true;
  const startedAt = performance.now();
  debug(`updateGlassesTimer start seconds=${seconds} force=${forceAll} session=${sessionId}`);
  try {
    if (!isTimerSessionActive(sessionId)) {
      debug(`updateGlassesTimer aborted stale before apply session=${sessionId}`);
      return;
    }
    await applyTimerImages(bridge, seconds, forceAll);
    if (pendingUpdate) {
      const queued = pendingUpdate;
      pendingUpdate = null;
      debug(`updateGlassesTimer flush queued seconds=${queued.seconds} force=${queued.forceAll} session=${queued.sessionId}`);

      if (isTimerSessionActive(queued.sessionId)) {
        const lastSec = timeStringToSeconds(lastDisplayedTime);
        if (queued.seconds <= lastSec || queued.forceAll) {
          debug(`updateGlassesTimer applying queued seconds=${queued.seconds} lastSec=${lastSec}`);
          await applyTimerImages(queued.bridge, queued.seconds, queued.forceAll);
        } else {
          debug(`updateGlassesTimer dropped queued seconds=${queued.seconds} lastSec=${lastSec}`);
        }
      } else {
        debug(`updateGlassesTimer dropped queued stale session=${queued.sessionId}`);
      }
    }
  } catch (error) {
    debug(`updateGlassesTimer error ${String(error)}`);
    console.error('[UI] updateGlassesTimer error:', error);
  } finally {
    glassesUpdateInFlight = false;
    debug(`updateGlassesTimer end took=${(performance.now() - startedAt).toFixed(1)}ms`);
  }
}

async function clearTimerImages(bridge: any, sessionId: number): Promise<void> {
  if (!isPresetSessionActive(sessionId)) {
    debug(`clearTimerImages skipped stale session=${sessionId}`);
    return;
  }

  debug(`clearTimerImages start session=${sessionId}`);

  try {
    const blankMp = await getBlankBytes('blank-mp', MMS_WIDTH, DIGIT_HEIGHT);
    const blankMss = await getBlankBytes('blank-mss', SO_WIDTH, DIGIT_HEIGHT);
    if (!isPresetSessionActive(sessionId)) {
      debug(`clearTimerImages stale after blank build session=${sessionId}`);
      return;
    }

    await pushImage(bridge, MP_CONTAINER_ID, MP_CONTAINER_NAME, blankMp);
    if (!isPresetSessionActive(sessionId)) {
      debug(`clearTimerImages stale after MP clear session=${sessionId}`);
      return;
    }

    await pushImage(bridge, MSS_CONTAINER_ID, MSS_CONTAINER_NAME, blankMss);
    if (!isPresetSessionActive(sessionId)) {
      debug(`clearTimerImages stale after MSS clear session=${sessionId}`);
      return;
    }

    lastDisplayedTime = '';
    areTimerImagesVisible = false;
    debug(`clearTimerImages complete session=${sessionId}`);
  } catch (error) {
    debug(`clearTimerImages error ${String(error)}`);
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
    debug('renderUI skipped no bridge');
    return;
  }
  try {
    if (debugMessage) {
      debug(`renderUI debugMessage="${debugMessage}"`);
      pushText(bridge, debugMessage, true);
      return;
    }

    if (state === TimerState.IDLE) {
      const switchedFromTimer = currentScreenType !== 'preset';
      const sessionId = switchedFromTimer ? startRenderSession('preset') : renderSessionId;
      debug(`renderUI preset state=IDLE selectedPreset=${selectedPreset} switchedFromTimer=${switchedFromTimer} session=${sessionId}`);

      pushText(bridge, buildPresetContent(selectedPreset));

      if (switchedFromTimer || areTimerImagesVisible) {
        void clearTimerImages(bridge, sessionId);

        // A second delayed clear avoids stale timer images when a previous push finishes late.
        if (switchedFromTimer) {
          setTimeout(() => {
            if (isPresetSessionActive(sessionId)) {
              debug(`renderUI delayed clear session=${sessionId}`);
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
      debug(`renderUI timer enter state=${state} remaining=${remainingSeconds}s session=${sessionId}`);
      await updateGlassesTimer(bridge, remainingSeconds, true, sessionId);
      return;
    }
    debug(`renderUI timer update state=${state} remaining=${remainingSeconds}s session=${sessionId}`);
    await updateGlassesTimer(bridge, remainingSeconds, false, sessionId);
  } catch (error) {
    debug(`renderUI error ${String(error)}`);
    console.error('[UI] renderUI error:', error);
  }
}

export async function createPageContainers(bridge: any, selectedPreset = 5): Promise<boolean> {
  if (!bridge) {
    debug('createPageContainers skipped no bridge');
    return false;
  }
  try {
    debug(`createPageContainers start preset=${selectedPreset}`);
    const presetContent = buildPresetContent(selectedPreset);
    const textContainer = new TextContainerProperty({
      containerID: TEXT_CONTAINER_ID, containerName: TEXT_CONTAINER_NAME,
      xPosition: 0, yPosition: 0, width: DISPLAY_WIDTH, height: DISPLAY_HEIGHT,
      borderWidth: 0, borderColor: 0, paddingLength: 20,
      content: presetContent, isEventCapture: 1,
    });
    const mpContainer = new ImageContainerProperty({
      containerID: MP_CONTAINER_ID, containerName: MP_CONTAINER_NAME,
      xPosition: MMS_X, yPosition: TIMER_Y, width: MMS_WIDTH, height: DIGIT_HEIGHT,
    });
    const mssContainer = new ImageContainerProperty({
      containerID: MSS_CONTAINER_ID, containerName: MSS_CONTAINER_NAME,
      xPosition: SO_X, yPosition: TIMER_Y, width: SO_WIDTH, height: DIGIT_HEIGHT,
    });

    const result = await bridge.createStartUpPageContainer(
      new CreateStartUpPageContainer({ containerTotalNum: 3, textObject: [textContainer], imageObject: [mpContainer, mssContainer] }),
    );

    if (StartUpPageCreateResult.normalize(result) !== StartUpPageCreateResult.success) {
      debug(`createPageContainers failed result=${String(result)}`);
      console.error('[UI] createStartUpPageContainer failed:', result);
      return false;
    }

    startRenderSession('preset');
    lastTextContent = presetContent;
    lastDisplayedTime = '';
    areTimerImagesVisible = false;

    void warmBaseCache();
    await clearTimerImages(bridge, renderSessionId);
    debug('createPageContainers success');
    return true;
  } catch (error) {
    debug(`createPageContainers error ${String(error)}`);
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
  debug('resetPreviousTexts');
}
