/**
 * THE MULTIVERSE — ui/menu.js
 * ==================================================================
 * The holographic front end. Everything you can do before (and while)
 * being alive in a machine: PLAY, CONTINUE, REALITIES, CODEX, SETTINGS,
 * CREDITS, QUIT — plus the pause menu and the save-slot browser.
 *
 * The panels are DOM, styled by game/style.css. Keyboard-first (arrows +
 * enter + escape), mouse-aware, and safe to open over a running simulation.
 */
import { MENU, LOADING_TIPS } from '../engine/text.js';
import { QUALITY_PRESETS, QUALITY_ORDER, SETTINGS_RULES } from '../settings.js';
import { REALMS } from '../lore.js';
import { clamp01 } from '../core/math.js';

const GRAPHICS_KEYS = ['quality', 'autoQuality', 'renderScale', 'pixelRatioCap', 'fov', 'viewDistance', 'glitchIntensity', 'fieldOfViewKick', 'motionScale'];
const AUDIO_KEYS = ['masterVolume', 'musicVolume', 'ambienceVolume', 'sfxVolume', 'voiceVolume', 'narration', 'subtitles'];
const GAMEPLAY_KEYS = ['hud', 'crosshair', 'thirdPerson', 'cameraShake', 'headBob', 'runToggle', 'crouchToggle', 'godMode', 'allowTeleportKeys', 'showFps'];
const LABELS = {
  quality: 'Quality preset',
  autoQuality: 'Adaptive quality',
  renderScale: 'Render scale',
  pixelRatioCap: 'Pixel ratio cap',
  fov: 'Field of view',
  viewDistance: 'View distance',
  thirdPerson: 'Third person',
  glitchIntensity: 'Reality tearing',
  fieldOfViewKick: 'FOV impulses',
  motionScale: 'Motion blur',
  masterVolume: 'Master volume',
  musicVolume: 'Music',
  ambienceVolume: 'Ambience',
  sfxVolume: 'Effects',
  voiceVolume: 'Voice',
  narration: 'Commentary',
  subtitles: 'Subtitles',
  hud: 'Show HUD',
  crosshair: 'Crosshair',
  cameraShake: 'Camera shake',
  headBob: 'Head movement',
  runToggle: 'Sprint toggle',
  crouchToggle: 'Crouch toggle',
  godMode: 'Invulnerability',
  allowTeleportKeys: 'Debug teleport',
  showFps: 'Performance readout',
  invertY: 'Invert look',
  mouseSensitivity: 'Mouse sensitivity',
  gamepadSensitivity: 'Gamepad sensitivity',
  seed: 'World seed',
  endedEarth: 'Intro seen',
};
const HELP = {
  quality: 'Lower presets drop resolution before they drop beauty.',
  autoQuality: 'The engine trades pixels for frames automatically when it has to.',
  renderScale: 'Internal resolution multiplier. 0.75 is often invisible; 0.5 rarely is.',
  glitchIntensity: 'How hard reality tears when you cross between drafts.',
  allowTeleportKeys: 'Enables keyboard hopping between realities for testing.',
};

export class Menu {
  constructor({ root, settings, onAction, progress = null, saveSystem = null, input = null } = {}) {
    this.root = root;
    this.settings = settings;
    this.onAction = onAction;
    this.progress = progress;
    this.saveSystem = saveSystem;
    this.input = input;
    this.screen = null;
    this.focusIndex = 0;
    this.focusables = [];
    this.tipIndex = Math.floor(Math.random() * LOADING_TIPS.length);
    this.build();
  }

  /* ---------------------------------------------------------------- *
   * Construction
   * ---------------------------------------------------------------- */

