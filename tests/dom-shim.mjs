/**
 * A very small DOM stub.
 * ==================================================================
 * The engine modules are written so their simulations can be stepped in
 * Node — there is no GPU in the sandbox and no headless browser to borrow,
 * so the only way to prove the controller, the loop and the input system
 * behave is to run them here. This module installs just enough of the
 * browser surface for those modules to construct themselves.
 *
 * It is deliberately *not* a renderer: canvas 2D and WebGL stay null, so any
 * test that reaches for pixels will fail loudly rather than silently pass.
 */

function noop() {}

function makeClassList() {
  const set = new Set();
  return {
    add: (...names) => names.forEach((n) => set.add(n)),
    remove: (...names) => names.forEach((n) => set.delete(n)),
    toggle: (name, force) => {
      const on = force === undefined ? !set.has(name) : !!force;
      if (on) set.add(name);
      else set.delete(name);
      return on;
    },
    contains: (name) => set.has(name),
    get length() {
      return set.size;
    },
  };
}

/**
 * A WebGL 2 context made of promises and good intentions.
 *
 * It cannot draw and it cannot compile a shader, but it answers every query
 * three makes during construction — capabilities, precision, extension
 * presence, link status, framebuffer completeness — which is the difference
 * between "the renderer cannot be built" and "the rest of the game can be
 * built and stepped". That is exactly the surface a headless test can
 * honestly exercise, and it lets the builder catch real mistakes in the code
 * that arranges the world.
 *
 * Anything that would need a driver is a no-op, and the constants are stubbed
 * with stable unique numbers derived from their names, so three's symbolic
 * comparisons still behave.
 */
export function makeGLStub(canvas) {
  const constantValues = new Map();
  const constantNames = new Map();
  let nextConstant = 0x1000;

  const constFor = (name) => {
    if (!constantValues.has(name)) {
      const value = nextConstant++;
      constantValues.set(name, value);
      constantNames.set(value, name);
      constantNames.set(value >>> 0, name);
    }
    return constantValues.get(name);
  };

  const nameOf = (value) => constantNames.get(value) ?? constantNames.get(value >>> 0) ?? '';

  const gl = {
    canvas,
    drawingBufferWidth: canvas.width,
    drawingBufferHeight: canvas.height,

    // --- capability queries -------------------------------------------------
    getParameter: (pname) => {
      const name = nameOf(pname);
      if (/VERSION|VENDOR|RENDERER/i.test(name)) {
        if (/SHADING_LANGUAGE/.test(name)) return 'WebGL GLSL ES 3.00 (stub)';
        if (/VERSION/.test(name)) return 'WebGL 2.0 (stub)';
        if (/VENDOR/.test(name)) return 'the multiverse';
        return 'stub renderer';
      }
      if (/DIMS|SCISSOR_BOX|VIEWPORT/i.test(name)) return new Int32Array([0, 0, canvas.width, canvas.height]);
      if (/COLOR_CLEAR_VALUE/.test(name)) return new Float32Array([0, 0, 0, 0]);
      if (/ACTIVE_|COMPRESSED/i.test(name)) return 0;
      if (/SAMPLES/.test(name)) return 4;
      if (/MAX_VIEWPORT_DIMS/.test(name)) return new Int32Array([16384, 16384]);
      return 16384;
    },
    getExtension: (name) => {
      if (name === 'WEBGL_lose_context') return { loseContext() {}, restoreContext() {} };
      if (name === 'EXT_texture_filter_anisotropic') {
        return { MAX_TEXTURE_MAX_ANISOTROPY_EXT: constFor('MAX_TEXTURE_MAX_ANISOTROPY_EXT'), TEXTURE_MAX_ANISOTROPY_EXT: constFor('TEXTURE_MAX_ANISOTROPY_EXT') };
      }
      if (name === 'WEBGL_debug_renderer_info') {
        return { UNMASKED_VENDOR_WEBGL: constFor('UNMASKED_VENDOR_WEBGL'), UNMASKED_RENDERER_WEBGL: constFor('UNMASKED_RENDERER_WEBGL') };
      }
      if (name === 'OES_texture_float_linear' || name === 'EXT_color_buffer_float' || name === 'EXT_color_buffer_half_float') return {};
      return null;
    },
    getSupportedExtensions: () => ['EXT_color_buffer_float', 'OES_texture_float_linear'],
    getShaderPrecisionFormat: () => ({ precision: 23, rangeMin: 127, rangeMax: 127 }),

    // --- creation -----------------------------------------------------------
    createShader: () => ({}),
    createProgram: () => ({}),
    createBuffer: () => ({}),
    createTexture: () => ({}),
    createFramebuffer: () => ({}),
    createRenderbuffer: () => ({}),
    createVertexArray: () => ({}),
    createQuery: () => ({}),
    createSampler: () => ({}),
    createTransformFeedback: () => ({}),

    // --- compilation --------------------------------------------------------
    getShaderParameter: () => true,
    getProgramParameter: (program, pname) => {
      const name = nameOf(pname);
      if (/LINK_STATUS|VALIDATE_STATUS/.test(name)) return true;
      if (/ACTIVE_|ATTACHED_/.test(name)) return 0;
      if (/DELETE_STATUS/.test(name)) return false;
      return 0;
    },
    getShaderInfoLog: () => '',
    getProgramInfoLog: () => '',
    getShaderSource: () => '',
    getActiveUniform: () => null,
    getActiveAttrib: () => null,
    getUniformLocation: () => ({}),
    getAttribLocation: () => 0,
    getUniformBlockIndex: () => 0,
    getActiveUniformBlockParameter: () => 0,
    getActiveUniformBlockName: () => 'block',
    checkFramebufferStatus: () => constFor('FRAMEBUFFER_COMPLETE'),
    isContextLost: () => false,
    getError: () => 0,
    getContextAttributes: () => ({ alpha: false, antialias: false, depth: true, stencil: false, powerPreference: 'high-performance' }),
    readPixels: () => {},
  };

  // Everything else — the long tail of GL calls three makes while drawing —
  // becomes a no-op, and every constant becomes a stable unique number.
  return new Proxy(gl, {
    get(target, prop) {
      if (prop in target) return target[prop];
      if (typeof prop !== 'string') return undefined;
      if (/^[A-Z][A-Z0-9_]*$/.test(prop)) return constFor(prop);
      if (/^[a-z]/.test(prop)) return () => undefined;
      return undefined;
    },
    has: () => true,
  });
}

