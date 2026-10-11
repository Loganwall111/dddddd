/**
 * THE MULTIVERSE: SIMOLYSIS — src/main.js
 * ==================================================================
 * The entry point. Its entire job is to get out of the way:
 *   1. find the canvas,
 *   2. construct the Game,
 *   3. boot it, catching the failures that would otherwise be a blank page,
 *   4. expose a small debug handle for the console.
 */
import { Game } from './game.js';

const root = document.getElementById('ui-root') ?? document.body;
const canvas = document.getElementById('game-canvas');

/* ------------------------------------------------------------------ *
 * Telemetry
 * ------------------------------------------------------------------
 * The build sandbox has no GPU, so the first time this code actually runs is
 * in a real browser. A quiet beacon reports errors and phase changes back to
 * the preview server, which logs them, so a failure is diagnosable instead of
 * being a black rectangle.
 * ------------------------------------------------------------------ */

const diag = {
  queue: [],
  sent: false,
  report(kind, payload) {
    try {
      const line = JSON.stringify({ kind, ...payload });
      diag.queue.push(line);
      if (diag.queue.length > 40) diag.queue.shift();
      if (diag.sent) return;
      diag.sent = true;
      queueMicrotask(() => {
        const body = diag.queue.join('\n');
        diag.sent = false;
        fetch('/__diag', { method: 'POST', body, keepalive: true }).catch(() => {
          diag.sent = false;
        });
      });
    } catch {
      /* telemetry must never break the game */
    }
  },
  watch(game) {
    window.addEventListener('error', (event) => {
      diag.report('error', {
        message: event.message,
        source: `${event.filename ?? '?'}:${event.lineno ?? 0}:${event.colno ?? 0}`,
        phase: game?.phase,
        stack: (event.error?.stack ?? '').split('\n').slice(1, 4).join(' | '),
      });
    });
    window.addEventListener('unhandledrejection', (event) => {
      diag.report('rejection', {
        message: String(event.reason?.message ?? event.reason),
        phase: game?.phase,
        stack: (event.reason?.stack ?? '').split('\n').slice(1, 4).join(' | '),
      });
    });

    // Phase transitions and the loading step, so a stall is visible as a stall.
    let lastPhase = null;
    let lastStep = null;
    const timer = setInterval(() => {
      if (!game) return;
      if (game.phase !== lastPhase) {
        lastPhase = game.phase;
        diag.report('phase', { phase: lastPhase, step: game.loading?.label ?? null });
      }
      const step = game.loading?.label ?? null;
      if (step && step !== lastStep) {
        lastStep = step;
        diag.report('loading', { step });
      }
    }, 700);
    window.__MV_DIAG_TIMER__ = timer;
    window.clearMultiverseTelemetry = () => clearInterval(timer);
  },
};

if (typeof __BUILD_TIME__ !== 'undefined') {
  window.__MV_BUILD__ = __BUILD_TIME__;
}

function fatal(error) {
  console.error('[multiverse] fatal', error);
  const node = document.createElement('div');
  node.className = 'fatal-error';
  node.innerHTML = `
    <h1>THE MACHINE HIT A LIMIT</h1>
    <p>${escapeHtml(error?.message ?? String(error))}</p>
    <pre>${escapeHtml((error?.stack ?? '').split('\n').slice(0, 6).join('\n'))}</pre>
    <p class="fatal-hint">
      This game needs WebGL 2 and a reasonably modern browser. If the problem persists,
      try a lower quality preset by adding <code>?quality=low</code> to the URL.
    </p>
  `;
  root.appendChild(node);
}

function escapeHtml(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

async function main() {
  if (!canvas) {
    const error = new Error('No #game-canvas element found. The page is not assembled correctly.');
    diag.report('boot-failure', { message: error.message, stage: 'canvas' });
    fatal(error);
    return;
  }

  // A tiny capability check, so the error is friendly instead of a black page.
  try {
    const probe = document.createElement('canvas');
    const gl = probe.getContext('webgl2') || probe.getContext('webgl');
    if (!gl) throw new Error('WebGL is unavailable in this browser or is blocked by the GPU blacklist.');
    const lose = gl.getExtension('WEBGL_lose_context');
    lose?.loseContext();
  } catch (error) {
    diag.report('boot-failure', {
      message: error?.message ?? String(error),
      stage: 'webgl-probe',
      userAgent: navigator.userAgent,
    });
    fatal(error);
    return;
  }

  const game = new Game({ canvas, root });
  window.game = game;
  window.MULTIVERSE = game;
  diag.watch(game);
  diag.report('boot', {
    build: window.__MV_BUILD__ ?? 'unknown',
    webgl: '2',
    userAgent: navigator.userAgent,
    cores: navigator.hardwareConcurrency ?? null,
    memory: navigator.deviceMemory ?? null,
    dpr: window.devicePixelRatio,
  });

  // Quality can be forced from the URL: ?quality=ultra, ?quality=potato
  const params = new URLSearchParams(window.location?.search ?? '');
  const forcedQuality = params.get('quality');
  const forcedSeed = params.get('seed');
  if (forcedSeed) game.seedOverride = Number(forcedSeed) || undefined;

  try {
    await game.boot();
    if (forcedQuality) {
      game.settings.patch({ quality: forcedQuality });
      game.applySettings();
    }
  } catch (error) {
    diag.report('boot-failure', { message: error?.message ?? String(error), stack: (error?.stack ?? '').split('\n').slice(0, 5).join(' | ') });
    fatal(error);
  }
}

main();
