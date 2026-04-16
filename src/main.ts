import { EventSourceType, OsEventTypeList, waitForEvenAppBridge } from '@evenrealities/even_hub_sdk';
import { TimerStateManager } from './timerState';
import {
  createPageContainers,
  renderUI,
  formatTime,
  resetPreviousTexts,
  setUiDebugLogger,
  type GlassesNavigationState,
  type GlassesPanel,
  type HomeSelection,
} from './ui';
import { TimerState } from './constants';
import {
  DEFAULT_TIMER_LAYOUT_SETTINGS,
  adjustTimerLayoutSetting,
  formatTimerLayoutValue,
  loadTimerLayoutSettings,
  nextTimerLayoutField,
  previousTimerLayoutField,
  saveTimerLayoutSettings,
  type TimerLayoutField,
  type TimerLayoutSettings,
} from './layoutSettings';
import {
  DEFAULT_TIMER_PRESET_SETTINGS,
  loadTimerPresetSettings,
  parseCustomPresetInput,
  saveTimerPresetSettings,
  type TimerPresetSettings,
} from './presetSettings';
import { loadTimerRuntimeSnapshot, saveTimerRuntimeSnapshot } from './timerStorage';
import { getPreviewAnchor } from './timerLayoutGeometry';

const REMOTE_START_DELAY_MS = 3000;
const REMOTE_START_COUNTDOWN_INTERVAL_MS = 1000;

let bridge: any = null;
let timerState: TimerStateManager | null = null;
let isInitialized = false;
let isInForeground = true;
let isPageVisible = typeof document === 'undefined' ? true : !document.hidden;

let remoteStartTimeoutId: ReturnType<typeof setTimeout> | null = null;
let remoteStartCountdownIntervalId: ReturnType<typeof setInterval> | null = null;
let remoteStartScheduledAt: number | null = null;
let committedLayoutSettings: TimerLayoutSettings = DEFAULT_TIMER_LAYOUT_SETTINGS;
let committedPresetSettings: TimerPresetSettings = DEFAULT_TIMER_PRESET_SETTINGS;
let glassesPanel: GlassesPanel = 'home';
let homeSelection: HomeSelection = 'timer';
let settingsField: TimerLayoutField = 'format';
let runningActionPromptVisible = false;

type RenderReason = 'tick' | 'state' | 'foreground' | 'manual';
type InteractionSource = 'ring' | 'glasses' | 'unknown';

const TELEMETRY_WINDOW_SIZE = 120;
const TELEMETRY_FAST_BUCKET_RATIO = 0.25;
const TELEMETRY_LOG_LIMIT = 120;
const DISPLAY_TICKER_INTERVAL_MS = 120;
const DISPLAY_LEAD_MIN_MS = 80;
const DISPLAY_LEAD_MAX_MS = 800;
const DISPLAY_LEAD_DEFAULT_MS = 420;

const telemetrySamples: number[] = [];
const telemetryTickSamples: number[] = [];
const telemetryLogLines: string[] = [];
let telemetryInFlightRenders = 0;
let telemetryMaxQueueDepth = 0;
let estimatedFixedTickDelayMs = DISPLAY_LEAD_DEFAULT_MS;
let displayTickIntervalId: ReturnType<typeof setInterval> | null = null;
let lastDisplayTickSecondSent: number | null = null;
let lastRenderedPresetButtonsSignature = '';
let lastRawInteractionEventType: number | null = null;
let lastRawInteractionEventSource: number | null = null;
let lastRawInteractionEventAt = 0;
let lastKnownTimerState: TimerState | null = null;
let activePhonePage: 'home' | 'settings' | 'advanced' = 'home';

const RAW_EVENT_FALLBACK_WINDOW_MS = 500;

function getTelemetrySummaryEl(): HTMLElement | null {
  return document.getElementById('telemetry-summary');
}

function getTelemetryLogEl(): HTMLElement | null {
  return document.getElementById('telemetry-log');
}

function nowTimeLabel(): string {
  const now = new Date();
  return now.toLocaleTimeString('it-IT', { hour12: false });
}

function toMsText(value: number): string {
  return `${value.toFixed(1)} ms`;
}

function average(values: number[]): number {
  if (!values.length) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function smoothTowards(current: number, target: number, alpha: number): number {
  return current + (target - current) * alpha;
}

function updateTelemetrySummary(lastMs: number, reason: RenderReason): void {
  const summaryEl = getTelemetrySummaryEl();
  if (!summaryEl) return;
  if (!telemetrySamples.length) {
    summaryEl.textContent = 'Waiting for samples...';
    return;
  }

  const avgAllMs = average(telemetrySamples);
  const reference = telemetryTickSamples.length ? telemetryTickSamples : telemetrySamples;
  const avgTickMs = average(reference);
  const sorted = [...reference].sort((a, b) => a - b);
  const fastBucketCount = Math.max(1, Math.floor(sorted.length * TELEMETRY_FAST_BUCKET_RATIO));
  const fixedMs = average(sorted.slice(0, fastBucketCount));
  const variableMs = Math.max(0, avgTickMs - fixedMs);

  summaryEl.textContent =
    `Last (${reason}): ${toMsText(lastMs)}\n` +
    `Average all (${telemetrySamples.length}): ${toMsText(avgAllMs)}\n` +
    `Average tick (${reference.length}): ${toMsText(avgTickMs)}\n` +
    `Fixed delay est. (tick): ${toMsText(fixedMs)}\n` +
    `Variable extra: ${toMsText(variableMs)} | Lead: ${toMsText(estimatedFixedTickDelayMs)} | Max queue: ${telemetryMaxQueueDepth}`;
}

function pushTelemetryLog(line: string): void {
  telemetryLogLines.unshift(`[${nowTimeLabel()}] ${line}`);
  if (telemetryLogLines.length > TELEMETRY_LOG_LIMIT) telemetryLogLines.length = TELEMETRY_LOG_LIMIT;
  const logEl = getTelemetryLogEl();
  if (logEl) logEl.textContent = telemetryLogLines.join('\n');
}

function pushDetailedLog(source: string, message: string): void {
  pushTelemetryLog(source ? `${source} ${message}` : message);
}

function normalizeRawEventType(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const numericValue = Number(value);
    if (Number.isFinite(numericValue)) {
      return numericValue;
    }

    const enumValue = (OsEventTypeList as Record<string, unknown>)[value];
    if (typeof enumValue === 'number') {
      return enumValue;
    }
  }

  return null;
}

function normalizeRawEventSource(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const numericValue = Number(value);
    if (Number.isFinite(numericValue)) {
      return numericValue;
    }

    const enumValue = (EventSourceType as Record<string, unknown>)[value];
    if (typeof enumValue === 'number') {
      return enumValue;
    }
  }

  return null;
}

function extractRawEventType(input: unknown): number | null {
  if (!input || typeof input !== 'object') {
    return null;
  }

  const candidate = input as Record<string, unknown>;
  const directKeys = ['eventType', 'EventType', 'event_type', 'Event_Type'];

  for (const key of directKeys) {
    const normalized = normalizeRawEventType(candidate[key]);
    if (normalized !== null) {
      return normalized;
    }
  }

  const nestedKeys = ['jsonData', 'data', 'payload', 'textEvent', 'listEvent', 'sysEvent'];
  for (const key of nestedKeys) {
    const nested = candidate[key];
    if (nested && typeof nested === 'object') {
      const normalized = extractRawEventType(nested);
      if (normalized !== null) {
        return normalized;
      }
    }
  }

  return null;
}

function extractRawEventSource(input: unknown): number | null {
  if (!input || typeof input !== 'object') {
    return null;
  }

  const candidate = input as Record<string, unknown>;
  const directKeys = ['eventSource', 'EventSource', 'event_source', 'Event_Source'];

  for (const key of directKeys) {
    const normalized = normalizeRawEventSource(candidate[key]);
    if (normalized !== null) {
      return normalized;
    }
  }

  const nestedKeys = ['jsonData', 'data', 'payload', 'textEvent', 'listEvent', 'sysEvent'];
  for (const key of nestedKeys) {
    const nested = candidate[key];
    if (nested && typeof nested === 'object') {
      const normalized = extractRawEventSource(nested);
      if (normalized !== null) {
        return normalized;
      }
    }
  }

  return null;
}

