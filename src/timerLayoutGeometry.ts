import type { TimerLayoutSettings } from './layoutSettings';

export const DISPLAY_WIDTH = 576;
export const DISPLAY_HEIGHT = 288;

const DIGIT_SCALE = 10;
const DIGIT_BASE_WIDTH = 5;
const DIGIT_BASE_HEIGHT = 7;
const COLON_BASE_WIDTH = 3;
const MAX_MINUTE_DIGITS = 3;
const MINUTE_DIGIT_GAP = 1;
const MINUTE_COLON_GAP = 1;
const TIMER_GROUP_GAP = 10;

export const DIGIT_HEIGHT = DIGIT_BASE_HEIGHT * DIGIT_SCALE;
export const LARGE_DIGIT_STEP = (DIGIT_BASE_WIDTH + MINUTE_DIGIT_GAP) * DIGIT_SCALE;
export const SS_WIDTH = (DIGIT_BASE_WIDTH + 1 + DIGIT_BASE_WIDTH) * DIGIT_SCALE;
export const LARGE_TIMER_MARGIN_X = 0;
export const LARGE_TIMER_MARGIN_Y = 20;
export const COMPACT_TIMER_MARGIN_X = 0;
export const COMPACT_TIMER_MARGIN_Y = 0;
export const COMPACT_TIMER_WIDTH = 200;
export const COMPACT_TIMER_EDGE_MIN_WIDTH = 140;
export const COMPACT_TIMER_EDGE_CHAR_WIDTH = 28;
export const COMPACT_TIMER_EDGE_EXTRA_WIDTH = 20;
export const COMPACT_TIMER_HEIGHT = 70;
export const TIMER_SS_GAP = TIMER_GROUP_GAP;

type Horizontal = TimerLayoutSettings['horizontal'];
type Vertical = TimerLayoutSettings['vertical'];
type LayoutAxes = Pick<TimerLayoutSettings, 'horizontal' | 'vertical'>;

export interface TimerBoxLayout {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LargeTimerLayout extends TimerBoxLayout {
  minuteGroupWidth: number;
}

export interface PreviewAnchor {
  leftPercent: number;
  topPercent: number;
  widthPercent: number;
  heightPercent: number;
  transform: string;
}

export function alignHorizontal(horizontal: Horizontal, width: number, margin: number): number {
  if (horizontal === 'left') return margin;
  if (horizontal === 'right') return DISPLAY_WIDTH - width - margin;
  return Math.floor((DISPLAY_WIDTH - width) / 2);
}

export function alignVertical(vertical: Vertical, height: number, margin: number): number {
  if (vertical === 'top') return margin;
  if (vertical === 'mid') return Math.floor((DISPLAY_HEIGHT - height) / 2);
  if (vertical === 'center') return DISPLAY_HEIGHT - height - margin;
  return margin;
}

export function normalizeLargeMinuteText(minutesText: string): string {
  const trimmed = minutesText.trim();
  return (trimmed || '0').slice(-MAX_MINUTE_DIGITS);
}

export function getLargeMinuteDigitCount(minutesText: string): number {
  return normalizeLargeMinuteText(minutesText).length;
}

export function getLargeMinuteGroupWidth(minutesText: string): number {
  const digitCount = getLargeMinuteDigitCount(minutesText);

  return (
    DIGIT_BASE_WIDTH * digitCount +
    MINUTE_DIGIT_GAP * Math.max(0, digitCount - 1) +
    MINUTE_COLON_GAP +
    COLON_BASE_WIDTH
  ) * DIGIT_SCALE;
}

export function getLargeTimerLayout(settings: LayoutAxes, minutesText: string): LargeTimerLayout {
  const minuteGroupWidth = getLargeMinuteGroupWidth(minutesText);
  const width = minuteGroupWidth + TIMER_GROUP_GAP + SS_WIDTH;

  return {
    x: alignHorizontal(settings.horizontal, width, LARGE_TIMER_MARGIN_X),
    y: alignVertical(settings.vertical, DIGIT_HEIGHT, LARGE_TIMER_MARGIN_Y),
    width,
    height: DIGIT_HEIGHT,
    minuteGroupWidth,
  };
}

export function estimateCompactTimerWidth(content: string): number {
  const visibleContent = content.trim();
  if (!visibleContent) {
    return COMPACT_TIMER_EDGE_MIN_WIDTH;
  }

  return Math.max(
    COMPACT_TIMER_EDGE_MIN_WIDTH,
    visibleContent.length * COMPACT_TIMER_EDGE_CHAR_WIDTH + COMPACT_TIMER_EDGE_EXTRA_WIDTH,
  );
}

export function getCompactTimerWidth(horizontal: Horizontal, content: string): number {
  return horizontal === 'center' ? COMPACT_TIMER_WIDTH : estimateCompactTimerWidth(content);
}

export function alignCompactHorizontal(horizontal: Horizontal, content: string): number {
  const compactWidth = getCompactTimerWidth(horizontal, content);
  return alignHorizontal(horizontal, compactWidth, COMPACT_TIMER_MARGIN_X);
}

export function getCompactTimerLayout(settings: LayoutAxes, content: string): TimerBoxLayout {
  const width = getCompactTimerWidth(settings.horizontal, content);

  return {
    x: alignCompactHorizontal(settings.horizontal, content),
    y: alignVertical(settings.vertical, COMPACT_TIMER_HEIGHT, COMPACT_TIMER_MARGIN_Y),
    width,
    height: COMPACT_TIMER_HEIGHT,
  };
}

export function getPreviewAnchor(settings: TimerLayoutSettings, timeText: string): PreviewAnchor {
  const [minutesText = '00'] = timeText.split(':');
  const layout = settings.format === 'large'
    ? getLargeTimerLayout(settings, minutesText)
    : getCompactTimerLayout(settings, timeText);

  const leftPx = settings.horizontal === 'left'
    ? layout.x
    : settings.horizontal === 'center'
      ? layout.x + layout.width / 2
      : layout.x + layout.width;

  const topPx = settings.vertical === 'top'
    ? layout.y
    : settings.vertical === 'mid'
      ? layout.y + layout.height / 2
      : layout.y + layout.height;

  const translateX = settings.horizontal === 'left' ? '0%' : settings.horizontal === 'center' ? '-50%' : '-100%';
  const translateY = settings.vertical === 'top' ? '0%' : settings.vertical === 'mid' ? '-50%' : '-100%';

  return {
    leftPercent: (leftPx / DISPLAY_WIDTH) * 100,
    topPercent: (topPx / DISPLAY_HEIGHT) * 100,
    widthPercent: (layout.width / DISPLAY_WIDTH) * 100,
    heightPercent: (layout.height / DISPLAY_HEIGHT) * 100,
    transform: `translate(${translateX}, ${translateY})`,
  };
}