  build() {
    this.container = document.createElement('div');
    this.container.className = 'menu-layer';
    this.container.setAttribute('aria-hidden', 'true');
    this.root.appendChild(this.container);

    // backdrop: scanlines + drifting holographic grid
    this.backdrop = document.createElement('div');
    this.backdrop.className = 'menu-backdrop';
    const grid = document.createElement('div');
    grid.className = 'menu-grid';
    const scan = document.createElement('div');
    scan.className = 'menu-scanlines';
    const noise = document.createElement('div');
    noise.className = 'menu-noise';
    this.backdrop.append(grid, scan, noise);
    this.container.appendChild(this.backdrop);

    this.panel = document.createElement('div');
    this.panel.className = 'menu-panel';
    this.container.appendChild(this.panel);

    this.titleBlock = document.createElement('header');
    this.titleBlock.className = 'menu-title';
    this.titleBlock.innerHTML =
      '<div class="menu-title-main">THE MULTIVERSE</div>' +
      '<div class="menu-title-sub">SIMOLYSIS</div>' +
      '<div class="menu-title-tag">Earth is gone. Reality is yours to author.</div>';
    this.container.appendChild(this.titleBlock);

    this.footer = document.createElement('footer');
    this.footer.className = 'menu-footer';
    this.container.appendChild(this.footer);

    this.body = document.createElement('div');
    this.body.className = 'menu-body';
    this.panel.appendChild(this.body);

    this.hint = document.createElement('div');
    this.hint.className = 'menu-hint';
    this.panel.appendChild(this.hint);

    this.container.addEventListener('keydown', (event) => this.onKeyDown(event));
  }

  /* ---------------------------------------------------------------- *
   * Screen management
   * ---------------------------------------------------------------- */

  show(screen, { title = null } = {}) {
    this.screen = screen;
    this.focusIndex = 0;
    this.container.setAttribute('aria-hidden', screen ? 'false' : 'true');
    this.container.classList.toggle('visible', !!screen);
    this.container.classList.toggle('pause-mode', screen === 'pause');
    if (!screen) {
      this.body.innerHTML = '';
      this.focusables = [];
      return;
    }
    this.body.innerHTML = '';
    this.focusables = [];
    switch (screen) {
      case 'main':
        this.renderMain();
        break;
      case 'pause':
        this.renderPause();
        break;
      case 'settings':
        this.renderSettings();
        break;
      case 'realities':
        this.renderRealities();
        break;
      case 'saves':
        this.renderSaves();
        break;
      case 'credits':
        this.renderCredits();
        break;
      case 'controls':
        this.renderControls();
        break;
      default:
        this.renderMain();
    }
    this.footer.innerHTML = title ?? '';
    this.applyFocus();
  }

  hide() {
    this.show(null);
  }

  get isOpen() {
    return !!this.screen;
  }

  heading(text, sub = '') {
    const node = document.createElement('h2');
    node.className = 'menu-heading';
    node.textContent = text;
    this.body.appendChild(node);
    if (sub) {
      const subNode = document.createElement('p');
      subNode.className = 'menu-subheading';
      subNode.textContent = sub;
      this.body.appendChild(subNode);
    }
  }

  button(label, { detail = '', onSelect, className = '', disabled = false, icon = null } = {}) {
    const node = document.createElement('button');
    node.type = 'button';
    node.className = `menu-button ${className}`.trim();
    node.disabled = disabled;
    const labelNode = document.createElement('span');
    labelNode.className = 'menu-button-label';
    labelNode.textContent = label;
    node.appendChild(labelNode);
    if (icon) {
      const iconNode = document.createElement('span');
      iconNode.className = 'menu-button-icon';
      iconNode.textContent = icon;
      node.insertBefore(iconNode, labelNode);
    }
    if (detail) {
      const detailNode = document.createElement('span');
      detailNode.className = 'menu-button-detail';
      detailNode.textContent = detail;
      node.appendChild(detailNode);
    }
    const activate = () => {
      if (disabled) return;
      this.onAction?.('sfx', 'ui.click');
      onSelect?.();
    };
    node.addEventListener('click', activate);
    node.addEventListener('mouseenter', () => {
      this.focusIndex = this.focusables.indexOf(node);
      this.applyFocus();
      this.onAction?.('sfx', 'ui.hover');
    });
    this.body.appendChild(node);
    this.focusables.push(node);
    return node;
  }

  /* ------------------------------ main ------------------------------ */