function rememberRawInteractionEvent(rawEvent: unknown): void {
  const eventType = extractRawEventType(rawEvent);
  const eventSource = extractRawEventSource(rawEvent);
  if (eventType === null && eventSource === null) {
    return;
  }

  lastRawInteractionEventType = eventType;
  lastRawInteractionEventSource = eventSource;
  lastRawInteractionEventAt = Date.now();
  pushDetailedLog('[RAW]', `eventType=${String(eventType)} eventSource=${String(eventSource)}`);
}

function getRecentRawInteractionEventType(): number | null {
  if (Date.now() - lastRawInteractionEventAt > RAW_EVENT_FALLBACK_WINDOW_MS) {
    return null;
  }

  return lastRawInteractionEventType;
}

function clearRecentRawInteractionEventType(): void {
  lastRawInteractionEventType = null;
  lastRawInteractionEventSource = null;
  lastRawInteractionEventAt = 0;
}

function getRecentRawInteractionEventSource(): number | null {
  if (Date.now() - lastRawInteractionEventAt > RAW_EVENT_FALLBACK_WINDOW_MS) {
    return null;
  }

  return lastRawInteractionEventSource;
}

function activeLayoutSettings(): TimerLayoutSettings {
  return committedLayoutSettings;
}

function activePresetMinutes(): number[] {
  return committedPresetSettings.customPresets;
}

function isTimerRunning(): boolean {
  return Boolean(timerState) && timerState.getState() === TimerState.RUNNING;
}

function isIdleOnGlasses(): boolean {
  return Boolean(timerState) && timerState.getState() === TimerState.IDLE;
}

function effectivePanel(): GlassesPanel {
  return glassesPanel;
}

function currentNavigationState(): GlassesNavigationState {
  return {
    panel: glassesPanel,
    homeSelection,
    settingsField,
    runningActionPromptVisible,
  };
}

function clearRunningActionPrompt(): void {
  runningActionPromptVisible = false;
}

function showRunningActionPrompt(): void {
  runningActionPromptVisible = true;
  pushDetailedLog('[NAV]', 'running action prompt shown');
  updateRemoteView();
  sendToGlassesImmediate('manual');
}

async function persistLayoutSettings(settings: TimerLayoutSettings): Promise<void> {
  await saveTimerLayoutSettings(settings, bridge);
}

function openHomePanel(nextSelection: HomeSelection = homeSelection, allowWhileRunning = false): void {
  if (isTimerRunning() && !allowWhileRunning) {
    pushDetailedLog('[NAV]', 'home panel ignored: timer running');
    return;
  }

  clearRunningActionPrompt();
  homeSelection = nextSelection;
  glassesPanel = 'home';
  pushDetailedLog('[NAV]', `panel=home selection=${homeSelection}`);
  updateRemoteView();
  sendToGlassesImmediate('manual');
}

function openTimerPanel(allowWhileRunning = false): void {
  if (isTimerRunning() && !allowWhileRunning) {
    pushDetailedLog('[NAV]', 'timer panel ignored: timer running');
    return;
  }

  clearRunningActionPrompt();
  homeSelection = 'timer';
  glassesPanel = 'timer';
  pushDetailedLog('[NAV]', 'panel=timer');
  updateRemoteView();
  sendToGlassesImmediate('manual');
}

function openSettingsPanel(allowWhileRunning = false): void {
  if (isTimerRunning() && !allowWhileRunning) {
    pushDetailedLog('[NAV]', 'settings panel ignored: timer running');
    return;
  }

  clearRunningActionPrompt();
  homeSelection = 'settings';
  glassesPanel = 'settings';
  settingsField = 'format';
  pushDetailedLog('[NAV]', 'panel=settings');
  updateRemoteView();
  sendToGlassesImmediate('manual');
}

function resolveInteractionSource(event: any, hasStructuredEvent: boolean): InteractionSource {
  const sourceValue = normalizeRawEventSource(event?.sysEvent?.eventSource) ?? getRecentRawInteractionEventSource();
  if (sourceValue === EventSourceType.TOUCH_EVENT_FROM_RING) {
    return 'ring';
  }
  if (
    sourceValue === EventSourceType.TOUCH_EVENT_FROM_GLASSES_L ||
    sourceValue === EventSourceType.TOUCH_EVENT_FROM_GLASSES_R
  ) {
    return 'glasses';
  }
  if (!hasStructuredEvent) {
    return 'glasses';
  }
  if (event?.listEvent || event?.textEvent) {
    return 'ring';
  }
  return 'unknown';
}

function cycleRunningPanels(): void {
  if (!timerState || timerState.getState() !== TimerState.RUNNING) return;

  if (glassesPanel === 'timer') {
    openHomePanel('timer', true);
    return;
  }

  if (glassesPanel === 'home') {
    openSettingsPanel(true);
    return;
  }

  openTimerPanel(true);
}

function persistCurrentLayoutSettings(): void {
  timerState?.setDoneBlinkCount(committedLayoutSettings.doneBlinkCount);
  void persistLayoutSettings(committedLayoutSettings).catch((error) => {
    pushDetailedLog('[LAYOUT]', `persist error ${String(error)}`);
  });
}

function persistCurrentPresetSettings(): void {
  void saveTimerPresetSettings(committedPresetSettings, bridge).catch((error) => {
    pushDetailedLog('[PRESET]', `persist error ${String(error)}`);
  });
}

function persistCurrentTimerState(): void {
  if (!timerState) return;
  void saveTimerRuntimeSnapshot(timerState.getSnapshot(), bridge).catch((error) => {
    pushDetailedLog('[STATE]', `persist error ${String(error)}`);
  });
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function getRenderRemainingSeconds(reason: RenderReason): number {
  if (!timerState) return 0;
  const state = timerState.getState();
  if (state === TimerState.RUNNING && reason === 'tick') {
    return timerState.getDisplayRemainingSeconds(estimatedFixedTickDelayMs);
  }
  return timerState.getRemainingSeconds();
}

function stopDisplayTicker(): void {
  if (displayTickIntervalId !== null) {
    clearInterval(displayTickIntervalId);
    displayTickIntervalId = null;
    pushDetailedLog('[TICKER]', 'stopped');
  }
  lastDisplayTickSecondSent = null;
}

function startDisplayTicker(): void {
  if (displayTickIntervalId !== null) return;
  displayTickIntervalId = setInterval(() => {
    if (!bridge || !timerState) return;
    if (timerState.getState() !== TimerState.RUNNING) return;

    const displaySecond = timerState.getDisplayRemainingSeconds(estimatedFixedTickDelayMs);
    if (displaySecond === lastDisplayTickSecondSent) return;

    lastDisplayTickSecondSent = displaySecond;
    pushDetailedLog(
      '[TICKER]',
      `emit displaySecond=${displaySecond}s lead=${estimatedFixedTickDelayMs.toFixed(1)}ms real=${timerState.getRemainingSeconds()}s`,
    );
    sendToGlasses('tick');
  }, DISPLAY_TICKER_INTERVAL_MS);
  pushDetailedLog('[TICKER]', `started interval=${DISPLAY_TICKER_INTERVAL_MS}ms`);
}

function syncDisplayTickerWithState(state: TimerState): void {
  if (state === TimerState.RUNNING) {
    startDisplayTicker();
    return;
  }
  stopDisplayTicker();
}

function recordRenderTelemetry(
  reason: RenderReason,
  elapsedMs: number,
  queueDepth: number,
  state: TimerState,
  remainingSeconds: number,
): void {
  telemetrySamples.push(elapsedMs);
  if (telemetrySamples.length > TELEMETRY_WINDOW_SIZE) telemetrySamples.shift();
  if (reason === 'tick') {
    telemetryTickSamples.push(elapsedMs);
    if (telemetryTickSamples.length > TELEMETRY_WINDOW_SIZE) telemetryTickSamples.shift();
  }
  if (queueDepth > telemetryMaxQueueDepth) telemetryMaxQueueDepth = queueDepth;

  updateTelemetrySummary(elapsedMs, reason);

  const reference = telemetryTickSamples.length ? telemetryTickSamples : telemetrySamples;
  const sorted = [...reference].sort((a, b) => a - b);
  const fastBucketCount = Math.max(1, Math.floor(sorted.length * TELEMETRY_FAST_BUCKET_RATIO));
  const fixedMs = average(sorted.slice(0, fastBucketCount));
  const avgRefMs = average(reference);
  const extraMs = Math.max(0, elapsedMs - fixedMs);
  if (reason === 'tick') {
    const variableRefMs = Math.max(0, avgRefMs - fixedMs);
    const targetLeadMs = clamp(fixedMs + variableRefMs * 0.7, DISPLAY_LEAD_MIN_MS, DISPLAY_LEAD_MAX_MS);
    const previousLead = estimatedFixedTickDelayMs;
    estimatedFixedTickDelayMs = smoothTowards(previousLead, targetLeadMs, 0.25);
    if (Math.abs(previousLead - estimatedFixedTickDelayMs) >= 12) {
      pushDetailedLog('[TICKER]', `lead-adjust ${previousLead.toFixed(1)}ms -> ${estimatedFixedTickDelayMs.toFixed(1)}ms`);
    }
  }

  pushDetailedLog(
    '[RENDER]',
    `${reason.toUpperCase()} ${toMsText(elapsedMs)} (fixed ${toMsText(fixedMs)}, extra ${toMsText(extraMs)}, q ${queueDepth}) ` +
    `${state} ${formatTime(remainingSeconds)}`,
  );
}

// â”€â”€ Phone UI â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function clearRemoteStartPending() {
  const hadTimeout = remoteStartTimeoutId !== null;
  const hadInterval = remoteStartCountdownIntervalId !== null;
  if (remoteStartTimeoutId !== null) { clearTimeout(remoteStartTimeoutId); remoteStartTimeoutId = null; }
  if (remoteStartCountdownIntervalId !== null) { clearInterval(remoteStartCountdownIntervalId); remoteStartCountdownIntervalId = null; }
  remoteStartScheduledAt = null;
  pushDetailedLog('[REMOTE]', `clearRemoteStartPending timeout=${hadTimeout} interval=${hadInterval}`);
}