/**
 * A 2D context that keeps its pixels but draws nothing.
 *
 * The texture library is real code producing real ImageData, and it is one of
 * the largest untested surfaces in the project. Giving it a canvas that
 * accepts drawing calls means the whole generator runs — every noise field,
 * every normal map — and any mistake in it throws here rather than showing up
 * as an ugly texture in the browser.
 */
export function makeContext2D(canvas) {
  const context = {
    canvas,
    fillStyle: '#000',
    strokeStyle: '#000',
    globalAlpha: 1,
    globalCompositeOperation: 'source-over',
    lineWidth: 1,
    lineCap: 'butt',
    lineJoin: 'miter',
    miterLimit: 10,
    font: '10px sans-serif',
    textAlign: 'start',
    textBaseline: 'alphabetic',
    filter: 'none',
    shadowBlur: 0,
    shadowColor: '#000',
    shadowOffsetX: 0,
    shadowOffsetY: 0,
    imageSmoothingEnabled: true,
    imageSmoothingQuality: 'low',
    save: noop,
    restore: noop,
    translate: noop,
    rotate: noop,
    scale: noop,
    transform: noop,
    setTransform: noop,
    resetTransform: noop,
    beginPath: noop,
    closePath: noop,
    moveTo: noop,
    lineTo: noop,
    arc: noop,
    arcTo: noop,
    bezierCurveTo: noop,
    quadraticCurveTo: noop,
    rect: noop,
    roundRect: noop,
    ellipsis: noop,
    fill: noop,
    stroke: noop,
    clip: noop,
    fillRect: noop,
    strokeRect: noop,
    clearRect: noop,
    fillText: noop,
    strokeText: noop,
    measureText: (text) => ({ width: String(text).length * 6, actualBoundingBoxAscent: 8, actualBoundingBoxDescent: 2 }),
    drawImage: noop,
    setLineDash: noop,
    getLineDash: () => [],
    isPointInPath: () => false,
    isPointInStroke: () => false,
    createLinearGradient: () => ({ addColorStop: noop }),
    createRadialGradient: () => ({ addColorStop: noop }),
    createConicGradient: () => ({ addColorStop: noop }),
    createPattern: () => null,
    createImageData: (width, height) => {
      const w = Math.max(1, Math.round(width?.width ?? width ?? 1));
      const h = Math.max(1, Math.round(width?.height ?? height ?? 1));
      return { width: w, height: h, data: new Uint8ClampedArray(w * h * 4), colorSpace: 'srgb' };
    },
    getImageData: (x, y, width, height) => ({
      width: Math.max(1, Math.round(width)),
      height: Math.max(1, Math.round(height)),
      data: new Uint8ClampedArray(Math.max(1, Math.round(width)) * Math.max(1, Math.round(height)) * 4),
      colorSpace: 'srgb',
    }),
    putImageData: noop,
    drawFocusIfNeeded: noop,
  };
  return context;
}

