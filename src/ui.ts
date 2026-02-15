import {
  PRESETS,
  TimerState,
} from './constants';
import { StartUpPageCreateResult } from '@evenrealities/even_hub_sdk';

/* ─── helpers ─────────────────────────────────────────────────────────── */

export function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function formatPresetRow(selectedPreset: number): string {
  return PRESETS.map(p => (p === selectedPreset ? `[${p}]` : `${p}`)).join(' ');
}

export function getStatusText(state: TimerState): string { return state; }

export function getTextMetrics(text: string) {
  return { contentLength: text.length, contentOffset: 0 };
}

export function createStatusIcon(_s: TimerState): Uint8Array | null { return null; }

export function resetPreviousTexts(): void {}

/* ─── module state ────────────────────────────────────────────────────── */

let currentScreenType: 'preset' | 'timer' | null = null;
let imageUpdateInProgress = false;

// Reusable canvas – avoids DOM / GC churn on every tick
let _canvas: HTMLCanvasElement | null = null;
let _ctx: CanvasRenderingContext2D | null = null;

function getCtx(): CanvasRenderingContext2D | null {
  if (!_canvas) {
    _canvas = document.createElement('canvas');
    _canvas.width = 200;
    _canvas.height = 100;
    _ctx = _canvas.getContext('2d');
  }
  return _ctx;
}

/* ─── preset content builder ──────────────────────────────────────────── */

function buildPresetContent(selectedPreset: number): string {
  const col1 = [1, 3, 5, 10];
  const col2 = [15, 30, 60];
  const fmt = (p: number, sel: boolean) => (sel ? `> ${p} <` : `  ${p}  `);
  const lines: string[] = [];
  for (let i = 0; i < Math.max(col1.length, col2.length); i++) {
    const l = i < col1.length ? fmt(col1[i], col1[i] === selectedPreset) : '        ';
    const r = i < col2.length ? fmt(col2[i], col2[i] === selectedPreset) : '        ';
    lines.push(`${l}    ${r}`);
  }
  return `Scegli minuti\n\n${lines.join('\n')}\n\nSwipe: cambia  Tap: avvia`;
}

/* ─── canvas → base64 PNG (cached canvas, zero logs) ─────────────────── */

function renderTimerImage(seconds: number, status?: string): string {
  const c = getCtx();
  if (!c || !_canvas) return '';
  const W = _canvas.width, H = _canvas.height;

  // Black = transparent on G2 (no LED light)
  c.fillStyle = '#000';
  c.fillRect(0, 0, W, H);

  // White = visible on G2 (green LED)
  c.fillStyle = '#FFF';
  c.textAlign = 'center';
  c.textBaseline = 'middle';

  const time = formatTime(seconds);
  if (status) {
    c.font = 'bold 60px monospace';
    c.fillText(time, W / 2, 38);
    c.font = 'bold 18px monospace';
    c.fillText(status, W / 2, 80);
  } else {
    c.font = 'bold 72px monospace';
    c.fillText(time, W / 2, H / 2 + 2);
  }

  return _canvas.toDataURL('image/png');
}

/* ─── dataURL → Uint8Array (smaller over BLE than base64 string) ──── */

function toBytes(dataURL: string): Uint8Array | string {
  try {
    const b64 = dataURL.split(',')[1] || dataURL;
    const bin = atob(b64);
    const u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    return u8;
  } catch {
    return dataURL;
  }
}

/* ─── low-level SDK wrappers (zero console.log in hot path) ──────────── */

function pushText(bridge: any, content: string) {
  const m = getTextMetrics(content);
  bridge.textContainerUpgrade({
    containerID: 1,
    containerName: 'timer-main',
    content,
    contentLength: m.contentLength,
    contentOffset: m.contentOffset,
  });
}

/**
 * Fire-and-forget image push.
 * Respects the SDK rule "one image at a time" via the imageUpdateInProgress guard.
 * If a previous transfer is still in flight the call is silently skipped –
 * the next tick (1 s later) will pick up the latest time.
 */