function formatTimerLayoutLabel(): string {
  return [
    formatTimerLayoutValue('format', committedLayoutSettings),
    formatTimerLayoutValue('vertical', committedLayoutSettings),
    formatTimerLayoutValue('horizontal', committedLayoutSettings),
    `Blink ${formatTimerLayoutValue('doneBlinkCount', committedLayoutSettings)}`,
  ].join(' / ');
}

function getDisplaySummary(): string {
  if (!timerState) {
    return 'Connecting...';
  }

  const state = timerState.getState();
  if (glassesPanel === 'settings') {
    const prefix = state === TimerState.RUNNING
      ? `Layout settings - ${formatTime(timerState.getRemainingSeconds())}`
      : 'Layout settings';
    return `${prefix} - ${formatTimerLayoutLabel()}`;
  }

  if (glassesPanel === 'timer') {
    if (state === TimerState.RUNNING) {
      return `Timer running - ${formatTime(timerState.getRemainingSeconds())}`;
    }
    if (state === TimerState.PAUSED) {
      return `Timer paused - ${formatTime(timerState.getRemainingSeconds())}`;
    }
    if (state === TimerState.DONE) {
      return 'Timer done - 00:00';
    }
    return `Timer setup - ${timerState.getSelectedPreset()} min`;
  }

  if (state === TimerState.RUNNING) {
    return `Home menu - timer running ${formatTime(timerState.getRemainingSeconds())}`;
  }
  if (state === TimerState.PAUSED) {
    return `Home menu - timer paused ${formatTime(timerState.getRemainingSeconds())}`;
  }

  return `Home menu - ${homeSelection === 'timer' ? 'Timer' : 'Layout settings'}`;
}
function getRemoteGestureHelp(): string {
  if (!timerState) {
    return 'Glasses controls load after connection.';
  }

  const state = timerState.getState();
  if (state === TimerState.RUNNING) {
    if (glassesPanel === 'home') {
      return 'On glasses: swipe chooses Timer or Layout, tap opens the selected screen, double tap returns to the dashboard.';
    }
    if (glassesPanel === 'settings') {
      return 'On glasses: tap changes the selected setting, swipe moves between fields, double tap returns to the dashboard.';
    }
    return runningActionPromptVisible
      ? 'On glasses: tap pauses the timer, double tap returns to the dashboard.'
      : 'On glasses: tap opens pause actions. Double tap returns to the dashboard. Ring taps stay locked while the timer is active.';
  }

  if (state === TimerState.PAUSED) {
    return runningActionPromptVisible
      ? 'On glasses: tap resumes the timer, double tap stops it.'
      : 'On glasses: tap opens resume or stop actions. Double tap on Timer resumes. Ring taps stay locked while the timer is active.';
  }

  if (glassesPanel === 'settings') {
    return 'On glasses: tap moves to the next setting field, swipe changes the selected setting, double tap returns to the menu.';
  }

  if (glassesPanel === 'timer') {
    return 'On glasses: swipe changes shortcuts, tap starts the timer, double tap returns to the menu.';
  }

  return 'On glasses: swipe chooses Timer or Settings, tap opens the selected screen, double tap exits.';
}

function getPhoneStateLabel(state: TimerState): string {
  if (state === TimerState.RUNNING) return 'Running';
  if (state === TimerState.PAUSED) return 'Paused';
  if (state === TimerState.DONE) return 'Done';
  return 'Idle';
}

function getPhonePanelLabel(): string {
  if (glassesPanel === 'settings') return 'Layout settings';
  if (glassesPanel === 'timer') return 'Timer setup';
  return homeSelection === 'settings' ? 'Home / settings' : 'Home / timer';
}

function getPhonePositionLabel(settings: TimerLayoutSettings): string {
  const vertical = settings.vertical === 'top' ? 'Top' : settings.vertical === 'mid' ? 'Mid' : 'Center';
  const horizontal = settings.horizontal === 'left' ? 'Left' : settings.horizontal === 'center' ? 'Center' : 'Right';
  return `${vertical} ${horizontal}`;
}

function applyPreviewTimerLayout(
  previewTimerEl: HTMLElement,
  settings: TimerLayoutSettings,
  timeText: string,
): void {
  const anchor = getPreviewAnchor(settings, timeText);

  previewTimerEl.className = `preview-timer ${settings.format === 'compact' ? 'size-compact' : 'size-large'}`;
  previewTimerEl.style.setProperty('--preview-left', `${anchor.leftPercent.toFixed(3)}%`);
  previewTimerEl.style.setProperty('--preview-top', `${anchor.topPercent.toFixed(3)}%`);
  previewTimerEl.style.setProperty('--preview-width', `${anchor.widthPercent.toFixed(3)}%`);
  previewTimerEl.style.setProperty('--preview-height', `${anchor.heightPercent.toFixed(3)}%`);
  previewTimerEl.style.setProperty('--preview-transform', anchor.transform);
}

function getGestureTitle(): string {
  if (!timerState) return 'Ready when connected';
  const state = timerState.getState();
  if (state === TimerState.RUNNING) return runningActionPromptVisible ? 'Pause or stop' : 'Timer in progress';
  if (state === TimerState.PAUSED) return runningActionPromptVisible ? 'Resume or stop' : 'Timer paused';
  if (glassesPanel === 'settings') return 'Layout controls';
  if (glassesPanel === 'timer') return 'Preset controls';
  return 'Home navigation';
}

function scrollPhoneViewportToTop(behavior: ScrollBehavior = 'smooth'): void {
  window.scrollTo({ top: 0, behavior });
}

function setActivePhonePage(
  nextPage: typeof activePhonePage,
  options: { scrollToTop?: boolean; scrollBehavior?: ScrollBehavior } = {},
): void {
  const { scrollToTop = false, scrollBehavior = 'smooth' } = options;
  activePhonePage = nextPage;
  document.querySelectorAll<HTMLElement>('.page').forEach((page) => {
    page.classList.toggle('active', page.dataset.page === nextPage);
  });
  document.querySelectorAll<HTMLElement>('.nav-tab').forEach((tab) => {
    tab.classList.toggle('active', tab.dataset.pageTarget === nextPage);
  });
  if (scrollToTop) {
    scrollPhoneViewportToTop(scrollBehavior);
  }
}