function makeElement(tag = 'div') {
  const children = [];
  const attributes = new Map();
  const style = {
    setProperty(name, value) {
      this[name] = value;
    },
    removeProperty(name) {
      delete this[name];
    },
  };
  const element = {
    tagName: String(tag).toUpperCase(),
    nodeType: 1,
    children,
    childNodes: children,
    parentNode: null,
    style,
    dataset: {},
    classList: makeClassList(),
    textContent: '',
    innerHTML: '',
    value: '',
    width: 1280,
    height: 720,
    clientWidth: 1280,
    clientHeight: 720,
    offsetWidth: 1280,
    offsetHeight: 720,
    addEventListener: noop,
    removeEventListener: noop,
    dispatchEvent: () => true,
    appendChild(child) {
      children.push(child);
      if (child) child.parentNode = element;
      return child;
    },
    append(...nodes) {
      nodes.forEach((n) => element.appendChild(n));
    },
    removeChild(child) {
      const index = children.indexOf(child);
      if (index >= 0) children.splice(index, 1);
      return child;
    },
    remove() {
      if (element.parentNode?.children) {
        const index = element.parentNode.children.indexOf(element);
        if (index >= 0) element.parentNode.children.splice(index, 1);
      }
      element.parentNode = null;
    },
    insertBefore: (child) => child,
    replaceChildren: (...nodes) => {
      children.length = 0;
      nodes.forEach((n) => element.appendChild(n));
    },
    get firstChild() {
      return children[0] ?? null;
    },
    get lastChild() {
      return children[children.length - 1] ?? null;
    },
    get firstElementChild() {
      return children.find((child) => child?.nodeType === 1) ?? null;
    },
    get lastElementChild() {
      return [...children].reverse().find((child) => child?.nodeType === 1) ?? null;
    },
    querySelector: () => null,
    querySelectorAll: () => [],
    getContext: (kind) => {
      if (kind === '2d') {
        element.__ctx2d ??= makeContext2D(element);
        return element.__ctx2d;
      }
      if (kind === 'webgl2' || kind === 'webgl' || kind === 'experimental-webgl') {
        element.__gl ??= makeGLStub(element);
        return element.__gl;
      }
      return null;
    },
    toDataURL: () => 'data:image/png;base64,',
    toBlob: (callback) => callback?.(null),
    setAttribute(name, value) {
      attributes.set(name, String(value));
    },
    getAttribute: (name) => (attributes.has(name) ? attributes.get(name) : null),
    removeAttribute: (name) => attributes.delete(name),
    hasAttribute: (name) => attributes.has(name),
    setPointerCapture: noop,
    releasePointerCapture: noop,
    requestPointerLock: noop,
    exitPointerLock: noop,
    focus: noop,
    blur: noop,
    click: noop,
    scrollIntoView: noop,
    getBoundingClientRect: () => ({ x: 0, y: 0, top: 0, left: 0, right: 1280, bottom: 720, width: 1280, height: 720 }),
  };
  return element;
}

/**
 * Run the frames a page has asked for. Returns the number that ran.
 * Errors thrown inside a frame callback are collected on
 * `globalThis.__rafErrors` so a test can assert on them.
 */
export function flushFrames(count = 1) {
  globalThis.__rafErrors = globalThis.__rafErrors ?? [];
  let ran = 0;
  for (let i = 0; i < count; i++) {
    const pending = globalThis.__rafQueue;
    if (!pending.length) break;
    globalThis.__rafQueue = [];
    for (const fn of pending) {
      ran++;
      try {
        fn(performance.now());
      } catch (error) {
        globalThis.__rafErrors.push(error);
      }
    }
  }
  return ran;
}