  renderMain() {
    const hasSave = this.saveSystem ? this.saveSystem.list().some((slot) => !slot.empty) : false;
    const items = MENU.items;
    for (const item of items) {
      if (item.id === 'continue' && !hasSave) continue;
      this.button(item.label, {
        detail: item.detail,
        onSelect: () => this.onAction?.('menu', item.id),
      });
    }
    const version = document.createElement('div');
    version.className = 'menu-version';
    version.textContent = `BUILD ${window.__MV_BUILD__ ?? 'dev'} · SEED ${this.settings?.get('seed') ?? 1337} · THE LATTICE HOLDS`;
    this.body.appendChild(version);
  }

  /* ------------------------------ pause ------------------------------ */

  renderPause() {
    this.heading('REALITY SUSPENDED', 'The lattice keeps your place.');
    for (const item of MENU.pauseItems) {
      this.button(item.label, {
        onSelect: () => this.onAction?.('pause', item.id),
      });
    }
    if (this.progress) {
      const stats = this.progress.get('stats') ?? {};
      const summary = document.createElement('div');
      summary.className = 'menu-stats';
      summary.innerHTML = [
        `<span>CHAPTER ${this.progress.get('chapter') ?? 0}</span>`,
        `<span>REALITY ${(this.progress.get('realm') ?? 'valley').toUpperCase()}</span>`,
        `<span>TRUTHS ${(this.progress.get('truthsFound') ?? []).length}/7</span>`,
        `<span>ARCHIVES ${(this.progress.get('archives') ?? []).length}</span>`,
        `<span>DISCOVERIES ${this.progress.get('discoveredCount') ?? 0}</span>`,
        `<span>PLAYTIME ${formatTime(stats.playtime ?? 0)}</span>`,
      ].join('');
      this.body.appendChild(summary);
    }
  }

  /* ---------------------------- settings ---------------------------- */

  renderSettings() {
    this.heading('SYSTEMS', 'Everything here can be changed while the world keeps running.');

    const tabs = document.createElement('div');
    tabs.className = 'menu-tabs';
    const groups = [
      ['GRAPHICS', GRAPHICS_KEYS],
      ['AUDIO', AUDIO_KEYS],
      ['GAMEPLAY', GAMEPLAY_KEYS],
      ['CONTROLS', null],
    ];
    this.settingsTab = this.settingsTab ?? 0;
    groups.forEach(([label], index) => {
      const tab = document.createElement('button');
      tab.className = `menu-tab ${index === this.settingsTab ? 'active' : ''}`;
      tab.textContent = label;
      tab.addEventListener('click', () => {
        this.settingsTab = index;
        this.show('settings');
      });
      tabs.appendChild(tab);
    });
    this.body.appendChild(tabs);

    const group = groups[this.settingsTab];
    const scroll = document.createElement('div');
    scroll.className = 'menu-scroll';
    this.body.appendChild(scroll);
    const previousBody = this.body;
    this.body = scroll;

    if (group[1]) {
      for (const key of group[1]) this.settingRow(key);
      if (this.settingsTab === 0) {
        this.button('RESET TO DETECTED', {
          detail: `The engine suggests ${this.settings?.detectQuality?.() ?? 'high'}.`,
          onSelect: () => {
            const preset = this.settings.detectQuality();
            // Handing control back to the engine: apply the preset, then clear
            // the "chosen by hand" mark so the hardware ceiling governs again.
            this.onAction?.('settings', { key: 'quality', value: preset });
            this.settings.patch({ quality: preset, qualityChosen: false });
            this.show('settings');
          },
        });
      }
    } else {
      this.controlListings();
    }
    this.body = previousBody;

    this.button('BACK', { onSelect: () => this.onAction?.('menu', this.container.classList.contains('pause-mode') ? 'pause' : 'main') });
  }

