import { TimerState } from './constants';
import {
  StartUpPageCreateResult,
  CreateStartUpPageContainer,
  TextContainerProperty,
  TextContainerUpgrade,
  ImageRawDataUpdate,
  ImageContainerProperty,
} from '@evenrealities/even_hub_sdk';
import {
  DEFAULT_TIMER_LAYOUT_SETTINGS,
  formatTimerLayoutValue,
  type TimerLayoutField,
  type TimerLayoutSettings,
} from './layoutSettings';

export type UiDebugLogFn = (line: string) => void;

interface RenderUiOptions {
  debugMessage?: string;
  layoutSettings?: TimerLayoutSettings;
  navigation?: GlassesNavigationState;
  presetMinutes?: number[];
}

export type GlassesPanel = 'home' | 'timer' | 'settings';
export type HomeSelection = 'timer' | 'settings';

export interface GlassesNavigationState {
  panel: GlassesPanel;
  homeSelection: HomeSelection;
  settingsField: TimerLayoutField;
}

type UiScreenMode = 'home' | 'preset' | 'settings' | 'timer-large' | 'timer-compact';
type PixelPattern = number[][];

const DISPLAY_WIDTH = 576;
const DISPLAY_HEIGHT = 288;

const DISPLAY_CONTAINER_ID = 1;
const MP_CONTAINER_ID = 2;
const MSS_CONTAINER_ID = 3;

const DISPLAY_CONTAINER_NAME = 'display';
const MP_CONTAINER_NAME = 'timer-mm';
const MSS_CONTAINER_NAME = 'timer-ss';

const DIGIT_SCALE = 10;
const DIGIT_BASE_WIDTH = 5;
const DIGIT_BASE_HEIGHT = 7;
const COLON_BASE_WIDTH = 3;

const DIGIT_HEIGHT = DIGIT_BASE_HEIGHT * DIGIT_SCALE;
const MM_WIDTH = (DIGIT_BASE_WIDTH + 1 + DIGIT_BASE_WIDTH + 1 + COLON_BASE_WIDTH) * DIGIT_SCALE;
const SS_WIDTH = (DIGIT_BASE_WIDTH + 1 + DIGIT_BASE_WIDTH) * DIGIT_SCALE;
const MINUTE_DIGIT_GAP = 1;
const MINUTE_COLON_GAP = 1;
const SECOND_DIGIT_GAP = 1;

const TIMER_GROUP_GAP = 10;
const TOTAL_TIMER_WIDTH = MM_WIDTH + TIMER_GROUP_GAP + SS_WIDTH;

const LARGE_TIMER_MARGIN_X = 24;
const LARGE_TIMER_MARGIN_Y = 28;
const COMPACT_TIMER_MARGIN_X = 24;
const COMPACT_TIMER_MARGIN_Y = 32;
const COMPACT_TIMER_WIDTH = 300;
const COMPACT_TIMER_HEIGHT = 112;
const COMPACT_TIMER_CENTER_BIAS_X = 52;

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

let currentScreenMode: UiScreenMode | null = null;
let lastDisplayedTime = '';
let lastTextContent = '';
let areTimerImagesVisible = false;
let glassesUpdateInFlight = false;
let pendingUpdate: { bridge: any; seconds: number; forceAll: boolean; sessionId: number } | null = null;
let cacheWarmPromise: Promise<void> | null = null;
let renderSessionId = 0;
let uiDebugLog: UiDebugLogFn | null = null;
let startupCreated = false;
let currentLayoutSignature = '';

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

function startRenderSession(nextScreen: UiScreenMode): number {
  const previousScreen = currentScreenMode;
  renderSessionId += 1;
  currentScreenMode = nextScreen;
  pendingUpdate = null;
  debug(`startRenderSession #${renderSessionId} ${String(previousScreen)} -> ${nextScreen}`);
  return renderSessionId;
}

