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
import {
  COMPACT_TIMER_HEIGHT,
  DIGIT_HEIGHT,
  DISPLAY_HEIGHT,
  DISPLAY_WIDTH,
  LARGE_DIGIT_STEP,
  SS_WIDTH,
  TIMER_SS_GAP,
  getCompactTimerLayout,
  getLargeMinuteDigitCount,
  getLargeMinuteGroupWidth,
  getLargeTimerLayout,
  normalizeLargeMinuteText,
} from './timerLayoutGeometry';

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
  runningActionPromptVisible: boolean;
}

type UiScreenMode = 'home' | 'preset' | 'settings' | 'timer-large' | 'timer-compact' | 'timer-action';
type PixelPattern = number[][];

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
const CACHE_WARM_MINUTES = 180;

const MINUTE_DIGIT_GAP = 1;
const SECOND_DIGIT_GAP = 1;

const DIGIT_PATTERNS: Record<string, PixelPattern> = {
  ' ': [[0, 0, 0, 0, 0], [0, 0, 0, 0, 0], [0, 0, 0, 0, 0], [0, 0, 0, 0, 0], [0, 0, 0, 0, 0], [0, 0, 0, 0, 0], [0, 0, 0, 0, 0]],
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
  if (!time.includes(':')) return Number.MAX_SAFE_INTEGER;
  const [minuteText, secondText] = time.split(':');
  const minutes = parseInt(minuteText, 10);
  const seconds = parseInt(secondText, 10);
  if (!Number.isFinite(minutes) || !Number.isFinite(seconds)) {
    return Number.MAX_SAFE_INTEGER;
  }
  return minutes * 60 + seconds;
}

function buildPresetRows(presetMinutes: number[], selectedPreset: number): string[] {
  const rows: string[] = [];
  const visiblePresets = presetMinutes.slice(0, 6);
  const columns = visiblePresets.some((preset) => preset >= 100) ? 3 : 4;

  for (let index = 0; index < visiblePresets.length; index += columns) {
    const row = visiblePresets
      .slice(index, index + columns)
      .map((preset) => (preset === selectedPreset ? `[${preset}]` : `${preset}`))
      .join('  ');

    rows.push(row);
  }

  return rows;
}