  settingRow(key) {
    const rule = SETTINGS_RULES[key];
    if (!rule) return;
    const value = this.settings.get(key);
    const row = document.createElement('div');
    row.className = 'setting-row';
    const label = document.createElement('div');
    label.className = 'setting-label';
    label.innerHTML = `<span>${LABELS[key] ?? key}</span>${HELP[key] ? `<small>${HELP[key]}</small>` : ''}`;
    row.appendChild(label);

    const control = document.createElement('div');
    control.className = 'setting-control';
    row.appendChild(control);

    if (key === 'quality') {
      const select = document.createElement('select');
      for (const presetId of [...QUALITY_ORDER].reverse()) {
        const preset = QUALITY_PRESETS[presetId];
        const option = document.createElement('option');
        option.value = presetId;
        option.textContent = preset.label;
        option.selected = value === presetId;
        select.appendChild(option);
      }
      select.addEventListener('change', () => {
        this.onAction?.('settings', { key, value: select.value });
        this.show('settings');
      });
      control.appendChild(select);
      const blurb = document.createElement('small');
      blurb.className = 'setting-blurb';
      blurb.textContent = QUALITY_PRESETS[value]?.blurb ?? '';
      control.appendChild(blurb);
    } else if (rule.type === 'bool') {
      const toggle = document.createElement('button');
      toggle.className = `toggle ${value ? 'on' : 'off'}`;
      toggle.innerHTML = `<span class="toggle-knob"></span><span class="toggle-text">${value ? 'ON' : 'OFF'}</span>`;
      toggle.addEventListener('click', () => {
        const next = !this.settings.get(key);
        this.onAction?.('settings', { key, value: next });
        toggle.classList.toggle('on', next);
        toggle.classList.toggle('off', !next);
        toggle.querySelector('.toggle-text').textContent = next ? 'ON' : 'OFF';
        this.onAction?.('sfx', 'ui.click');
      });
      control.appendChild(toggle);
    } else if (rule.type === 'num') {
      const slider = document.createElement('input');
      slider.type = 'range';
      slider.min = String(rule.min);
      slider.max = String(rule.max);
      slider.step = String(rule.integer ? 1 : (rule.max - rule.min) / 100);
      slider.value = String(value);
      const readout = document.createElement('span');
      readout.className = 'setting-value';
      readout.textContent = formatValue(key, value);
      slider.addEventListener('input', () => {
        const numeric = Number(slider.value);
        readout.textContent = formatValue(key, numeric);
        this.onAction?.('settings', { key, value: numeric });
      });
      slider.addEventListener('change', () => this.onAction?.('sfx', 'ui.click'));
      control.appendChild(slider);
      control.appendChild(readout);
    } else if (rule.type === 'enum') {
      const select = document.createElement('select');
      for (const option of rule.values) {
        const node = document.createElement('option');
        node.value = option;
        node.textContent = option;
        node.selected = option === value;
        select.appendChild(node);
      }
      select.addEventListener('change', () => {
        this.onAction?.('settings', { key, value: select.value });
        this.show('settings');
      });
      control.appendChild(select);
    }
    this.body.appendChild(row);
  }