function setupPhoneNavigation(): void {
  document.querySelectorAll<HTMLElement>('.nav-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      const target = tab.dataset.pageTarget as typeof activePhonePage | undefined;
      if (!target) return;
      setActivePhonePage(target, { scrollToTop: true });
    });
  });

  const editCustomButton = document.getElementById('dashboard-edit-custom');
  const customSetSection = document.getElementById('custom-set-section');
  editCustomButton?.addEventListener('click', () => {
    setActivePhonePage('settings', { scrollBehavior: 'auto' });
    customSetSection?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}

function ensurePresetButtonsRendered(): void {
  const container = document.getElementById('remote-preset-buttons');
  if (!container) return;

  const signature = activePresetMinutes().join(',');
  if (signature === lastRenderedPresetButtonsSignature) {
    return;
  }

  container.innerHTML = activePresetMinutes()
    .map((preset) => `<button type="button" class="preset-btn" data-preset="${preset}">${preset}</button>`)
    .join('');

  lastRenderedPresetButtonsSignature = signature;
}

function updateRemoteView() {
  ensurePresetButtonsRendered();
  const status = document.getElementById('remote-status');
  const btnStart = document.getElementById('btn-start-pause') as HTMLButtonElement | null;
  const btnReset = document.getElementById('btn-reset') as HTMLButtonElement | null;
  const btnStartIcon = document.getElementById('btn-start-icon');
  const btnStartLabel = document.getElementById('btn-start-label');
  const presetBtns = document.querySelectorAll('#remote-preset-buttons .preset-btn');
  const displaySummary = document.getElementById('glasses-view-summary');
  const screenBtns = document.querySelectorAll('#remote-screen-buttons .screen-btn');
  const layoutBtns = document.querySelectorAll('#layout-controls .layout-btn');
  const dashboardSizeBtns = document.querySelectorAll('.size-btn');
  const dashboardPositionBtns = document.querySelectorAll('.position-btn');
  const exactMinuteInput = document.getElementById('exact-minute-input') as HTMLInputElement | null;
  const customPresetsInput = document.getElementById('custom-presets-input') as HTMLInputElement | null;
  const applyMinuteBtn = document.getElementById('apply-minute-btn') as HTMLButtonElement | null;
  const saveCustomPresetsBtn = document.getElementById('save-custom-presets') as HTMLButtonElement | null;
  const remoteGestureHelp = document.getElementById('remote-gesture-help');
  const heroSubtitle = document.getElementById('hero-subtitle');
  const previewTimerEl = document.getElementById('phone-preview-timer');
  const previewTime = document.getElementById('phone-preview-time');
  const previewCaption = document.getElementById('phone-preview-caption');
  const phoneLayoutMeta = document.getElementById('phone-layout-meta');
  const phoneStateLabel = document.getElementById('phone-state-label');
  const phonePanelLabel = document.getElementById('phone-panel-label');
  const phoneGestureTitle = document.getElementById('phone-gesture-title');

  const connected = !!(bridge && timerState);
  if (status) {
    status.textContent = connected
      ? (isInitialized ? 'Connected - display ready' : 'Connected - initializing...')
      : 'Connecting...';
    status.className = connected ? 'status-pill connected' : 'status-pill';
  }
  if (displaySummary) {
    displaySummary.textContent = getDisplaySummary();
  }
  if (remoteGestureHelp) {
    remoteGestureHelp.textContent = getRemoteGestureHelp();
  }

  if (customPresetsInput && document.activeElement !== customPresetsInput) {
    customPresetsInput.value = activePresetMinutes().join(', ');
  }
  if (customPresetsInput) {
    customPresetsInput.disabled = !connected;
  }
  if (saveCustomPresetsBtn) {
    saveCustomPresetsBtn.disabled = !connected;
  }

  const pending = remoteStartScheduledAt !== null;

  if (timerState) {
    const preset = timerState.getSelectedPreset();
    const state = timerState.getState();
    const remaining = timerState.getRemainingSeconds();
    const previewTimeValue = formatTime(remaining);
    const canEditPreset = connected && !pending && state === TimerState.IDLE;
    const currentPanel = effectivePanel();
    if (heroSubtitle) {
      heroSubtitle.textContent = getPhonePositionLabel(committedLayoutSettings);
    }
    if (previewTime) {
      previewTime.textContent = previewTimeValue;
    }
    if (previewTimerEl) {
      applyPreviewTimerLayout(previewTimerEl, committedLayoutSettings, previewTimeValue);
    }
    if (previewCaption) {
      previewCaption.textContent = pending
        ? 'Remote start delay'
        : state === TimerState.RUNNING
          ? 'Projection active'
          : state === TimerState.PAUSED
            ? 'Projection paused'
            : state === TimerState.DONE
              ? 'Sequence complete'
              : `${preset} minute preset`;
    }
    if (phoneLayoutMeta) {
      phoneLayoutMeta.textContent = `Size: ${formatTimerLayoutValue('format', committedLayoutSettings)}`;
    }
    if (phonePanelLabel) {
      phonePanelLabel.textContent = `Pos: ${getPhonePositionLabel(committedLayoutSettings)}`;
    }
    if (phoneGestureTitle) {
      phoneGestureTitle.textContent = getGestureTitle();
    }
    presetBtns.forEach(b => {
      const p = parseInt((b as HTMLElement).dataset.preset || '', 10);
      b.classList.toggle('selected', p === preset);
      (b as HTMLButtonElement).disabled = !canEditPreset;
    });
    if (exactMinuteInput && document.activeElement !== exactMinuteInput) {
      exactMinuteInput.value = String(preset);
    }
    if (exactMinuteInput) {
      exactMinuteInput.disabled = !canEditPreset;
    }
    if (applyMinuteBtn) {
      applyMinuteBtn.disabled = !canEditPreset;
    }
    screenBtns.forEach((button) => {
      const target = (button as HTMLElement).dataset.screen || '';
      const isCurrent = target === currentPanel;
      const isLocked = state === TimerState.RUNNING && target !== 'timer';
      button.classList.toggle('selected', isCurrent);
      (button as HTMLButtonElement).disabled = !connected || isLocked;
    });
    layoutBtns.forEach((button) => {
      const field = (button as HTMLElement).dataset.field || '';
      const value = (button as HTMLElement).dataset.value || '';
      let isSelected = false;
      if (field === 'format') isSelected = committedLayoutSettings.format === value;
      if (field === 'vertical') isSelected = committedLayoutSettings.vertical === value;
      if (field === 'horizontal') isSelected = committedLayoutSettings.horizontal === value;
      if (field === 'doneBlinkCount') isSelected = String(committedLayoutSettings.doneBlinkCount) === value;
      button.classList.toggle('selected', isSelected);
      (button as HTMLButtonElement).disabled = !connected;
    });
    dashboardSizeBtns.forEach((button) => {
      const size = (button as HTMLElement).dataset.size || '';
      const isSelected = committedLayoutSettings.format === size;
      button.classList.toggle('active', isSelected);
      (button as HTMLButtonElement).disabled = !connected;
    });
    dashboardPositionBtns.forEach((button) => {
      const vertical = (button as HTMLElement).dataset.vertical || '';
      const horizontal = (button as HTMLElement).dataset.horizontal || '';
      const isSelected =
        committedLayoutSettings.vertical === vertical &&
        committedLayoutSettings.horizontal === horizontal;
      button.classList.toggle('active', isSelected);
      (button as HTMLButtonElement).disabled = !connected;
    });
    if (btnStart) {
      btnStart.disabled = !connected;
      const running = state === TimerState.RUNNING;
      if (pending) {
        if (btnStartIcon) {
          btnStartIcon.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
              <circle cx="6" cy="12" r="1.2" fill="currentColor" stroke="none"></circle>
              <circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none"></circle>
              <circle cx="18" cy="12" r="1.2" fill="currentColor" stroke="none"></circle>
            </svg>`;
        }
        if (btnStartLabel) btnStartLabel.textContent = 'Wait';
        btnStart.classList.remove('pause-mode');
      } else {
        if (btnStartIcon) {
          btnStartIcon.innerHTML = running
            ? `
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="7" y="6" width="3.5" height="12" rx="1" fill="currentColor" stroke="none"></rect>
                <rect x="13.5" y="6" width="3.5" height="12" rx="1" fill="currentColor" stroke="none"></rect>
              </svg>`
            : `
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round">
                <path d="M9 7.5 17 12l-8 4.5z" fill="currentColor" stroke="none"></path>
              </svg>`;
        }
        if (btnStartLabel) btnStartLabel.textContent = running ? 'Pause' : 'Play';
        btnStart.classList.toggle('pause-mode', running);
      }
    }
    if (btnReset) btnReset.disabled = !connected;
  } else {
    presetBtns.forEach(b => { b.classList.remove('selected'); (b as HTMLButtonElement).disabled = true; });
    screenBtns.forEach((button) => { button.classList.remove('selected'); (button as HTMLButtonElement).disabled = true; });
    layoutBtns.forEach((button) => { button.classList.remove('selected'); (button as HTMLButtonElement).disabled = true; });
    dashboardSizeBtns.forEach((button) => { button.classList.remove('active'); (button as HTMLButtonElement).disabled = true; });
    dashboardPositionBtns.forEach((button) => { button.classList.remove('active'); (button as HTMLButtonElement).disabled = true; });
    if (previewTime) previewTime.textContent = '05:00';
    if (previewTimerEl) applyPreviewTimerLayout(previewTimerEl, committedLayoutSettings, '05:00');
    if (previewCaption) previewCaption.textContent = 'Preset ready';
    if (phoneLayoutMeta) phoneLayoutMeta.textContent = `Size: ${formatTimerLayoutValue('format', committedLayoutSettings)}`;
    if (phonePanelLabel) phonePanelLabel.textContent = `Pos: ${getPhonePositionLabel(committedLayoutSettings)}`;
    if (phoneGestureTitle) phoneGestureTitle.textContent = 'Ready when connected';
    if (exactMinuteInput && document.activeElement !== exactMinuteInput) exactMinuteInput.value = '';
    if (exactMinuteInput) exactMinuteInput.disabled = true;
    if (applyMinuteBtn) applyMinuteBtn.disabled = true;
    if (btnStart) { btnStart.disabled = true; btnStart.classList.remove('pause-mode'); }
    if (btnStartIcon) {
      btnStartIcon.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round">
          <path d="M9 7.5 17 12l-8 4.5z" fill="currentColor" stroke="none"></path>
        </svg>`;
    }
    if (btnStartLabel) btnStartLabel.textContent = 'Play';
    if (btnReset) btnReset.disabled = true;
  }
}

// â”€â”€ Fire-and-forget glasses render (never awaited, never blocks) â”€â”€
// Send every tick so display updates every 1s; overlapping pushes allowed.
function sendToGlasses(reason: RenderReason = 'tick') {
  if (!bridge || !timerState) {
    pushDetailedLog(
      '[RENDER]',
      `skip reason=${reason} foreground=${isInForeground} pageVisible=${isPageVisible} bridge=${Boolean(bridge)} stateMgr=${Boolean(timerState)}`,
    );
    return;
  }
  const state = timerState.getState();
  const selectedPreset = timerState.getSelectedPreset();
  const remainingSeconds = getRenderRemainingSeconds(reason);
  const blinkVisibility = timerState.getBlinkVisibility();
  const startedAt = performance.now();
  telemetryInFlightRenders++;
  const queueDepth = telemetryInFlightRenders;
  pushDetailedLog('[RENDER]', `start reason=${reason} q=${queueDepth} state=${state} t=${formatTime(remainingSeconds)}`);

  renderUI(
    bridge,
    state,
    selectedPreset,
    remainingSeconds,
    blinkVisibility,
    {
      layoutSettings: activeLayoutSettings(),
      navigation: currentNavigationState(),
      presetMinutes: activePresetMinutes(),
    },
  ).then(() => {
    const elapsedMs = performance.now() - startedAt;
    recordRenderTelemetry(reason, elapsedMs, queueDepth, state, remainingSeconds);
  }).catch(err => {
    pushDetailedLog('[RENDER]', `ERR ${reason.toUpperCase()} ${String(err)}`);
    console.error('[Timer] renderUI:', err);
  }).finally(() => {
    telemetryInFlightRenders = Math.max(0, telemetryInFlightRenders - 1);
    pushDetailedLog('[RENDER]', `end reason=${reason} inFlight=${telemetryInFlightRenders}`);
  });
}

function sendToGlassesImmediate(reason: RenderReason = 'manual') {
  if (!bridge || !timerState) {
    pushDetailedLog(
      '[RENDER]',
      `skip-immediate reason=${reason} pageVisible=${isPageVisible} bridge=${Boolean(bridge)} stateMgr=${Boolean(timerState)}`,
    );
    return;
  }
  const state = timerState.getState();
  const selectedPreset = timerState.getSelectedPreset();
  const remainingSeconds = getRenderRemainingSeconds(reason);
  const blinkVisibility = timerState.getBlinkVisibility();
  const startedAt = performance.now();
  telemetryInFlightRenders++;
  const queueDepth = telemetryInFlightRenders;
  pushDetailedLog('[RENDER]', `start-immediate reason=${reason} q=${queueDepth} state=${state} t=${formatTime(remainingSeconds)}`);

  renderUI(
    bridge,
    state,
    selectedPreset,
    remainingSeconds,
    blinkVisibility,
    {
      layoutSettings: activeLayoutSettings(),
      navigation: currentNavigationState(),
      presetMinutes: activePresetMinutes(),
    },
  ).then(() => {
    const elapsedMs = performance.now() - startedAt;
    recordRenderTelemetry(reason, elapsedMs, queueDepth, state, remainingSeconds);
  }).catch(err => {
    pushDetailedLog('[RENDER]', `ERR ${reason.toUpperCase()} ${String(err)}`);
    console.error('[Timer] renderUI:', err);
  }).finally(() => {
    telemetryInFlightRenders = Math.max(0, telemetryInFlightRenders - 1);
    pushDetailedLog('[RENDER]', `end-immediate reason=${reason} inFlight=${telemetryInFlightRenders}`);
  });
}

// â”€â”€ Remote control buttons â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function setupRemoteControl() {
  setupPhoneNavigation();
  setActivePhonePage(activePhonePage);
  const btnStart = document.getElementById('btn-start-pause');
  const btnReset = document.getElementById('btn-reset');
  const presetButtonsContainer = document.getElementById('remote-preset-buttons');
  const screenBtns = document.querySelectorAll('#remote-screen-buttons .screen-btn');
  const layoutBtns = document.querySelectorAll('#layout-controls .layout-btn');
  const dashboardSizeBtns = document.querySelectorAll('.size-btn');
  const dashboardPositionBtns = document.querySelectorAll('.position-btn');
  const exactMinuteInput = document.getElementById('exact-minute-input') as HTMLInputElement | null;
  const applyMinuteBtn = document.getElementById('apply-minute-btn');
  const customPresetsInput = document.getElementById('custom-presets-input') as HTMLInputElement | null;
  const saveCustomPresetsBtn = document.getElementById('save-custom-presets');
  pushDetailedLog('[REMOTE]', `setupRemoteControl presets=${activePresetMinutes().length}`);

  const applyPreset = (minutes: number) => {
    if (!timerState || !bridge) return;
    pushDetailedLog('[REMOTE]', `preset apply ${minutes}`);
    clearRunningActionPrompt();
    glassesPanel = 'timer';
    homeSelection = 'timer';
    timerState.setPreset(minutes);
  };

  btnStart?.addEventListener('click', () => {
    if (!timerState || !bridge) return;
    const state = timerState.getState();
    pushDetailedLog('[REMOTE]', `btn-start-pause click state=${state}`);

    if (state === TimerState.RUNNING) {
      clearRemoteStartPending();
      clearRunningActionPrompt();
      timerState.toggleStartPause();
      return;
    }
    if (state === TimerState.PAUSED) {
      clearRemoteStartPending();
      clearRunningActionPrompt();
      glassesPanel = 'timer';
      homeSelection = 'timer';
      timerState.toggleStartPause();
      return;
    }
    if (state === TimerState.IDLE || state === TimerState.DONE) {
      if (remoteStartScheduledAt !== null) return;
      clearRunningActionPrompt();
      glassesPanel = 'timer';
      homeSelection = 'timer';
      timerState.start();
      remoteStartScheduledAt = Date.now();
      remoteStartCountdownIntervalId = setInterval(() => updateRemoteView(), REMOTE_START_COUNTDOWN_INTERVAL_MS);
      remoteStartTimeoutId = setTimeout(() => { clearRemoteStartPending(); updateRemoteView(); }, REMOTE_START_DELAY_MS);
      pushDetailedLog('[REMOTE]', `delayed-start armed delayMs=${REMOTE_START_DELAY_MS}`);
      updateRemoteView();
    }
  });

  btnReset?.addEventListener('click', () => {
    if (!timerState || !bridge) return;
    pushDetailedLog('[REMOTE]', `btn-reset click state=${timerState.getState()}`);
    clearRemoteStartPending();
    clearRunningActionPrompt();
    timerState.resetToPreset();
  });

  presetButtonsContainer?.addEventListener('click', (event) => {
    const target = (event.target as HTMLElement | null)?.closest('.preset-btn') as HTMLElement | null;
    const min = parseInt(target?.dataset.preset || '', 10);
    if (!target || !min) return;
    applyPreset(min);
  });

  applyMinuteBtn?.addEventListener('click', () => {
    if (!exactMinuteInput) return;
    if (!exactMinuteInput.value.trim()) return;
    const min = Number(exactMinuteInput.value);
    if (!Number.isFinite(min)) return;
    applyPreset(min);
  });

  exactMinuteInput?.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    applyMinuteBtn?.dispatchEvent(new Event('click'));
  });

  saveCustomPresetsBtn?.addEventListener('click', () => {
    if (!customPresetsInput) return;

    const nextPresets = parseCustomPresetInput(customPresetsInput.value);
    committedPresetSettings = {
      customPresets: nextPresets,
    };
    lastRenderedPresetButtonsSignature = '';
    pushDetailedLog('[PRESET]', `saved shortcuts=${nextPresets.join('/')}`);
    persistCurrentPresetSettings();
    updateRemoteView();
    sendToGlassesImmediate('manual');
  });
  screenBtns.forEach((button) => {
    button.addEventListener('click', () => {
      if (!timerState || !bridge) return;
      const target = ((button as HTMLElement).dataset.screen || 'home') as GlassesPanel;
      pushDetailedLog('[REMOTE]', `screen click ${target}`);
      if (target === 'timer') {
        openTimerPanel();
      } else if (target === 'settings') {
        openSettingsPanel();
      } else {
        openHomePanel();
      }
    });
  });

  layoutBtns.forEach((button) => {
    button.addEventListener('click', () => {
      if (!timerState || !bridge) return;

      const field = (button as HTMLElement).dataset.field as TimerLayoutField | undefined;
      const value = (button as HTMLElement).dataset.value;
      if (!field || !value) return;

      pushDetailedLog('[REMOTE]', `layout click field=${field} value=${value}`);
      const normalizedValue = field === 'doneBlinkCount' ? Number(value) : value;
      committedLayoutSettings = {
        ...committedLayoutSettings,
        [field]: normalizedValue,
      } as TimerLayoutSettings;
      if (isIdleOnGlasses()) {
        homeSelection = 'settings';
        if (glassesPanel === 'home') {
          glassesPanel = 'settings';
        }
      }
      persistCurrentLayoutSettings();
      updateRemoteView();
      sendToGlassesImmediate('manual');
    });
  });

  dashboardSizeBtns.forEach((button) => {
    button.addEventListener('click', () => {
      if (!timerState || !bridge) return;
      const value = (button as HTMLElement).dataset.size as TimerLayoutSettings['format'] | undefined;
      if (!value) return;

      committedLayoutSettings = {
        ...committedLayoutSettings,
        format: value,
      };
      persistCurrentLayoutSettings();
      updateRemoteView();
      sendToGlassesImmediate('manual');
    });
  });

  dashboardPositionBtns.forEach((button) => {
    button.addEventListener('click', () => {
      if (!timerState || !bridge) return;
      const vertical = (button as HTMLElement).dataset.vertical as TimerLayoutSettings['vertical'] | undefined;
      const horizontal = (button as HTMLElement).dataset.horizontal as TimerLayoutSettings['horizontal'] | undefined;
      if (!vertical || !horizontal) return;

      committedLayoutSettings = {
        ...committedLayoutSettings,
        vertical,
        horizontal,
      };
      persistCurrentLayoutSettings();
      updateRemoteView();
      sendToGlassesImmediate('manual');
    });
  });
}