function isLargeTimerSessionActive(sessionId: number): boolean {
  return currentScreenMode === 'timer-large' && sessionId === renderSessionId;
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

function buildPresetRows(presetMinutes: number[], selectedPreset: number): string[] {
  const rows: string[] = [];
  const visiblePresets = presetMinutes.slice(0, 8);

  for (let index = 0; index < visiblePresets.length; index += 4) {
    const row = visiblePresets
      .slice(index, index + 4)
      .map((preset) => (preset === selectedPreset ? `[${preset}]` : `${preset}`))
      .join('  ');

    rows.push(row);
  }

  return rows;
}

function buildPresetContent(selectedPreset: number, presetMinutes: number[]): string {
  const minutes = String(Math.min(99, Math.max(0, selectedPreset))).padStart(2, '0');
  const rows = buildPresetRows(presetMinutes, selectedPreset);

  return [
    'G2 Timer',
    '',
    `Minutes: ${minutes}`,
    ...(rows.length ? rows : ['No shortcuts']),
    '',
    'Swipe: shortcuts',
    'Tap: start',
    '2Tap: menu',
  ].join('\n');
}

function formatLayoutSummary(settings: TimerLayoutSettings): string {
  const size = formatTimerLayoutValue('format', settings);
  const vertical = formatTimerLayoutValue('vertical', settings);
  const horizontal = formatTimerLayoutValue('horizontal', settings);
  return `${size} / ${vertical} / ${horizontal}`;
}

function buildHomeContent(homeSelection: HomeSelection, selectedPreset: number, layoutSettings: TimerLayoutSettings): string {
  const minutes = String(Math.min(99, Math.max(0, selectedPreset))).padStart(2, '0');

  return [
    'G2 Timer',
    '',
    `${homeSelection === 'timer' ? '>' : ' '} Timer`,
    `  ${minutes} min ready`,
    `${homeSelection === 'settings' ? '>' : ' '} Layout settings`,
    `  ${formatLayoutSummary(layoutSettings)}`,
    '',
    'Swipe: choose',
    'Tap: open',
  ].join('\n');
}

function buildTimerOverlayText(state: TimerState, blinkVisible: boolean): string {
  return ' ';
}

function buildCompactTimerContent(state: TimerState, remainingSeconds: number, blinkVisible: boolean): string {
  const time = formatTime(remainingSeconds);

  if (state === TimerState.DONE && !blinkVisible) {
    return ' ';
  }

  return time;
}

function buildSettingsContent(
  settingsField: TimerLayoutField,
  layoutSettings: TimerLayoutSettings,
  state: TimerState,
  remainingSeconds: number,
): string {
  const preview = formatTime(remainingSeconds);
  const stateLabel = state === TimerState.IDLE ? 'IDLE' : state;

  return [
    'Layout Settings',
    '',
    `${settingsField === 'format' ? '>' : ' '} Size: ${formatTimerLayoutValue('format', layoutSettings)}`,
    `${settingsField === 'vertical' ? '>' : ' '} Vertical: ${formatTimerLayoutValue('vertical', layoutSettings)}`,
    `${settingsField === 'horizontal' ? '>' : ' '} Horizontal: ${formatTimerLayoutValue('horizontal', layoutSettings)}`,
    `Preview: ${preview}`,
    `State: ${stateLabel}`,
    '',
    'Tap: next field',
    'Swipe: change',
    '2Tap: menu',
  ].join('\n');
}

function drawPattern(c: CanvasRenderingContext2D, pattern: PixelPattern, x: number, y: number, scale: number) {
  for (let py = 0; py < pattern.length; py += 1) {
    for (let px = 0; px < pattern[py].length; px += 1) {
      if (pattern[py][px]) {
        c.fillRect(x + px * scale, y + py * scale, scale, scale);
      }
    }
  }
}

async function renderPng(width: number, height: number, draw: (c: CanvasRenderingContext2D) => void): Promise<number[]> {
  const context = getContext();
  if (!context || !canvas) {
    debug(`renderPng skipped no canvas context (${width}x${height})`);
    return [];
  }

  canvas.width = width;
  canvas.height = height;
  context.fillStyle = '#000';
  context.fillRect(0, 0, width, height);
  context.fillStyle = '#FFF';
  draw(context);

  try {
    const blob: Blob = await new Promise((resolve, reject) =>
      canvas!.toBlob((candidate) => (candidate ? resolve(candidate) : reject(new Error('toBlob'))), 'image/png'));
    return Array.from(new Uint8Array(await blob.arrayBuffer()));
  } catch {
    return [];
  }
}

async function cachedPng(
  key: string,
  width: number,
  height: number,
  draw: (c: CanvasRenderingContext2D) => void,
): Promise<number[]> {
  const cached = imageCache.get(key);
  if (cached) return cached;
  debug(`cache miss key=${key}`);
  const bytes = await renderPng(width, height, draw);
  if (bytes.length) imageCache.set(key, bytes);
  else debug(`cache fill empty key=${key}`);
  return bytes;
}

function getMmBytes(minuteTens: string, minuteOnes: string): Promise<number[]> {
  return cachedPng(`mm:${minuteTens}${minuteOnes}`, MM_WIDTH, DIGIT_HEIGHT, (c) => {
    const minuteTensPattern = DIGIT_PATTERNS[minuteTens];
    const minuteOnesPattern = DIGIT_PATTERNS[minuteOnes];
    if (!minuteTensPattern || !minuteOnesPattern) return;

    drawPattern(c, minuteTensPattern, 0, 0, DIGIT_SCALE);
    drawPattern(c, minuteOnesPattern, (DIGIT_BASE_WIDTH + MINUTE_DIGIT_GAP) * DIGIT_SCALE, 0, DIGIT_SCALE);
    drawPattern(
      c,
      COLON_PATTERN,
      (DIGIT_BASE_WIDTH + MINUTE_DIGIT_GAP + DIGIT_BASE_WIDTH + MINUTE_COLON_GAP) * DIGIT_SCALE,
      0,
      DIGIT_SCALE,
    );
  });
}

function getSsBytes(seconds: string): Promise<number[]> {
  return cachedPng(`ss:${seconds}`, SS_WIDTH, DIGIT_HEIGHT, (c) => {
    const secondTensPattern = DIGIT_PATTERNS[seconds[0]];
    const secondOnesPattern = DIGIT_PATTERNS[seconds[1]];
    if (!secondTensPattern || !secondOnesPattern) return;

    drawPattern(c, secondTensPattern, 0, 0, DIGIT_SCALE);
    drawPattern(c, secondOnesPattern, (DIGIT_BASE_WIDTH + SECOND_DIGIT_GAP) * DIGIT_SCALE, 0, DIGIT_SCALE);
  });
}

function prefetchSecond(seconds: number): void {
  const time = formatTime(seconds);
  const minuteTens = time[0];
  const minuteOnes = time[1];
  const secondPair = time.slice(3, 5);
  debug(`prefetchSecond ${time}`);
  void getMmBytes(minuteTens, minuteOnes);
  void getSsBytes(secondPair);
}

async function warmBaseCache(): Promise<void> {
  if (cacheWarmPromise) {
    debug('warmBaseCache already in progress/completed');
    return cacheWarmPromise;
  }

  debug('warmBaseCache start');
  cacheWarmPromise = (async () => {
    for (let minute = 0; minute <= 60; minute += 1) {
      const mm = String(minute).padStart(2, '0');
      await getMmBytes(mm[0], mm[1]);
    }
    for (let second = 0; second < 60; second += 1) {
      const ss = String(second).padStart(2, '0');
      await getSsBytes(ss);
    }
    debug('warmBaseCache completed');
  })().catch((error) => {
    debug(`warmBaseCache failed ${String(error)}`);
    console.warn('[UI] warmBaseCache failed:', error);
  });

  return cacheWarmPromise;
}

function alignHorizontal(horizontal: TimerLayoutSettings['horizontal'], width: number, margin: number): number {
  if (horizontal === 'left') return margin;
  if (horizontal === 'right') return DISPLAY_WIDTH - width - margin;
  return Math.floor((DISPLAY_WIDTH - width) / 2);
}

function alignVertical(vertical: TimerLayoutSettings['vertical'], height: number, margin: number): number {
  if (vertical === 'top') return margin;
  if (vertical === 'bottom') return DISPLAY_HEIGHT - height - margin;
  return Math.floor((DISPLAY_HEIGHT - height) / 2);
}

function alignCompactHorizontal(horizontal: TimerLayoutSettings['horizontal']): number {
  const base = alignHorizontal(horizontal, COMPACT_TIMER_WIDTH, COMPACT_TIMER_MARGIN_X);

  if (horizontal !== 'center') {
    return base;
  }

  const maxX = DISPLAY_WIDTH - COMPACT_TIMER_WIDTH - COMPACT_TIMER_MARGIN_X;
  return Math.min(maxX, base + COMPACT_TIMER_CENTER_BIAS_X);
}

function buildDisplayContainer(
  screen: UiScreenMode,
  layoutSettings: TimerLayoutSettings,
  content: string,
): TextContainerProperty {
  if (screen === 'timer-compact') {
    return new TextContainerProperty({
      containerID: DISPLAY_CONTAINER_ID,
      containerName: DISPLAY_CONTAINER_NAME,
      xPosition: alignCompactHorizontal(layoutSettings.horizontal),
      yPosition: alignVertical(layoutSettings.vertical, COMPACT_TIMER_HEIGHT, COMPACT_TIMER_MARGIN_Y),
      width: COMPACT_TIMER_WIDTH,
      height: COMPACT_TIMER_HEIGHT,
      borderWidth: 0,
      borderColor: 0,
      paddingLength: 8,
      content,
      isEventCapture: 1,
    });
  }

  return new TextContainerProperty({
    containerID: DISPLAY_CONTAINER_ID,
    containerName: DISPLAY_CONTAINER_NAME,
    xPosition: 0,
    yPosition: 0,
    width: DISPLAY_WIDTH,
    height: DISPLAY_HEIGHT,
    borderWidth: 0,
    borderColor: 0,
    paddingLength: 20,
    content,
    isEventCapture: 1,
  });
}

function buildLargeImageContainers(layoutSettings: TimerLayoutSettings): ImageContainerProperty[] {
  const x = alignHorizontal(layoutSettings.horizontal, TOTAL_TIMER_WIDTH, LARGE_TIMER_MARGIN_X);
  const y = alignVertical(layoutSettings.vertical, DIGIT_HEIGHT, LARGE_TIMER_MARGIN_Y);

  return [
    new ImageContainerProperty({
      containerID: MP_CONTAINER_ID,
      containerName: MP_CONTAINER_NAME,
      xPosition: x,
      yPosition: y,
      width: MM_WIDTH,
      height: DIGIT_HEIGHT,
    }),
    new ImageContainerProperty({
      containerID: MSS_CONTAINER_ID,
      containerName: MSS_CONTAINER_NAME,
      xPosition: x + MM_WIDTH + TIMER_GROUP_GAP,
      yPosition: y,
      width: SS_WIDTH,
      height: DIGIT_HEIGHT,
    }),
  ];
}

function desiredScreenMode(
  state: TimerState,
  navigation: GlassesNavigationState,
  layoutSettings: TimerLayoutSettings,
): UiScreenMode {
  if (state === TimerState.IDLE) {
    if (navigation.panel === 'home') return 'home';
    if (navigation.panel === 'settings') return 'settings';
    return 'preset';
  }
  return layoutSettings.format === 'large' ? 'timer-large' : 'timer-compact';
}

function buildInitialDisplayContent(
  screen: UiScreenMode,
  state: TimerState,
  selectedPreset: number,
  presetMinutes: number[],
  remainingSeconds: number,
  blinkVisible: boolean,
  navigation: GlassesNavigationState,
  layoutSettings: TimerLayoutSettings,
): string {
  if (screen === 'home') {
    return buildHomeContent(navigation.homeSelection, selectedPreset, layoutSettings);
  }

  if (screen === 'preset') {
    return buildPresetContent(selectedPreset, presetMinutes);
  }

  if (screen === 'settings') {
    return buildSettingsContent(navigation.settingsField, layoutSettings, state, remainingSeconds);
  }

  if (screen === 'timer-compact') {
    return buildCompactTimerContent(state, remainingSeconds, blinkVisible);
  }

  return buildTimerOverlayText(state, blinkVisible);
}

function buildLayoutSignature(screen: UiScreenMode, layoutSettings: TimerLayoutSettings): string {
  if (screen === 'timer-large' || screen === 'timer-compact') {
    return `${screen}:${layoutSettings.format}:${layoutSettings.vertical}:${layoutSettings.horizontal}`;
  }

  return screen;
}

function buildContainerPayload(
  screen: UiScreenMode,
  layoutSettings: TimerLayoutSettings,
  initialContent: string,
) {
  const textObject = [
    buildDisplayContainer(screen, layoutSettings, initialContent),
  ];

  const imageObject = screen === 'timer-large' ? buildLargeImageContainers(layoutSettings) : undefined;

  return {
    containerTotalNum: textObject.length + (imageObject?.length || 0),
    textObject,
    ...(imageObject ? { imageObject } : {}),
  };
}

async function ensurePageLayout(
  bridge: any,
  screen: UiScreenMode,
  layoutSettings: TimerLayoutSettings,
  initialContent: string,
): Promise<boolean> {
  const nextSignature = buildLayoutSignature(screen, layoutSettings);
  if (currentLayoutSignature === nextSignature) {
    return true;
  }

  const payload = buildContainerPayload(screen, layoutSettings, initialContent);

  try {
    if (!startupCreated) {
      const result = await bridge.createStartUpPageContainer(new CreateStartUpPageContainer(payload));
      if (StartUpPageCreateResult.normalize(result) !== StartUpPageCreateResult.success) {
        debug(`createStartUpPageContainer failed result=${String(result)}`);
        console.error('[UI] createStartUpPageContainer failed:', result);
        return false;
      }
      startupCreated = true;
      debug(`startup layout created signature=${nextSignature}`);
    } else {
      const rebuilt = await bridge.rebuildPageContainer(payload);
      if (!rebuilt) {
        debug(`rebuildPageContainer failed signature=${nextSignature}`);
        console.error('[UI] rebuildPageContainer failed');
        return false;
      }
      debug(`layout rebuilt signature=${nextSignature}`);
    }

    currentLayoutSignature = nextSignature;
    lastTextContent = '';
    lastDisplayedTime = '';
    areTimerImagesVisible = false;
    pendingUpdate = null;

    if (screen === 'timer-large') {
      void warmBaseCache();
    }

    return true;
  } catch (error) {
    debug(`ensurePageLayout error ${String(error)}`);
    console.error('[UI] ensurePageLayout error:', error);
    return false;
  }
}

async function pushImage(bridge: any, id: number, name: string, data: number[]): Promise<void> {
  if (!data.length) {
    debug(`pushImage skipped empty id=${id} name=${name}`);
    return;
  }
  const startedAt = performance.now();
  await bridge.updateImageRawData(new ImageRawDataUpdate({
    containerID: id,
    containerName: name,
    imageData: data,
  }));
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
    containerID: DISPLAY_CONTAINER_ID,
    containerName: DISPLAY_CONTAINER_NAME,
    content,
    contentLength: metrics.contentLength,
    contentOffset: metrics.contentOffset,
  }));
  const firstLine = content.split('\n')[0] || '';
  debug(`pushText ${force ? 'force' : 'normal'} len=${metrics.contentLength} firstLine="${firstLine}" took=${(performance.now() - startedAt).toFixed(1)}ms`);
  lastTextContent = content;
}