  controlListings() {
    const bindings = this.input?.bindings ?? {};
    const list = document.createElement('div');
    list.className = 'setting-rows';
    for (const [action, codes] of Object.entries(bindings)) {
      const row = document.createElement('div');
      row.className = 'setting-row';
      row.innerHTML = `<div class="setting-label"><span>${LABELS[action] ?? action}</span></div>`;
      const control = document.createElement('div');
      control.className = 'setting-control';
      const button = document.createElement('button');
      button.className = 'bind-button';
      button.textContent = codes.map(prettyKey).join(' / ');
      button.addEventListener('click', () => {
        button.textContent = 'PRESS A KEY…';
        button.classList.add('listening');
        const handler = (event) => {
          event.preventDefault();
          event.stopPropagation();
          window.removeEventListener('keydown', handler, true);
          button.classList.remove('listening');
          if (event.code === 'Escape') {
            button.textContent = codes.map(prettyKey).join(' / ');
            return;
          }
          this.input?.setBinding(action, [event.code]);
          button.textContent = prettyKey(event.code);
          this.onAction?.('sfx', 'ui.confirm');
        };
        window.addEventListener('keydown', handler, true);
      });
      control.appendChild(button);
      row.appendChild(control);
      list.appendChild(row);
    }
    const invert = document.createElement('div');
    invert.className = 'setting-row';
    invert.innerHTML = '<div class="setting-label"><span>Invert look</span></div>';
    const invertControl = document.createElement('div');
    invertControl.className = 'setting-control';
    const invertButton = document.createElement('button');
    invertButton.className = `toggle ${this.settings.get('invertY') ? 'on' : 'off'}`;
    invertButton.innerHTML = `<span class="toggle-knob"></span><span class="toggle-text">${this.settings.get('invertY') ? 'ON' : 'OFF'}</span>`;
    invertButton.addEventListener('click', () => {
      const next = !this.settings.get('invertY');
      this.onAction?.('settings', { key: 'invertY', value: next });
      invertButton.classList.toggle('on', next);
      invertButton.classList.toggle('off', !next);
      invertButton.querySelector('.toggle-text').textContent = next ? 'ON' : 'OFF';
      if (this.input) this.input.invertY = next;
    });
    invertControl.appendChild(invertButton);
    invert.appendChild(invertControl);
    list.appendChild(invert);
    this.body.appendChild(list);
  }

  /* ---------------------------- realities ---------------------------- */

  renderRealities() {
    this.heading('REALITIES', 'Every universe the machine has compiled for you.');
    const visited = this.progress?.get('realmsVisited') ?? [];
    const chapter = this.progress?.get('chapter') ?? 0;
    for (const realm of REALMS) {
      const requirement = realm.requirements?.chapter ?? 0;
      const locked = chapter < requirement;
      const seen = visited.includes(realm.id);
      this.button(realm.name, {
        className: locked ? 'locked' : seen ? 'seen' : '',
        icon: locked ? '🔒' : seen ? '◉' : '○',
        detail: locked
          ? `Requires chapter ${requirement}. ${realm.tagline}`
          : `${realm.tagline} — ${realm.codename}`,
        disabled: locked,
        onSelect: () => this.onAction?.('reality', realm.id),
      });
    }
    this.button('RETURN', { onSelect: () => this.onAction?.('menu', this.container.classList.contains('pause-mode') ? 'pause' : 'main') });
  }

  /* ------------------------------ saves ------------------------------ */

  renderSaves() {
    this.heading('REALITIES ON FILE', 'Everything you have built persists here.');
    const slots = this.saveSystem ? this.saveSystem.list() : [];
    for (const slot of slots) {
      const label = slot.slot.toUpperCase();
      const detail = slot.empty
        ? 'Empty. A universe is waiting to be authored.'
        : slot.corrupt
          ? 'Corrupted — the lattice could not read it.'
          : `${slot.realm?.toUpperCase() ?? 'VALLEY'} · chapter ${slot.chapter} · level ${slot.level} · ${formatTime(slot.playtime ?? 0)}`;
      this.button(label, {
        detail,
        icon: slot.empty ? '○' : '◉',
        onSelect: () => this.onAction?.('save', slot.slot),
      });
      if (!slot.empty && !slot.corrupt) {
        const remove = document.createElement('button');
        remove.className = 'menu-small-button';
        remove.textContent = 'delete';
        remove.addEventListener('click', () => {
          this.saveSystem.remove(slot.slot);
          this.onAction?.('sfx', 'ui.back');
          this.show('saves');
        });
        this.body.appendChild(remove);
      }
    }
    this.button('BACK', { onSelect: () => this.onAction?.('menu', this.container.classList.contains('pause-mode') ? 'pause' : 'main') });
  }

  /* ----------------------------- credits ----------------------------- */

