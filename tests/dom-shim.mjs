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
    remove: () => {},
    insertBefore: (child) => child,
    replaceChildren: (...nodes) => {
      children.length = 0;
      nodes.forEach((n) => element.appendChild(n));
    },
    querySelector: () => null,
    querySelectorAll: () => [],
    getContext: () => null,
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

export function installDomShim() {
  if (globalThis.__MV_DOM_SHIM__) return globalThis.window;
  globalThis.__MV_DOM_SHIM__ = true;

  globalThis.requestAnimationFrame = (fn) => {
    globalThis.__raf = fn;
    return 1;
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
  globalThis.AudioContext = globalThis.AudioContext ?? undefined;

  return globalThis.window;
}

/** Build a fresh detached element (tests use this instead of document.body). */
export { makeElement };

export default installDomShim;

installDomShim();