function buildPresetContent(selectedPreset: number, presetMinutes: number[]): string {
  const rows = buildPresetRows(presetMinutes, selectedPreset);

  return [
    'Timer',
    `${selectedPreset} min ready`,
    ...(rows.length ? rows : ['No shortcuts']),
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

function buildHomeContent(
  homeSelection: HomeSelection,
  selectedPreset: number,
  layoutSettings: TimerLayoutSettings,
  state: TimerState,
  remainingSeconds: number,
): string {
  const timerLabel = state === TimerState.RUNNING
    ? formatTime(remainingSeconds)
    : `${selectedPreset} min`;
  const primaryHint = state === TimerState.RUNNING ? 'Tap: next screen' : 'Tap: open';
  const secondaryHint = state === TimerState.RUNNING ? '2Tap: timer' : 'Swipe: choose';

  return [
    'G2 Timer',
    `${homeSelection === 'timer' ? '>' : ' '} Timer  ${timerLabel}`,
    `${homeSelection === 'settings' ? '>' : ' '} Layout`,
    `  ${formatLayoutSummary(layoutSettings)}`,
    primaryHint,
    secondaryHint,
  ].join('\n');
}

function buildTimerOverlayText(state: TimerState, blinkVisible: boolean): string {
  if (state === TimerState.DONE) {
    return blinkVisible ? '0:00' : ' ';
  }

  return ' ';
}

function buildCompactTimerContent(state: TimerState, remainingSeconds: number, blinkVisible: boolean): string {
  if (state === TimerState.DONE) {
    return blinkVisible ? '0:00' : ' ';
  }

  const time = formatTime(remainingSeconds);

  return time;
}

function buildRunningActionContent(state: TimerState, remainingSeconds: number): string {
  const actionLabel = state === TimerState.PAUSED ? 'resume' : 'pause';
  const title = state === TimerState.PAUSED ? 'Timer paused' : 'Timer running';
  return [
    title,
    formatTime(remainingSeconds),
    `Tap: ${actionLabel}`,
    '2Tap: stop',
  ].join('\n');
}

function buildSettingsContent(
  settingsField: TimerLayoutField,
  layoutSettings: TimerLayoutSettings,
  state: TimerState,
  remainingSeconds: number,
): string {
  return [
    'Layout',
    `${settingsField === 'format' ? '>' : ' '} Size ${formatTimerLayoutValue('format', layoutSettings)}`,
    `${settingsField === 'vertical' ? '>' : ' '} Vert ${formatTimerLayoutValue('vertical', layoutSettings)}`,
    `${settingsField === 'horizontal' ? '>' : ' '} Horz ${formatTimerLayoutValue('horizontal', layoutSettings)}`,
    `${settingsField === 'doneBlinkCount' ? '>' : ' '} Blink ${formatTimerLayoutValue('doneBlinkCount', layoutSettings)}`,
    'Tap: change',
    'Swipe: next field',
    `2Tap: ${state === TimerState.RUNNING ? 'timer' : 'menu'}`,
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

function getMinuteGroupBytes(minutes: string): Promise<number[]> {
  const minuteDigits = normalizeLargeMinuteText(minutes).split('');
  const minuteGroupWidth = getLargeMinuteGroupWidth(minutes);

  return cachedPng(`mm:${minuteDigits.join('')}`, minuteGroupWidth, DIGIT_HEIGHT, (c) => {
    minuteDigits.forEach((digit, index) => {
      const pattern = DIGIT_PATTERNS[digit];
      if (!pattern) return;
      drawPattern(c, pattern, index * LARGE_DIGIT_STEP, 0, DIGIT_SCALE);
    });

    drawPattern(
      c,
      COLON_PATTERN,
      minuteGroupWidth - COLON_BASE_WIDTH * DIGIT_SCALE,
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
  const [minuteGroup, secondPair = '00'] = time.split(':');
  debug(`prefetchSecond ${time}`);
  void getMinuteGroupBytes(minuteGroup);
  void getSsBytes(secondPair);
}

async function warmBaseCache(): Promise<void> {
  if (cacheWarmPromise) {
    debug('warmBaseCache already in progress/completed');
    return cacheWarmPromise;
  }

  debug('warmBaseCache start');
  cacheWarmPromise = (async () => {
    for (let minute = 0; minute <= CACHE_WARM_MINUTES; minute += 1) {
      await getMinuteGroupBytes(String(minute));
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

function buildDisplayContainer(
  screen: UiScreenMode,
  layoutSettings: TimerLayoutSettings,
  content: string,
): TextContainerProperty {
  if (screen === 'timer-compact') {
    const compactLayout = getCompactTimerLayout(layoutSettings, content);

    return new TextContainerProperty({
      containerID: DISPLAY_CONTAINER_ID,
      containerName: DISPLAY_CONTAINER_NAME,
      xPosition: compactLayout.x,
      yPosition: compactLayout.y,
      width: compactLayout.width,
      height: compactLayout.height,
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

function buildLargeImageContainers(layoutSettings: TimerLayoutSettings, remainingSeconds: number): ImageContainerProperty[] {
  const [minutesText = '00'] = formatTime(remainingSeconds).split(':');
  const layout = getLargeTimerLayout(layoutSettings, minutesText);

  return [
    new ImageContainerProperty({
      containerID: MP_CONTAINER_ID,
      containerName: MP_CONTAINER_NAME,
      xPosition: layout.x,
      yPosition: layout.y,
      width: layout.minuteGroupWidth,
      height: DIGIT_HEIGHT,
    }),
    new ImageContainerProperty({
      containerID: MSS_CONTAINER_ID,
      containerName: MSS_CONTAINER_NAME,
      xPosition: layout.x + layout.minuteGroupWidth + TIMER_SS_GAP,
      yPosition: layout.y,
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
  if (navigation.panel === 'home') return 'home';
  if (navigation.panel === 'settings') return 'settings';
  if ((state === TimerState.RUNNING || state === TimerState.PAUSED) && navigation.runningActionPromptVisible) return 'timer-action';
  if (state === TimerState.IDLE) return 'preset';
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
    return buildHomeContent(navigation.homeSelection, selectedPreset, layoutSettings, state, remainingSeconds);
  }

  if (screen === 'preset') {
    return buildPresetContent(selectedPreset, presetMinutes);
  }

  if (screen === 'settings') {
    return buildSettingsContent(navigation.settingsField, layoutSettings, state, remainingSeconds);
  }

  if (screen === 'timer-action') {
    return buildRunningActionContent(state, remainingSeconds);
  }

  if (screen === 'timer-compact') {
    return buildCompactTimerContent(state, remainingSeconds, blinkVisible);
  }

  return buildTimerOverlayText(state, blinkVisible);
}

function buildLayoutSignature(screen: UiScreenMode, layoutSettings: TimerLayoutSettings, remainingSeconds: number): string {
  if (screen === 'timer-large' || screen === 'timer-compact') {
    const largeDigitCount = screen === 'timer-large'
      ? getLargeMinuteDigitCount(formatTime(remainingSeconds).split(':')[0] || '00')
      : 0;
    return `${screen}:${layoutSettings.format}:${layoutSettings.vertical}:${layoutSettings.horizontal}:${largeDigitCount}`;
  }

  return screen;
}

function buildContainerPayload(
  screen: UiScreenMode,
  layoutSettings: TimerLayoutSettings,
  initialContent: string,
  remainingSeconds: number,
) {
  const textObject = [
    buildDisplayContainer(screen, layoutSettings, initialContent),
  ];

  const imageObject = screen === 'timer-large' ? buildLargeImageContainers(layoutSettings, remainingSeconds) : undefined;

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
  remainingSeconds: number,
): Promise<boolean> {
  const nextSignature = buildLayoutSignature(screen, layoutSettings, remainingSeconds);
  if (currentLayoutSignature === nextSignature) {
    return true;
  }

  const payload = buildContainerPayload(screen, layoutSettings, initialContent, remainingSeconds);

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
  const [minuteGroup, secondPair = '00'] = time.split(':');
  const [prevMinuteGroup = '', prevSecondPair = ''] = lastDisplayedTime.split(':');

  const needMm = forceAll || !areTimerImagesVisible || minuteGroup !== prevMinuteGroup;
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
    const mmData = await getMinuteGroupBytes(minuteGroup);
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
    runningActionPromptVisible: false,
  };
  const presetMinutes = options.presetMinutes ?? [];

  try {
    if (options.debugMessage) {
      const fallbackScreen: UiScreenMode = 'preset';
      const ok = await ensurePageLayout(bridge, fallbackScreen, layoutSettings, options.debugMessage, remainingSeconds);
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
    const ok = await ensurePageLayout(bridge, screen, layoutSettings, displayContent, remainingSeconds);
    if (!ok) return;
    const sessionId = switchedScreen ? startRenderSession(screen) : renderSessionId;

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
  remainingSeconds = selectedPreset * 60,
  layoutSettings: TimerLayoutSettings = DEFAULT_TIMER_LAYOUT_SETTINGS,
  presetMinutes: number[] = [],
  navigation: GlassesNavigationState = {
    panel: 'home',
    homeSelection: 'timer',
    settingsField: 'format',
    runningActionPromptVisible: false,
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
    remainingSeconds,
    true,
    navigation,
    layoutSettings,
  );
  const ok = await ensurePageLayout(bridge, screen, layoutSettings, content, remainingSeconds);
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