  renderCredits() {
    this.heading('CREDITS', 'There is no crew. There is a machine and a lot of arithmetic.');
    const list = document.createElement('div');
    list.className = 'credits-list';
    list.innerHTML = [
      ['DIRECTED, WRITTEN, BUILT', 'procedurally, at runtime'],
      ['TERRAIN, CLIMATE, LIGHT', 'generated'],
      ['EVERY CREATURE', 'grown from a body plan and a gait'],
      ['WATER, REFLECTIONS, CAUSTICS', 'a mirrored camera and patience'],
      ['MUSIC', 'a synthetic orchestra with no players in it'],
      ['COMMENTARY', 'your own machine, reading itself aloud'],
      ['THE GREAT ONE', 'still walking'],
      ['DEDICATED TO', 'the planet that is no longer there'],
    ]
      .map(([role, who]) => `<div class="credit-row"><span>${role}</span><b>${who}</b></div>`)
      .join('');
    this.body.appendChild(list);
    this.button('BACK', { onSelect: () => this.onAction?.('menu', 'main') });
  }

  renderControls() {
    this.heading('HOW TO EXIST HERE');
    const list = document.createElement('div');
    list.className = 'credits-list';
    list.innerHTML = [
      ['W A S D', 'move'],
      ['MOUSE', 'look'],
      ['SHIFT', 'sprint / dive'],
      ['SPACE', 'jump / ascend'],
      ['E', 'interact'],
      ['Q', 'bioscan'],
      ['F', 'flight (when unlocked)'],
      ['G', 'dissolve into a ghost'],
      ['V', 'first / third person'],
      ['M', 'atlas'],
      ['TAB', 'codex'],
      ['F5 / F6', 'save / load'],
      ['ESC', 'pause'],
    ]
      .map(([key, what]) => `<div class="credit-row"><span>${key}</span><b>${what}</b></div>`)
      .join('');
    this.body.appendChild(list);
    this.button('BACK', { onSelect: () => this.show('settings') });
  }

  /* ---------------------------------------------------------------- *
   * Keyboard
   * ---------------------------------------------------------------- */

  onKeyDown(event) {
    if (!this.screen) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowRight') {
      this.focusIndex = (this.focusIndex + 1) % Math.max(1, this.focusables.length);
      this.applyFocus();
      event.preventDefault();
    } else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
      this.focusIndex = (this.focusIndex - 1 + this.focusables.length) % Math.max(1, this.focusables.length);
      this.applyFocus();
      event.preventDefault();
    } else if (event.key === 'Enter' || event.key === ' ') {
      const node = this.focusables[this.focusIndex];
      if (node && node.tagName === 'BUTTON') node.click();
      event.preventDefault();
    } else if (event.key === 'Escape') {
      this.onAction?.('menu', this.container.classList.contains('pause-mode') ? 'resume' : 'main-escape');
      event.preventDefault();
    }
  }

  applyFocus() {
    this.focusables.forEach((node, index) => node.classList.toggle('focused', index === this.focusIndex));
    const node = this.focusables[this.focusIndex];
    if (node?.scrollIntoView) node.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  /** Rotating tips for the loading screen and menu footer. */
  nextTip() {
    this.tipIndex = (this.tipIndex + 1) % LOADING_TIPS.length;
    return LOADING_TIPS[this.tipIndex];
  }
}

function formatValue(key, value) {
  if (typeof value === 'boolean') return value ? 'ON' : 'OFF';
  if (key === 'seed') return String(Math.round(value));
  if (['masterVolume', 'musicVolume', 'ambienceVolume', 'sfxVolume', 'voiceVolume'].includes(key)) {
    return `${Math.round(value * 100)}%`;
  }
  if (['renderScale', 'motionScale', 'glitchIntensity', 'viewDistance', 'headBob', 'cameraShake', 'fieldOfViewKick'].includes(key)) {
    return value.toFixed(2);
  }
  if (['fov'].includes(key)) return `${Math.round(value)}°`;
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function prettyKey(code) {
  return String(code)
    .replace('Key', '')
    .replace('Digit', '')
    .replace('Arrow', '◀ ')
    .replace('Control', 'CTRL')
    .replace('ShiftLeft', 'SHIFT')
    .replace('ShiftRight', 'SHIFT')
    .replace('Space', 'SPACE');
}

function formatTime(seconds) {
  const total = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

export { clamp01 };
