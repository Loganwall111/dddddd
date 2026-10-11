/**
 * THE MULTIVERSE — core/dom.js
 * ------------------------------------------------------------------
 * Tiny DOM helpers. Kept deliberately small: all "UI" in this game is
 * hand-authored markup in index.html plus these helpers, because a DOM
 * overlay is far cheaper and sharper than rendering text into WebGL.
 */

/** querySelector shorthand */
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

/**
 * Create an element.
 * el('div', { class: 'hud', text: 'hello', style: { top: '2px' } }, [child])
 */
export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value == null || value === false) continue;
    if (key === 'class' || key === 'className') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key === 'html') node.innerHTML = value;
    else if (key === 'style' && typeof value === 'object') Object.assign(node.style, value);
    else if (key === 'dataset' && typeof value === 'object') Object.assign(node.dataset, value);
    else if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2).toLowerCase(), value);
    else node.setAttribute(key, value === true ? '' : String(value));
  }
  for (const child of [].concat(children)) {
    if (child == null) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

/** addEventListener that returns an unsubscribe function */
export function on(target, type, fn, opts) {
  target.addEventListener(type, fn, opts);
  return () => target.removeEventListener(type, fn, opts);
}

/** requestAnimationFrame loop with elapsed/raw time and sane stop handle */
export function rafLoop(cb) {
  let handle = 0;
  let last = performance.now();
  let running = true;
  const tick = (now) => {
    if (!running) return;
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    cb(dt, now);
    handle = requestAnimationFrame(tick);
  };
  handle = requestAnimationFrame(tick);
  return {
    stop() {
      running = false;
      cancelAnimationFrame(handle);
    },
    get running() {
      return running;
    },
  };
}

/** Force a style flush (used to make CSS transitions fire on the same frame). */
export function reflow(node) {
  void node.offsetHeight;
}

export function setClass(node, name, enabled) {
  if (!node) return;
  node.classList.toggle(name, !!enabled);
}

/** Fade an element out, then run done(). */
export function fadeOut(node, ms = 400, done) {
  node.style.transition = `opacity ${ms}ms ease`;
  node.style.opacity = '0';
  setTimeout(() => {
    node.style.pointerEvents = 'none';
    done?.();
  }, ms);
}

export function fadeIn(node, ms = 400) {
  node.style.transition = `opacity ${ms}ms ease`;
  node.style.opacity = '1';
}

/** Typewriter effect used for the Archivist's commentary. */
export function typewriter(node, text, { cps = 42, onDone } = {}) {
  let i = 0;
  let cancelled = false;
  node.textContent = '';
  const step = () => {
    if (cancelled) return;
    const chunk = Math.max(1, Math.round(cps / 20));
    i = Math.min(text.length, i + chunk);
    node.textContent = text.slice(0, i);
    if (i < text.length) requestAnimationFrame(step);
    else onDone?.();
  };
  requestAnimationFrame(step);
  return () => {
    cancelled = true;
  };
}

/** Human-readable formatting for large numbers (used in the codex). */
export function bigNumber(n) {
  if (n >= 1e12) return `${(n / 1e12).toFixed(1)}×10¹²`;
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}×10⁹`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}×10⁶`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}k`;
  return String(Math.round(n));
}

/** Screen-space helper: is the element visible? */
export function isVisible(node) {
  return !!node && (node.offsetWidth > 0 || node.offsetHeight > 0) && getComputedStyle(node).display !== 'none';
}

export const prefersReducedMotion = () =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