export function installDomShim() {
  if (globalThis.__MV_DOM_SHIM__) return globalThis.window;
  globalThis.__MV_DOM_SHIM__ = true;

  // Frames are queued rather than fired: a test decides when time advances,
  // so a boot sequence that awaits frames can be stepped deterministically and
  // nothing keeps the event loop alive once the test is done.
  globalThis.__rafQueue = [];
  globalThis.__rafId = 1;
  globalThis.requestAnimationFrame = (fn) => {
    globalThis.__rafQueue.push(fn);
    globalThis.__raf = fn;
    return globalThis.__rafId++;
  };
  globalThis.cancelAnimationFrame = noop;
  globalThis.performance = globalThis.performance ?? { now: () => Date.now() };

  const body = makeElement('body');
  const documentElement = makeElement('html');
  documentElement.appendChild(body);

  globalThis.window = {
    addEventListener: noop,
    removeEventListener: noop,
    innerWidth: 1280,
    innerHeight: 720,
    devicePixelRatio: 1,
    matchMedia: (query) => ({
      matches: false,
      media: query,
      addEventListener: noop,
      removeEventListener: noop,
      addListener: noop,
      removeListener: noop,
    }),
    requestAnimationFrame: globalThis.requestAnimationFrame,
    cancelAnimationFrame: noop,
    location: { href: 'http://localhost/', search: '', hash: '' },
    navigator: undefined,
  };

  globalThis.location = globalThis.window.location;
  globalThis.history = globalThis.history ?? { pushState: noop, replaceState: noop, state: null };

  globalThis.document = {
    documentElement,
    body,
    hidden: false,
    visibilityState: 'visible',
    pointerLockElement: null,
    fullscreenElement: null,
    activeElement: body,
    createElement: (tag) => makeElement(tag),
    createElementNS: (_ns, tag) => makeElement(tag),
    createTextNode: (text) => ({ nodeType: 3, textContent: text }),
    createDocumentFragment: () => makeElement('fragment'),
    getElementById: () => null,
    get firstChild() {
      return children[0] ?? null;
    },
    get lastChild() {
      return children[children.length - 1] ?? null;
    },
    get firstElementChild() {
      return children.find((child) => child?.nodeType === 1) ?? null;
    },
    get lastElementChild() {
      return [...children].reverse().find((child) => child?.nodeType === 1) ?? null;
    },
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener: noop,
    removeEventListener: noop,
    exitPointerLock: noop,
    exitFullscreen: () => Promise.resolve(),
    documentElement: documentElement,
  };

  if (!globalThis.navigator?.getGamepads) {
    Object.defineProperty(globalThis, 'navigator', {
      value: { getGamepads: () => [], userAgent: 'node', maxTouchPoints: 0, language: 'en' },
      configurable: true,
      writable: true,
    });
  }

  globalThis.localStorage = globalThis.localStorage ?? {
    _data: new Map(),
    getItem(key) {
      return this._data.has(key) ? this._data.get(key) : null;
    },
    setItem(key, value) {
      this._data.set(key, String(value));
    },
    removeItem(key) {
      this._data.delete(key);
    },
    clear() {
      this._data.clear();
    },
    key(index) {
      return Array.from(this._data.keys())[index] ?? null;
    },
    get length() {
      return this._data.size;
    },
  };
  // The texture library produces real ImageData; give it the real thing so
  // its pixel loops run here instead of only in a browser.
  if (typeof globalThis.ImageData === 'undefined') {
    globalThis.ImageData = class ImageData {
      constructor(a, b, c) {
        if (typeof a === 'number') {
          this.width = Math.max(1, Math.round(a));
          this.height = Math.max(1, Math.round(b ?? a));
          this.data = new Uint8ClampedArray(this.width * this.height * 4);
        } else {
          this.data = a;
          this.width = Math.max(1, Math.round(b ?? 1));
          this.height = Math.max(1, Math.round(c ?? 1));
        }
        this.colorSpace = 'srgb';
      }
    };
  }

  // three's addons touch `Image` (SMAAPass loads its area texture through
  // one). Nothing ever loads here, which is fine: it only delays a texture
  // upload that cannot happen without a driver anyway.
  if (typeof globalThis.Image === 'undefined') {
    globalThis.Image = class Image {
      constructor() {
        this.src = '';
        this.width = 1;
        this.height = 1;
        this.complete = false;
        this.onload = null;
        this.onerror = null;
        this.crossOrigin = null;
      }
      addEventListener() {}
      removeEventListener() {}
      decode() {
        return Promise.resolve();
      }
    };
  }

  globalThis.AudioContext = globalThis.AudioContext ?? undefined;

  return globalThis.window;
}

/** Build a fresh detached element (tests use this instead of document.body). */
export { makeElement };

export default installDomShim;

installDomShim();
