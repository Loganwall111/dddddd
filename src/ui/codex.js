/**
 * THE MULTIVERSE — ui/codex.js
 * ==================================================================
 * THE CODEX. Everything the machine knows because you looked at it:
 * realities, creatures, archive fragments, the seven truths, discovered
 * landmarks, and the statistics of a life spent inside a lattice.
 *
 * Also the ATLAS: a map of the current reality showing discovered landmarks,
 * portals and the player's own trail.
 */
import { ARCHIVES, REALMS, SPECIES, TRUTHS, realmById } from '../lore.js';
import { BIOME_BLURBS } from '../engine/text.js';
import { clamp01 } from '../core/math.js';

export class Codex {
  constructor({ root, progress = null, onAction = null } = {}) {
    this.root = root;
    this.progress = progress;
    this.onAction = onAction;
    this.open = false;
    this.tab = 'realities';
    this.tabs = ['realities', 'creatures', 'archives', 'truths', 'atlas', 'stats'];
    this.build();
  }

  build() {
    this.layer = document.createElement('div');
    this.layer.className = 'codex-layer';
    this.layer.setAttribute('aria-hidden', 'true');
    this.root.appendChild(this.layer);

    const frame = document.createElement('div');
    frame.className = 'codex-frame';
    this.layer.appendChild(frame);

    const header = document.createElement('div');
    header.className = 'codex-header';
    header.innerHTML = '<div class="codex-title">CODEX</div><div class="codex-sub">THE LATTICE, AS READ BY THE MACHINE</div>';
    const close = document.createElement('button');
    close.className = 'codex-close';
    close.type = 'button';
    close.textContent = 'CLOSE  [TAB]';
    close.addEventListener('click', () => this.hide());
    header.appendChild(close);
    frame.appendChild(header);

    const tabBar = document.createElement('div');
    tabBar.className = 'codex-tabs';
    for (const tab of this.tabs) {
      const button = document.createElement('button');
      button.className = 'codex-tab';
      button.textContent = tab.toUpperCase();
      button.dataset.tab = tab;
      button.addEventListener('click', () => {
        this.tab = tab;
        this.render();
        this.onAction?.('sfx', 'ui.click');
      });
      tabBar.appendChild(button);
    }
    frame.appendChild(tabBar);

    this.body = document.createElement('div');
    this.body.className = 'codex-body';
    frame.appendChild(this.body);

    this.detail = document.createElement('div');
    this.detail.className = 'codex-detail';
    frame.appendChild(this.detail);

    this.layer.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' || event.key === 'Tab') this.hide();
    });
  }

  show(tab = null) {
    if (tab) this.tab = tab;
    this.open = true;
    this.layer.classList.add('visible');
    this.layer.setAttribute('aria-hidden', 'false');
    this.render();
  }

  hide() {
    this.open = false;
    this.layer.classList.remove('visible');
    this.layer.setAttribute('aria-hidden', 'true');
    this.onAction?.('codex-closed');
  }

  toggle() {
    if (this.open) this.hide();
    else this.show();
  }

  render() {
    for (const button of this.layer.querySelectorAll('.codex-tab')) {
      button.classList.toggle('active', button.dataset.tab === this.tab);
    }
    this.body.innerHTML = '';
    switch (this.tab) {
      case 'realities':
        this.renderRealities();
        break;
      case 'creatures':
        this.renderCreatures();
        break;
      case 'archives':
        this.renderArchives();
        break;
      case 'truths':
        this.renderTruths();
        break;
      case 'atlas':
        this.renderAtlas();
        break;
      case 'stats':
        this.renderStats();
        break;
      default:
        this.renderRealities();
    }
  }

  entry({ title, sub = '', body = '', locked = false, icon = null, badge = null, onClick = null }) {
    const node = document.createElement('button');
    node.type = 'button';
    node.className = `codex-entry ${locked ? 'locked' : ''}`;
    node.innerHTML = `
      <div class="entry-head">
        <span class="entry-icon">${icon ?? (locked ? '🔒' : '◉')}</span>
        <span class="entry-title">${escapeHtml(title)}</span>
        ${badge ? `<span class="entry-badge">${escapeHtml(badge)}</span>` : ''}
      </div>
      ${sub ? `<div class="entry-sub">${escapeHtml(sub)}</div>` : ''}
      ${body ? `<div class="entry-body">${escapeHtml(body)}</div>` : ''}
    `;
    if (onClick) node.addEventListener('click', onClick);
    this.body.appendChild(node);
    return node;
  }

  renderRealities() {
    const visited = this.progress?.get('realmsVisited') ?? [];
    const chapter = this.progress?.get('chapter') ?? 0;
    for (const realm of REALMS) {
      const requirement = realm.requirements?.chapter ?? 0;
      const locked = chapter < requirement;
      this.entry({
        title: realm.name,
        sub: `${realm.codename} · gravity ${realm.gravity}× · ${visited.includes(realm.id) ? 'VISITED' : 'SEALED'}`,
        body: locked ? `Requires chapter ${requirement}.` : `${realm.tagline} ${realm.entry}`,
        locked,
        icon: locked ? '🔒' : visited.includes(realm.id) ? '◉' : '○',
      });
    }
  }

  renderCreatures() {
    const discovered = this.progress?.get('discovered') ?? {};
    for (const species of SPECIES) {
      const seen = !!discovered[species.id];
      this.entry({
        title: seen ? species.name : 'UNIDENTIFIED',
        sub: seen ? `${species.behavior} · luminance ${Math.round((species.luminance ?? 0) * 100)}%` : 'Not yet observed. Hold Q near one to scan.',
        body: seen ? species.description ?? species.lore ?? '' : '',
        locked: !seen,
        icon: seen ? '◉' : '○',
        badge: seen && species.biome ? species.biome : null,
      });
    }
  }

  renderArchives() {
    const collected = this.progress?.get('archives') ?? [];
    if (collected.length === 0) {
      this.entry({ title: 'NO FRAGMENTS RECOVERED', sub: 'Archive fragments are scattered through every reality. They look like light with a shape.' });
    }
    for (const archive of ARCHIVES) {
      const has = collected.includes(archive.id);
      this.entry({
        title: has ? archive.title : 'FRAGMENT ▮▮▮▮',
        sub: has ? (archive.source ?? 'recovered') : 'Encrypted. Find it in the world.',
        body: has ? archive.text : '',
        locked: !has,
        icon: has ? '◈' : '○',
      });
    }
  }

  renderTruths() {
    const found = this.progress?.get('truthsFound') ?? [];
    for (const truth of TRUTHS) {
      const has = found.includes(truth.id);
      this.entry({
        title: has ? truth.title : `TRUTH ${truth.index ?? '?'} — UNRESOLVED`,
        sub: has ? truth.source : 'One of seven. Found by living here, not by looking for it.',
        body: has ? truth.text : '',
        locked: !has,
        icon: has ? '◆' : '◇',
      });
    }
  }

  renderAtlas() {
    this.body.innerHTML = `
      <div class="codex-note">
        The atlas is drawn live in the HUD (press <b>M</b> to toggle). Discovered landmarks are named once
        you stand close enough to them; portals are marked in their reality's colour.
      </div>
    `;
    const landmarks = this.progress?.get('discoveredLandmarks') ?? [];
    if (landmarks.length === 0) {
      this.entry({ title: 'NO LANDMARKS NAMED YET', sub: 'Walk. The valley has peaks, falls and lakes that want names.' });
    }
    for (const landmark of landmarks.slice(-40)) {
      this.entry({ title: landmark.name ?? landmark.id, sub: landmark.realm?.toUpperCase?.() ?? '', locked: false, icon: '◉' });
    }
  }

  renderStats() {
    const stats = this.progress?.get('stats') ?? {};
    const rows = [
      ['Playtime', formatDuration(stats.playtime ?? 0)],
      ['Distance walked', `${Math.round(stats.distance ?? 0)} m`],
      ['Creatures scanned', String(stats.scans ?? 0)],
      ['Creatures observed', String(this.progress?.get('discoveredCount') ?? 0)],
      ['Portals entered', String(stats.portalsEntered ?? 0)],
      ['Fragments recovered', String((this.progress?.get('archives') ?? []).length)],
      ['Truths found', `${(this.progress?.get('truthsFound') ?? []).length} / ${TRUTHS.length}`],
      ['Deaths', String(stats.deaths ?? 0)],
      ['Ascensions', String(stats.ascensions ?? 0)],
      ['Deepest point', `${Math.round(stats.deepest ?? 0)} m`],
      ['Highest point', `${Math.round(stats.highest ?? 0)} m`],
      ['Realities visited', `${(this.progress?.get('realmsVisited') ?? []).length} / ${REALMS.length}`],
    ];
    this.body.innerHTML = `<div class="codex-stats">${rows
      .map(([label, value]) => `<div class="stat-row"><span>${label}</span><b>${value}</b></div>`)
      .join('')}</div>`;
  }

  /** Show a live biome readout in the detail pane (driven by the game loop). */
  setBiomeInfo(biomeId, extra = {}) {
    if (!this.open) return;
    const blurb = BIOME_BLURBS[biomeId] ?? '';
    this.detail.innerHTML = `<b>${(biomeId ?? '').toUpperCase()}</b><br>${escapeHtml(blurb)}${
      extra.creatures ? `<br><small>${extra.creatures} creatures within range</small>` : ''
    }`;
  }

  /** A one-off "you found something" panel, used by discoveries. */
  present({ title, sub = '', body = '', kind = 'archive' } = {}) {
    const popup = document.createElement('div');
    popup.className = `codex-popup codex-popup-${kind}`;
    popup.innerHTML = `
      <div class="popup-kind">${kind.toUpperCase()} RECOVERED</div>
      <div class="popup-title">${escapeHtml(title)}</div>
      <div class="popup-sub">${escapeHtml(sub)}</div>
      <div class="popup-body">${escapeHtml(body)}</div>
      <div class="popup-hint">TAB — read it in the codex</div>
    `;
    this.root.appendChild(popup);
    requestAnimationFrame(() => popup.classList.add('visible'));
    setTimeout(() => {
      popup.classList.remove('visible');
      setTimeout(() => popup.remove(), 600);
    }, 9000);
  }
}

function escapeHtml(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function formatDuration(seconds) {
  const total = Math.max(0, Math.floor(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0 ? `${h}h ${m}m` : m > 0 ? `${m}m ${s}s` : `${s}s`;
}

export { clamp01, realmById };