// â”€â”€ Swipe throttling â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
let lastSwipeTime = 0;
const SWIPE_COOLDOWN_MS = 300;

// â”€â”€ Event handlers for glasses â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function syncPageVisibility(nextVisible: boolean): void {
  isPageVisible = nextVisible;
  pushDetailedLog('[PAGE]', `visibility visible=${isPageVisible}`);

  if (!timerState) {
    return;
  }

  if (!isPageVisible) {
    persistCurrentTimerState();
    timerState.handleBackground();
    return;
  }

  timerState.handleForeground();
  syncDisplayTickerWithState(timerState.getState());
  updateRemoteView();
  persistCurrentTimerState();

  if (bridge) {
    sendToGlassesImmediate('foreground');
  }
}

function attachPageLifecycleHandlers(): void {
  document.addEventListener('visibilitychange', () => syncPageVisibility(!document.hidden));
  window.addEventListener('pageshow', () => syncPageVisibility(true));
  window.addEventListener('pagehide', () => syncPageVisibility(false));

  // Extra fallbacks for mobile browsers that don't reliably fire visibilitychange
  // when the screen turns back on (e.g. Chrome on Android).
  window.addEventListener('focus', () => {
    if (document.hidden) return; // page is still hidden, ignore
    syncPageVisibility(true);
  });

  // Page Lifecycle API (Chrome 68+): freeze = screen off / background kill
  window.addEventListener('freeze', () => syncPageVisibility(false));
  window.addEventListener('resume', () => syncPageVisibility(!document.hidden));

  // Heartbeat: every 10 s, if the page is supposed to be visible but the timer
  // hasn't been synced recently, force a foreground sync. This catches the rare
  // cases where none of the above events fires after the screen wakes up.
  setInterval(() => {
    if (!document.hidden && !isPageVisible) {
      pushDetailedLog('[PAGE]', 'heartbeat detected stale invisible state, resyncing');
      syncPageVisibility(true);
    }
  }, 10_000);
}

