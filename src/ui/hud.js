/**
 * THE MULTIVERSE — ui/hud.js
 * ==================================================================
 * The head-up display. Deliberately thin and diegetic: everything on screen
 * is something the LODEMUS lattice would plausibly draw inside your vision.
 *
 * Contains: reticle, compass ribbon with tracked landmark, vitals arcs
 * (breath / stamina / integrity), interaction prompt, scanner ring, toast
 * stack, reality banner, minimap, and the debug readout.
 */
import { clamp01, lerp, wrap } from '../core/math.js';
import { PROMPTS } from '../engine/text.js';

export class Hud {
  constructor({ root, settings = null, onToast = null } = {}) {
    this.root = root;
    this.settings = settings;
    this.visible = true;
    this.toasts = [];
    this.markers = [];
    this.flashAmount = 0;
    this.flashColor = '#ff5a5a';
    this.scanPulse = 0;
    this.bannerTimeout = 0;
    this.onToast = onToast;
    this.reticleState = 'default';
    this.build();
  }

  build() {
    const make = (tag, className, parent = this.root) => {
      const node = document.createElement(tag);
      if (className) node.className = className;
      parent.appendChild(node);
      return node;
    };

    this.container = make('div', 'hud');

    // ---- vignette / flash ----
    this.flash = make('div', 'hud-flash', this.container);
    this.suffocation = make('div', 'hud-suffocation', this.container);

    // ---- reticle ----
    this.reticle = make('div', 'hud-reticle', this.container);
    this.reticleDot = make('div', 'reticle-dot', this.reticle);
    for (let i = 0; i < 4; i++) make('div', `reticle-tick reticle-tick-${i}`, this.reticle);
    this.reticleRing = make('div', 'reticle-ring', this.reticle);

    // ---- compass ribbon ----
    this.compass = make('div', 'hud-compass', this.container);
    this.compassInner = make('div', 'hud-compass-inner', this.compass);
    this.compassTicks = make('div', 'hud-compass-ticks', this.compassInner);
    this.compassMarkers = make('div', 'hud-compass-markers', this.compassInner);
    this.compassHeading = make('div', 'hud-compass-heading', this.compass);

    // ---- vitals ----
    this.vitals = make('div', 'hud-vitals', this.container);
    this.vitalArcs = {};
    for (const [key, label] of [['health', 'INTEGRITY'], ['breath', 'BREATH'], ['stamina', 'ENDURANCE']]) {
      const wrapNode = make('div', `vital vital-${key}`, this.vitals);
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('viewBox', '0 0 48 48');
      const track = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      track.setAttribute('cx', '24');
      track.setAttribute('cy', '24');
      track.setAttribute('r', '19');
      track.setAttribute('class', 'vital-track');
      const fill = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      fill.setAttribute('cx', '24');
      fill.setAttribute('cy', '24');
      fill.setAttribute('r', '19');
      fill.setAttribute('class', 'vital-fill');
      fill.setAttribute('stroke-dasharray', `${2 * Math.PI * 19}`);
      fill.setAttribute('stroke-dashoffset', '0');
      svg.appendChild(track);
      svg.appendChild(fill);
      wrapNode.appendChild(svg);
      const text = make('span', 'vital-label', wrapNode);
      text.textContent = label;
      this.vitalArcs[key] = { node: wrapNode, fill, circumference: 2 * Math.PI * 19, value: 1, displayed: 1 };
    }

    // ---- interaction prompt ----
    this.promptNode = make('div', 'hud-prompt', this.container);
    this.promptKey = make('span', 'prompt-key', this.promptNode);
    this.promptVerb = make('span', 'prompt-verb', this.promptNode);
    this.promptLabel = make('span', 'prompt-label', this.promptNode);
    this.promptDetail = make('div', 'prompt-detail', this.promptNode);

    // ---- reality banner ----
    this.banner = make('div', 'hud-banner', this.container);
    this.bannerName = make('div', 'banner-name', this.banner);
    this.bannerSub = make('div', 'banner-sub', this.banner);

    // ---- toasts ----
    this.toastStack = make('div', 'hud-toasts', this.container);

    // ---- minimap ----
    this.mapWrap = make('div', 'hud-map', this.container);
    this.mapCanvas = document.createElement('canvas');
    this.mapCanvas.width = 192;
    this.mapCanvas.height = 192;
    this.mapCanvas.className = 'map-canvas';
    this.mapWrap.appendChild(this.mapCanvas);
    this.mapCtx = this.mapCanvas.getContext('2d');
    this.mapCaption = make('div', 'map-caption', this.mapWrap);
    this.mapData = null;

    // ---- debug ----
    this.debug = make('div', 'hud-debug', this.container);

    // ---- cinematic bars ----
    this.bars = make('div', 'hud-bars', this.container);
    make('div', 'bar-top', this.bars);
    make('div', 'bar-bottom', this.bars);
  }