function pushImage(bridge: any, seconds: number, status?: string) {
  if (imageUpdateInProgress) return;
  imageUpdateInProgress = true;

  const url = renderTimerImage(seconds, status);
  if (!url) { imageUpdateInProgress = false; return; }

  bridge.updateImageRawData({
    containerID: 2,
    containerName: 'timer-img',
    imageData: toBytes(url),
  })
    .then(() => { imageUpdateInProgress = false; })
    .catch(() => { imageUpdateInProgress = false; });
}

/** Send a tiny 1×1 black pixel to "erase" the image container quickly. */
function clearImage(bridge: any) {
  const tiny = document.createElement('canvas');
  tiny.width = 1; tiny.height = 1;
  const x = tiny.getContext('2d');
  if (!x) return;
  x.fillStyle = '#000';
  x.fillRect(0, 0, 1, 1);
  bridge.updateImageRawData({
    containerID: 2,
    containerName: 'timer-img',
    imageData: toBytes(tiny.toDataURL('image/png')),
  }).catch(() => {});
}

/* ─── public renderUI dispatcher ──────────────────────────────────────── */

export async function renderUI(
  bridge: any,
  state: TimerState,
  selectedPreset: number,
  remainingSeconds: number,
  isBlinkingVisible = true,
  debugMessage?: string,
): Promise<void> {
  if (!bridge) return;

  try {
    if (debugMessage) { pushText(bridge, debugMessage); return; }

    /* ── IDLE → show preset selection ── */
    if (state === TimerState.IDLE) {
      pushText(bridge, buildPresetContent(selectedPreset));
      // Clear the timer image so old digits don't bleed through
      if (currentScreenType === 'timer') clearImage(bridge);
      currentScreenType = 'preset';
      return;
    }

    /* ── RUNNING / PAUSED / DONE → show timer ── */
    let imgStatus: string | undefined;
    // Use a single space so no visible text appears behind the image
    let txt = ' ';

    if (state === TimerState.PAUSED) {
      imgStatus = 'PAUSED';
      // Push status text below the image area (8 newlines ≈ 160 px)
      txt = '\n\n\n\n\n\n\n\n       PAUSED';
    } else if (state === TimerState.DONE && isBlinkingVisible) {
      imgStatus = 'COMPLETATO';
      txt = '\n\n\n\n\n\n\n\n     COMPLETATO';
    }

    pushText(bridge, txt);
    pushImage(bridge, remainingSeconds, imgStatus);
    currentScreenType = 'timer';
  } catch (e) {
    console.error('renderUI error:', e);
  }
}

/* ─── initial container creation ──────────────────────────────────────── */

/**
 * Creates BOTH the text container AND the image container at startup.
 * This way we NEVER need rebuildPageContainer – switching between preset
 * and timer screens is just a matter of updating existing containers,
 * which is dramatically faster over BLE.
 */
export async function createPageContainers(
  bridge: any,
  selectedPreset = 5,
): Promise<boolean> {
  if (!bridge) return false;

  try {
    const content = buildPresetContent(selectedPreset);

    const textContainer: any = {
      xPosition: 0,
      yPosition: 0,
      width: 576,
      height: 288,
      borderWidth: 0,
      borderColor: 0,
      paddingLength: 20,
      containerID: 1,
      containerName: 'timer-main',
      content,
      isEventCapture: 1,
    };

    // Image container – centred on screen (200×100 is the SDK max)
    // At startup it has no data → shows black → transparent on G2
    const imageContainer: any = {
      xPosition: 188,   // (576 − 200) / 2
      yPosition: 40,
      width: 200,
      height: 100,
      borderWidth: 0,
      borderColor: 0,
      containerID: 2,
      containerName: 'timer-img',
    };

    console.log('[Boot] Creating containers (text + image)…');
    const result = await bridge.createStartUpPageContainer({
      containerTotalNum: 2,
      textObject: [textContainer],
      imageObject: [imageContainer],
    });
    console.log('[Boot] Result:', result);

    const ok =
      result === StartUpPageCreateResult.success ||
      result === 0 ||
      result === 1 ||
      result === 'success';

    if (ok) {
      console.log('[Boot] Containers created OK');
      currentScreenType = 'preset';
    } else {
      console.error('[Boot] Container creation failed:', result);
    }

    return ok;
  } catch (e) {
    console.error('createPageContainers error:', e);
    return false;
  }
}