function attachRawEvenHubEventFallback(): void {
  if (typeof window === 'undefined') {
    return;
  }

  const hostWindow = window as typeof window & {
    _listenEvenAppMessage?: (message: unknown) => void;
    __g2TimerRawEvenHubHooked?: boolean;
  };

  if (hostWindow.__g2TimerRawEvenHubHooked || typeof hostWindow._listenEvenAppMessage !== 'function') {
    return;
  }

  const originalListener = hostWindow._listenEvenAppMessage.bind(hostWindow);
  hostWindow._listenEvenAppMessage = (message: unknown) => {
    try {
      const parsedMessage = typeof message === 'string' ? JSON.parse(message) : message;
      const envelope = parsedMessage as { method?: string; payload?: unknown; data?: unknown } | null;
      if (envelope?.method === 'evenHubEvent') {
        rememberRawInteractionEvent(envelope.data ?? envelope.payload);
      }
    } catch (error) {
      pushDetailedLog('[RAW]', `parse error ${String(error)}`);
    }

    originalListener(message);
  };

  hostWindow.__g2TimerRawEvenHubHooked = true;
  pushDetailedLog('[RAW]', 'fallback attached');
}

function setupEventHandlers() {
  if (!bridge) return;
  try {
    pushDetailedLog('[EVENT]', 'setupEventHandlers attached');
    bridge.onEvenHubEvent((event: any) => {
      if (!timerState) return;
      const listEventType = event?.listEvent?.eventType;
      const textEventType = event?.textEvent?.eventType;
      const sysEventType = event?.sysEvent?.eventType;
      const hasStructuredEvent = Boolean(event?.listEvent || event?.textEvent || event?.sysEvent || event?.audioEvent);
      const interactionEventType = textEventType ?? listEventType;
      const rawInteractionEventType = hasStructuredEvent ? null : getRecentRawInteractionEventType();
      const effectiveInteractionEventType = interactionEventType ?? rawInteractionEventType;
      const interactionSource = resolveInteractionSource(event, hasStructuredEvent);
      pushDetailedLog(
        '[EVENT]',
        `recv list=${String(listEventType)}:${String(event?.listEvent?.containerName)} text=${String(textEventType)}:${String(event?.textEvent?.containerName)} sys=${String(sysEventType)} source=${interactionSource} raw=${String(rawInteractionEventType)}`,
      );
      console.log('Even Hub event:', event);

      if (sysEventType === OsEventTypeList.FOREGROUND_ENTER_EVENT) {
        isInForeground = true;
        pushDetailedLog('[EVENT]', 'enterForeground');
        timerState.handleForeground();
        syncDisplayTickerWithState(timerState.getState());
        updateRemoteView();
        persistCurrentTimerState();
        sendToGlassesImmediate('foreground');
        return;
      }
      if (sysEventType === OsEventTypeList.FOREGROUND_EXIT_EVENT) {
        pushDetailedLog('[EVENT]', 'exitForeground');
        isInForeground = false;
        timerState.handleBackground();
        persistCurrentTimerState();
        updateRemoteView();
        return;
      }

      if (effectiveInteractionEventType === null && !sysEventType) {
        // Either a bare event (no structured payload) or a structured event whose
        // eventType is unrecognised / missing â€“ treat both as a single tap from the
        // temple button, which is the only physical gesture that can produce such an
        // event on the G2.
        pushDetailedLog('[EVENT]', hasStructuredEvent ? 'structured event with unknown eventType -> singleTap' : 'bare event -> singleTap');
        handleSingleTap(interactionSource);
        return;
      }

      if (effectiveInteractionEventType === OsEventTypeList.SCROLL_TOP_EVENT || sysEventType === OsEventTypeList.SCROLL_TOP_EVENT) {
        clearRecentRawInteractionEventType();
        handleSwipe(1, interactionSource);
        return;
      }
      if (effectiveInteractionEventType === OsEventTypeList.SCROLL_BOTTOM_EVENT || sysEventType === OsEventTypeList.SCROLL_BOTTOM_EVENT) {
        clearRecentRawInteractionEventType();
        handleSwipe(-1, interactionSource);
        return;
      }
      if (effectiveInteractionEventType === OsEventTypeList.DOUBLE_CLICK_EVENT || sysEventType === OsEventTypeList.DOUBLE_CLICK_EVENT) {
        clearRecentRawInteractionEventType();
        pushDetailedLog('[EVENT]', `doubleTap source=${interactionSource}`);
        handleDoubleTap(interactionSource);
        return;
      }
      if (effectiveInteractionEventType === OsEventTypeList.CLICK_EVENT || sysEventType === OsEventTypeList.CLICK_EVENT) {
        clearRecentRawInteractionEventType();
        pushDetailedLog('[EVENT]', `singleTap source=${interactionSource}`);
        handleSingleTap(interactionSource);
      }
    });
  } catch (err) {
    pushDetailedLog('[EVENT]', `setup error ${String(err)}`);
    console.error('Error setting up event handlers:', err);
  }
}