  setVisible(visible) {
    this.visible = visible;
    this.container.classList.toggle('hidden', !visible);
  }

  /* ---------------------------------------------------------------- *
   * Per-frame update
   * ---------------------------------------------------------------- */

  update(dt, ctx = {}) {
    const {
      player = null,
      camera = null,
      realm = null,
      compass = [],
      prompt = null,
      stats = null,
      terrainSample = null,
      dwell = 0,
    } = ctx;

    // ---- reticle ----
    if (this.settings && this.settings.get('crosshair') === false) {
      this.reticle.classList.add('hidden');
    } else {
      this.reticle.classList.remove('hidden');
    }
    if (camera && player) {
      const speed = Math.hypot(player.velocity.x, player.velocity.z);
      const spread = clamp01(speed / 18) * 8;
      this.reticle.style.setProperty('--spread', `${spread}px`);
    }
    this.scanPulse = Math.max(0, this.scanPulse - dt * 2.4);
    this.reticle.classList.toggle('scanning', this.scanPulse > 0.02);

    // ---- vitals ----
    if (player) {
      this.vitalArcs.health.value = clamp01(player.health);
      this.vitalArcs.breath.value = clamp01(player.breath);
      this.vitalArcs.stamina.value = clamp01(player.stamina);
    }
    for (const arc of Object.values(this.vitalArcs)) {
      arc.displayed = lerp(arc.displayed, arc.value, clamp01(dt * 5));
      const offset = arc.circumference * (1 - arc.displayed);
      arc.fill.setAttribute('stroke-dashoffset', offset.toFixed(2));
      const critical = arc.value < 0.28;
      arc.node.classList.toggle('critical', critical);
      if (arc.value > 0.995) arc.node.classList.add('full');
      else arc.node.classList.remove('full');
    }

    // ---- breath pressure: close the edges of the screen ----
    const breath = player ? clamp01(player.breath) : 1;
    const pressure = breath < 0.42 ? (0.42 - breath) / 0.42 : 0;
    this.suffocation.style.opacity = (pressure * 0.85).toFixed(3);

    // ---- flash decay ----
    this.flashAmount = Math.max(0, this.flashAmount - dt * 2.2);
    this.flash.style.opacity = this.flashAmount.toFixed(3);
    this.flash.style.background = `radial-gradient(circle at 50% 50%, transparent 35%, ${this.flashColor} 130%)`;

    // ---- compass ----
    if (player) {
      const yaw = player.yaw;
      // The ribbon scrolls one full turn per 90° of view: readable at a glance.
      const pxPerRadian = 420 / (Math.PI / 2);
      this.compassTicks.style.transform = `translateX(${(-wrap(yaw, Math.PI * 2) * pxPerRadian).toFixed(1)}px)`;
      const heading = ((-yaw * 180) / Math.PI + 360 * 4) % 360;
      const names = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
      const name = names[Math.round(heading / 45) % 8];
      this.compassHeading.textContent = `${name} · ${Math.round(heading).toString().padStart(3, '0')}°`;
      for (const marker of compass) {
        let node = this.compassMarkers.querySelector(`[data-id="${marker.id}"]`);
        if (!node) {
          node = document.createElement('div');
          node.className = 'compass-marker';
          node.dataset.id = marker.id;
          node.innerHTML = '<span class="marker-needle"></span>';
          this.compassMarkers.appendChild(node);
        }
        const relative = wrap(marker.angle - yaw, Math.PI * 2);
        const signed = relative > Math.PI ? relative - Math.PI * 2 : relative;
        const x = signed * pxPerRadian;
        node.style.transform = `translateX(${x.toFixed(1)}px)`;
        node.style.opacity = Math.abs(signed) > Math.PI * 0.55 ? '0' : '1';
        node.classList.toggle('marker-far', (marker.distance ?? 0) > 900);
      }
      for (const node of this.compassMarkers.children) {
        if (!compass.some((m) => String(m.id) === node.dataset.id)) node.remove();
      }
    }

    // ---- prompt ----
    if (prompt) {
      this.promptNode.classList.add('visible');
      this.promptKey.textContent = prompt.key ?? 'E';
      this.promptVerb.textContent = (prompt.verb || 'interact').toUpperCase();
      this.promptLabel.textContent = prompt.label ?? '';
      this.promptDetail.textContent = prompt.detail ?? '';
      const style = PROMPTS[prompt.id] ?? null;
      this.promptNode.classList.toggle('locked', prompt.locked === true);
      void style;
    } else {
      this.promptNode.classList.remove('visible');
    }

    // ---- banner ----
    if (this.bannerTimeout > 0) {
      this.bannerTimeout -= dt;
      if (this.bannerTimeout <= 0) this.banner.classList.remove('visible');
    }

    // ---- dwell ring (holding on an interactable) ----
    if (dwell > 0) {
      this.reticleRing.style.setProperty('--dwell', dwell.toFixed(3));
      this.reticle.classList.add('dwelling');
    } else {
      this.reticle.classList.remove('dwelling');
    }

    // ---- minimap ----
    if (this.mapData && player) {
      this.drawMap(player, realm, terrainSample);
    }

    // ---- debug ----
    if (this.settings?.get('showFps') && stats) {
      this.debug.classList.add('visible');
      const { fps = 0, frameMs = 0, worstMs = 0, triangleText = '', position = null, creatures = 0, tier = '' } = stats;
      this.debug.innerHTML = [
        `<b>${fps.toFixed(0)}</b> fps · ${frameMs.toFixed(1)}ms (p95 ${worstMs.toFixed(1)}ms) · ${tier}`,
        position ? `pos ${position.x.toFixed(0)}, ${position.y.toFixed(0)}, ${position.z.toFixed(0)}` : '',
        `${triangleText} · ${creatures} alive · ${realm?.name ?? ''}`,
      ]
        .filter(Boolean)
        .join('<br>');
    } else {
      this.debug.classList.remove('visible');
    }
  }