async function applyTimerImages(bridge: any, seconds: number, forceAll: boolean): Promise<void> {
  const sessionId = renderSessionId;
  if (!isLargeTimerSessionActive(sessionId)) {
    debug(`applyTimerImages skipped stale session=${sessionId}`);
    return;
  }

  const time = formatTime(seconds);
  const minuteTens = time[0];
  const minuteOnes = time[1];
  const secondPair = time.slice(3, 5);
  const prevMinuteTens = lastDisplayedTime[0];
  const prevMinuteOnes = lastDisplayedTime[1];
  const prevSecondPair = lastDisplayedTime.slice(3, 5);

  const needMm = forceAll || !areTimerImagesVisible || minuteTens !== prevMinuteTens || minuteOnes !== prevMinuteOnes;
  const needSs = forceAll || !areTimerImagesVisible || secondPair !== prevSecondPair;
  if (!needMm && !needSs && !forceAll) {
    debug(`applyTimerImages skip no-diff time=${time}`);
    return;
  }

  debug(`applyTimerImages time=${time} needMm=${needMm} needSs=${needSs} force=${forceAll}`);

  if (needSs) {
    const ssData = await getSsBytes(secondPair);
    if (!isLargeTimerSessionActive(sessionId)) {
      debug(`applyTimerImages stale before SS push session=${sessionId}`);
      return;
    }
    await pushImage(bridge, MSS_CONTAINER_ID, MSS_CONTAINER_NAME, ssData);
  }

  if (needMm) {
    const mmData = await getMmBytes(minuteTens, minuteOnes);
    if (!isLargeTimerSessionActive(sessionId)) {
      debug(`applyTimerImages stale before MM push session=${sessionId}`);
      return;
    }
    await pushImage(bridge, MP_CONTAINER_ID, MP_CONTAINER_NAME, mmData);
  }

  if (!isLargeTimerSessionActive(sessionId)) {
    debug(`applyTimerImages stale after pushes session=${sessionId}`);
    return;
  }

  lastDisplayedTime = time;
  areTimerImagesVisible = true;
  debug(`applyTimerImages committed time=${time}`);

  if (seconds > 0 && isLargeTimerSessionActive(sessionId)) {
    prefetchSecond(seconds - 1);
    if (seconds > 1) prefetchSecond(seconds - 2);
  }
}