function handleSingleTap(source: InteractionSource) {
  if (!timerState || !bridge) return;
  const state = timerState.getState();
  const panel = effectivePanel();
  pushDetailedLog('[INPUT]', `singleTap panel=${panel} state=${state} source=${source}`);

  if (state === TimerState.RUNNING) {
    if (source !== 'glasses') {
      pushDetailedLog('[INPUT]', `singleTap ignored while active source=${source}`);
      return;
    }

    if (runningActionPromptVisible) {
      clearRemoteStartPending();
      clearRunningActionPrompt();
      timerState.pause();
      return;
    }

    if (panel === 'timer') {
      showRunningActionPrompt();
      return;
    }

    if (panel === 'settings') {
      committedLayoutSettings = adjustTimerLayoutSetting(committedLayoutSettings, settingsField, 1);
      pushDetailedLog(
        '[LAYOUT]',
        `tap adjust field=${settingsField} -> ${committedLayoutSettings.format}/${committedLayoutSettings.vertical}/${committedLayoutSettings.horizontal}`,
      );
      persistCurrentLayoutSettings();
      updateRemoteView();
      sendToGlassesImmediate('manual');
      return;
    }

    if (homeSelection === 'settings') {
      openSettingsPanel(true);
    } else {
      openTimerPanel(true);
    }
    return;
  }

  if (state === TimerState.PAUSED) {
    if (source !== 'glasses') {
      pushDetailedLog('[INPUT]', `singleTap ignored while paused source=${source}`);
      return;
    }

    if (runningActionPromptVisible) {
      clearRemoteStartPending();
      clearRunningActionPrompt();
      timerState.start();
      return;
    }

    if (panel === 'timer') {
      showRunningActionPrompt();
      return;
    }

    if (panel === 'home') {
      if (homeSelection === 'settings') {
        openSettingsPanel(true);
      } else {
        openTimerPanel(true);
      }
      return;
    }

    openTimerPanel(true);
    return;
  }

  if (state === TimerState.DONE) {
    if (source !== 'glasses') {
      pushDetailedLog('[INPUT]', `singleTap ignored while done source=${source}`);
      return;
    }

    clearRemoteStartPending();
    clearRunningActionPrompt();
    glassesPanel = 'timer';
    homeSelection = 'timer';
    timerState.resetToPreset();
    return;
  }

  if (panel === 'home') {
    if (homeSelection === 'settings') {
      openSettingsPanel();
    } else {
      openTimerPanel();
    }
    return;
  }

  if (panel === 'settings') {
    committedLayoutSettings = adjustTimerLayoutSetting(committedLayoutSettings, settingsField, 1);
    pushDetailedLog(
      '[LAYOUT]',
      `tap adjust field=${settingsField} -> ${committedLayoutSettings.format}/${committedLayoutSettings.vertical}/${committedLayoutSettings.horizontal}`,
    );
    persistCurrentLayoutSettings();
    updateRemoteView();
    sendToGlassesImmediate('manual');
    return;
  }

  timerState.toggleStartPause();
}

function handleDoubleTap(source: InteractionSource): void {
  if (!timerState || !bridge) return;
  const state = timerState.getState();
  const panel = effectivePanel();
  pushDetailedLog('[INPUT]', `doubleTap panel=${panel} state=${state} source=${source}`);

  if (state === TimerState.RUNNING) {
    if (source !== 'glasses') {
      pushDetailedLog('[INPUT]', `doubleTap ignored while running source=${source}`);
      return;
    }

    clearRemoteStartPending();
    clearRunningActionPrompt();
    openHomePanel('timer', true);
    pushDetailedLog('[INPUT]', 'doubleTap running -> dashboard');
    return;
  }

  if (state === TimerState.PAUSED) {
    if (source !== 'glasses') {
      pushDetailedLog('[INPUT]', `doubleTap ignored while paused source=${source}`);
      return;
    }

    if (runningActionPromptVisible) {
      clearRemoteStartPending();
      clearRunningActionPrompt();
      timerState.resetToPreset();
      return;
    }

    pushDetailedLog('[INPUT]', `doubleTap ignored while paused promptVisible=${runningActionPromptVisible}`);
    return;
  }

  if (panel === 'settings') {
    openHomePanel('settings');
    return;
  }

  if (panel === 'home') {
    if (source !== 'glasses') {
      pushDetailedLog('[INPUT]', `doubleTap ignored on home source=${source}`);
      return;
    }

    pushDetailedLog('[APP]', 'request exit confirmation');
    bridge.shutDownPageContainer(1);
    return;
  }

  if (panel === 'timer' && timerState.getState() === TimerState.IDLE) {
    openHomePanel('timer');
    return;
  }

  clearRemoteStartPending();
  clearRunningActionPrompt();
  timerState.resetToPreset();
}