  drawMap(player, realm, terrainSample = null) {
    const ctx = this.mapCtx;
    if (!ctx) return;
    const size = this.mapCanvas.width;
    const scale = 0.16; // pixels per metre at the default zoom
    ctx.clearRect(0, 0, size, size);
    ctx.save();
    ctx.translate(size / 2, size / 2);

    // terrain is painted by the world into a small image if provided
    if (terrainSample?.image) {
      ctx.globalAlpha = 0.85;
      ctx.drawImage(terrainSample.image, -size / 2, -size / 2, size, size);
      ctx.globalAlpha = 1;
    } else {
      ctx.fillStyle = 'rgba(10, 16, 22, 0.65)';
      ctx.beginPath();
      ctx.arc(0, 0, size / 2 - 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(150, 220, 255, 0.35)';
      ctx.stroke();
    }

    const toPx = (world) => (world - { x: player.position.x, z: player.position.z }[0]) * 0;
    void toPx;
    const px = (x) => (x - player.position.x) * scale;
    const pz = (z) => (z - player.position.z) * scale;

    // markers
    for (const marker of this.markers) {
      if (!marker.map) continue;
      const x = px(marker.x);
      const z = pz(marker.z);
      if (Math.hypot(x, z) > size / 2 - 8) continue;
      ctx.fillStyle = marker.color ?? '#8fd6ff';
      ctx.beginPath();
      ctx.arc(x, z, marker.radius ?? 2.4, 0, Math.PI * 2);
      ctx.fill();
      if (marker.label && marker.discovered) {
        ctx.fillStyle = 'rgba(230, 245, 255, 0.8)';
        ctx.font = '7px ui-monospace, monospace';
        ctx.fillText(marker.label, x + 4, z + 2);
      }
    }

    // player
    ctx.save();
    ctx.rotate(-player.yaw);
    ctx.fillStyle = '#eaf6ff';
    ctx.beginPath();
    ctx.moveTo(0, -5);
    ctx.lineTo(3.4, 4);
    ctx.lineTo(0, 2.2);
    ctx.lineTo(-3.4, 4);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.restore();

    this.mapCaption.textContent = realm ? `${realm.codename ?? realm.name}` : '';
  }

  setMapData(markers) {
    this.markers = markers ?? [];
    void this.mapData;
  }

  /* ---------------------------------------------------------------- *
   * Events
   * ---------------------------------------------------------------- */

  toast({ title, body = '', kind = 'info', duration = 5, icon = null } = {}) {
    const node = document.createElement('div');
    node.className = `toast toast-${kind}`;
    const iconNode = document.createElement('div');
    iconNode.className = 'toast-icon';
    iconNode.textContent = icon ?? (kind === 'discovery' ? '◎' : kind === 'truth' ? '◈' : kind === 'upgrade' ? '⬆' : '•');
    const textNode = document.createElement('div');
    textNode.className = 'toast-text';
    const titleNode = document.createElement('div');
    titleNode.className = 'toast-title';
    titleNode.textContent = title ?? '';
    textNode.appendChild(titleNode);
    if (body) {
      const bodyNode = document.createElement('div');
      bodyNode.className = 'toast-body';
      bodyNode.textContent = body;
      textNode.appendChild(bodyNode);
    }
    node.appendChild(iconNode);
    node.appendChild(textNode);
    this.toastStack.appendChild(node);
    requestAnimationFrame(() => node.classList.add('visible'));
    const life = setTimeout(() => {
      node.classList.remove('visible');
      setTimeout(() => node.remove(), 500);
    }, duration * 1000);
    this.toasts.push({ node, life });
    // Reap old toasts. Bounded on purpose: if a node ever refuses to detach,
    // a `while` here would spin forever and freeze the render loop.
    for (let guard = 0; guard < 12 && this.toastStack.children.length > 5; guard++) {
      const oldest = this.toastStack.firstChild;
      if (!oldest) break;
      oldest.remove();
    }
    this.onToast?.({ title, body, kind });
    return node;
  }

  flashScreen(color = '#ff5a5a', amount = 0.5) {
    this.flashColor = color;
    this.flashAmount = Math.max(this.flashAmount, amount);
  }

  scanPulseWide() {
    this.scanPulse = 1;
    this.reticle.classList.add('pulse');
    setTimeout(() => this.reticle.classList.remove('pulse'), 900);
  }

  showBanner(name, sub = '', seconds = 5.5) {
    this.bannerName.textContent = name;
    this.bannerSub.textContent = sub;
    this.banner.classList.add('visible');
    this.bannerTimeout = seconds;
  }

  setCinematicBars(on, { instant = false } = {}) {
    this.bars.classList.toggle('visible', !!on);
    this.bars.classList.toggle('instant', instant);
  }

  hideMinimap(hidden) {
    this.mapWrap.classList.toggle('hidden', hidden);
  }
}