export async function updateGlassesTimer(
  bridge: any,
  seconds: number,
  forceAll = false,
  sessionId = renderSessionId,
): Promise<void> {
  if (!isLargeTimerSessionActive(sessionId)) {
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
    if (!isLargeTimerSessionActive(sessionId)) {
      debug(`updateGlassesTimer aborted stale before apply session=${sessionId}`);
      return;
    }
    await applyTimerImages(bridge, seconds, forceAll);
    if (pendingUpdate) {
      const queued = pendingUpdate;
      pendingUpdate = null;
      debug(`updateGlassesTimer flush queued seconds=${queued.seconds} force=${queued.forceAll} session=${queued.sessionId}`);

      if (isLargeTimerSessionActive(queued.sessionId)) {
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

export async function renderUI(
  bridge: any,
  state: TimerState,
  selectedPreset: number,
  remainingSeconds: number,
  blinkVisible = true,
  options: RenderUiOptions = {},
): Promise<void> {
  if (!bridge) {
    debug('renderUI skipped no bridge');
    return;
  }

  const layoutSettings = options.layoutSettings ?? DEFAULT_TIMER_LAYOUT_SETTINGS;
  const navigation = options.navigation ?? {
    panel: 'home',
    homeSelection: 'timer',
    settingsField: 'format',
  };
  const presetMinutes = options.presetMinutes ?? [];

  try {
    if (options.debugMessage) {
      const fallbackScreen: UiScreenMode = 'preset';
      const ok = await ensurePageLayout(bridge, fallbackScreen, layoutSettings, options.debugMessage);
      if (!ok) return;
      startRenderSession(fallbackScreen);
      pushText(bridge, options.debugMessage, true);
      return;
    }

      const screen = desiredScreenMode(state, navigation, layoutSettings);
      const displayContent = buildInitialDisplayContent(
        screen,
        state,
        selectedPreset,
        presetMinutes,
        remainingSeconds,
        blinkVisible,
        navigation,
        layoutSettings,
      );
    const switchedScreen = currentScreenMode !== screen;
    const sessionId = switchedScreen ? startRenderSession(screen) : renderSessionId;
    const ok = await ensurePageLayout(bridge, screen, layoutSettings, displayContent);
    if (!ok) return;

    pushText(bridge, displayContent, switchedScreen);

    if (screen !== 'timer-large') {
      lastDisplayedTime = '';
      areTimerImagesVisible = false;
      return;
    }

    debug(`renderUI timer-large state=${state} remaining=${remainingSeconds}s session=${sessionId}`);
    await updateGlassesTimer(bridge, remainingSeconds, switchedScreen, sessionId);
  } catch (error) {
    debug(`renderUI error ${String(error)}`);
    console.error('[UI] renderUI error:', error);
  }
}

export async function createPageContainers(
  bridge: any,
  state: TimerState,
  selectedPreset = 5,
  layoutSettings: TimerLayoutSettings = DEFAULT_TIMER_LAYOUT_SETTINGS,
  presetMinutes: number[] = [],
  navigation: GlassesNavigationState = {
    panel: 'home',
    homeSelection: 'timer',
    settingsField: 'format',
  },
): Promise<boolean> {
  if (!bridge) {
    debug('createPageContainers skipped no bridge');
    return false;
  }

  const screen = desiredScreenMode(state, navigation, layoutSettings);
  const content = buildInitialDisplayContent(
    screen,
    state,
    selectedPreset,
    presetMinutes,
    selectedPreset * 60,
    true,
    navigation,
    layoutSettings,
  );
  const ok = await ensurePageLayout(bridge, screen, layoutSettings, content);
  if (!ok) {
    return false;
  }

  startRenderSession(screen);
  lastTextContent = '';
  debug('createPageContainers success');
  return true;
}

export function resetPreviousTexts(): void {
  renderSessionId += 1;
  currentScreenMode = null;
  lastDisplayedTime = '';
  lastTextContent = '';
  areTimerImagesVisible = false;
  pendingUpdate = null;
  startupCreated = false;
  currentLayoutSignature = '';
  debug('resetPreviousTexts');
}