function handleSwipe(dir: 1 | -1, source: InteractionSource) {
  if (!timerState || !bridge) return;
  const state = timerState.getState();
  const now = Date.now();
  const elapsed = now - lastSwipeTime;
  if (elapsed < SWIPE_COOLDOWN_MS) {
    pushDetailedLog('[INPUT]', `swipe ignored dir=${dir} elapsed=${elapsed}ms cooldown=${SWIPE_COOLDOWN_MS}ms`);
    return;
  }
  lastSwipeTime = now;
  const panel = effectivePanel();
  pushDetailedLog('[INPUT]', `swipe dir=${dir} accepted panel=${panel} state=${state} source=${source}`);

  if (state === TimerState.RUNNING || state === TimerState.PAUSED) {
    if (panel !== 'settings' && panel !== 'home') {
      pushDetailedLog('[INPUT]', `swipe ignored while active panel=${panel} source=${source}`);
      return;
    }
  }

  if (panel === 'home') {
    homeSelection = homeSelection === 'timer' ? 'settings' : 'timer';
    pushDetailedLog('[NAV]', `home selection=${homeSelection}`);
    updateRemoteView();
    sendToGlassesImmediate('manual');
    return;
  }

  if (panel === 'settings') {
    settingsField = dir === 1
      ? nextTimerLayoutField(settingsField)
      : previousTimerLayoutField(settingsField);
    pushDetailedLog('[LAYOUT]', `swipe field=${settingsField}`);
    updateRemoteView();
    sendToGlassesImmediate('manual');
    return;
  }

  const presetMinutes = activePresetMinutes();
  if (!presetMinutes.length) {
    if (dir === 1) timerState.cyclePreset(); else timerState.cyclePresetBackward();
    return;
  }

  const currentPreset = timerState.getSelectedPreset();
  const currentIndex = presetMinutes.indexOf(currentPreset);

  if (currentIndex >= 0) {
    const nextIndex = (currentIndex + (dir === 1 ? 1 : -1) + presetMinutes.length) % presetMinutes.length;
    timerState.setPreset(presetMinutes[nextIndex]);
    return;
  }

  timerState.setPreset(dir === 1 ? presetMinutes[0] : presetMinutes[presetMinutes.length - 1]);
}

// â”€â”€ Bootstrap â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function attachTimerStateCallbacks(): void {
  if (!timerState) return;

  timerState.setOnUpdate(() => {
    pushDetailedLog('[CALLBACK]', `onUpdate state=${timerState?.getState()} t=${timerState ? formatTime(timerState.getRemainingSeconds()) : '--:--'}`);
    updateRemoteView();
  });

  timerState.setOnStateChange(() => {
    const state = timerState?.getState();
    if (state !== TimerState.RUNNING) {
      clearRunningActionPrompt();
    }
    if (state === TimerState.RUNNING && lastKnownTimerState !== TimerState.RUNNING) {
      glassesPanel = 'timer';
      homeSelection = 'timer';
    }
    if (state === TimerState.DONE) {
      glassesPanel = 'timer';
      homeSelection = 'timer';
    }
    lastKnownTimerState = state ?? null;
    pushDetailedLog('[CALLBACK]', `onStateChange state=${state} t=${timerState ? formatTime(timerState.getRemainingSeconds()) : '--:--'}`);
    updateRemoteView();
    persistCurrentTimerState();
    if (state) {
      syncDisplayTickerWithState(state);
    }
    sendToGlassesImmediate('state');
  });
}

async function init() {
  try {
    pushDetailedLog('[APP]', 'init start');
    setUiDebugLogger((line) => pushDetailedLog('', line));
    resetPreviousTexts();
    attachPageLifecycleHandlers();
    attachRawEvenHubEventFallback();
    updateRemoteView();
    bridge = await waitForEvenAppBridge();
    pushDetailedLog('[APP]', `bridge received=${Boolean(bridge)}`);
    console.log('[Boot] Bridge received');
    attachRawEvenHubEventFallback();
    updateRemoteView();

    if (!bridge) {
      pushDetailedLog('[APP]', 'bridge unavailable');
      console.error('[Boot] Bridge not available');
      const s = document.getElementById('remote-status');
      if (s) { s.textContent = 'Connection unavailable'; s.className = 'status-pill error'; }
      committedPresetSettings = await loadTimerPresetSettings(null);
      pushDetailedLog('[PRESET]', `loaded local shortcuts=${activePresetMinutes().join('/')}`);
      timerState = new TimerStateManager();
      timerState.setOnDebugLog((line) => pushDetailedLog('', line));
      timerState.setDoneBlinkCount(committedLayoutSettings.doneBlinkCount);
      attachTimerStateCallbacks();
      lastKnownTimerState = timerState.getState();
      const restoredLocalTimerSnapshot = await loadTimerRuntimeSnapshot(null);
      if (restoredLocalTimerSnapshot) {
        timerState.restoreFromSnapshot(restoredLocalTimerSnapshot);
        glassesPanel = timerState.getState() === TimerState.RUNNING ? 'timer' : 'home';
        homeSelection = 'timer';
        lastKnownTimerState = timerState.getState();
        pushDetailedLog(
          '[STATE]',
          `restored local state=${timerState.getState()} preset=${timerState.getSelectedPreset()} remaining=${timerState.getRemainingSeconds()}s`,
        );
        persistCurrentTimerState();
      }
      setupRemoteControl();
      updateRemoteView();
      return;
    }

    committedLayoutSettings = await loadTimerLayoutSettings(bridge);
    committedPresetSettings = await loadTimerPresetSettings(bridge);
    pushDetailedLog(
      '[LAYOUT]',
      `loaded format=${committedLayoutSettings.format} vertical=${committedLayoutSettings.vertical} horizontal=${committedLayoutSettings.horizontal}`,
    );
    pushDetailedLog('[PRESET]', `loaded shortcuts=${activePresetMinutes().join('/')}`);

    timerState = new TimerStateManager();
    timerState.setOnDebugLog((line) => pushDetailedLog('', line));
    timerState.setDoneBlinkCount(committedLayoutSettings.doneBlinkCount);
    attachTimerStateCallbacks();
    lastKnownTimerState = timerState.getState();

    const restoredTimerSnapshot = await loadTimerRuntimeSnapshot(bridge);
    if (restoredTimerSnapshot) {
      timerState.restoreFromSnapshot(restoredTimerSnapshot);
      glassesPanel = timerState.getState() === TimerState.RUNNING ? 'timer' : 'home';
      homeSelection = 'timer';
      lastKnownTimerState = timerState.getState();
      pushDetailedLog(
        '[STATE]',
        `restored state=${timerState.getState()} preset=${timerState.getSelectedPreset()} remaining=${timerState.getRemainingSeconds()}s`,
      );
      persistCurrentTimerState();
    } else {
      pushDetailedLog('[STATE]', 'no persisted timer state found');
    }

    setupRemoteControl();

    const ok = await createPageContainers(
      bridge,
      timerState.getState(),
      timerState.getSelectedPreset(),
      timerState.getRemainingSeconds(),
      committedLayoutSettings,
      activePresetMinutes(),
      currentNavigationState(),
    );
    pushDetailedLog('[APP]', `createPageContainers ok=${ok}`);
    if (!ok) {
      console.error('Failed to create page containers');
      await renderUI(bridge, TimerState.IDLE, 5, 300, true, {
        debugMessage: 'ERROR: container creation failed',
        layoutSettings: committedLayoutSettings,
        navigation: currentNavigationState(),
        presetMinutes: activePresetMinutes(),
      });
      const s = document.getElementById('remote-status');
      if (s) { s.textContent = 'Display creation error'; s.className = 'status-pill error'; }
      return;
    }

    setupEventHandlers();
    await renderUI(bridge, timerState.getState(), timerState.getSelectedPreset(), timerState.getRemainingSeconds(), true, {
      layoutSettings: committedLayoutSettings,
      navigation: currentNavigationState(),
      presetMinutes: activePresetMinutes(),
    });
    pushDetailedLog('[APP]', 'initial render complete');
    syncDisplayTickerWithState(timerState.getState());
    isInitialized = true;
    updateRemoteView();
  } catch (err) {
    pushDetailedLog('[APP]', `init error ${String(err)}`);
    console.error('Failed to initialize:', err);
    const s = document.getElementById('remote-status');
    if (s) { s.textContent = `Error: ${err}`; s.className = 'status-pill error'; }
  }
}

window.addEventListener('beforeunload', () => {
  pushDetailedLog('[APP]', 'beforeunload');
  stopDisplayTicker();
  clearRemoteStartPending();
  persistCurrentTimerState();
  if (bridge && isInitialized) {
    try { bridge.shutDownPageContainer(0); } catch {}
  }
  setUiDebugLogger(null);
  timerState?.cleanup();
});

init();
