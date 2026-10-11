/**
 * THE MULTIVERSE — src/game.js
 * ==================================================================
 * THE ORCHESTRATOR. Everything that has been built in this repository —
 * terrain, water, sky, creatures, realms, audio, the post stack — is wired
 * together here into something you can actually play:
 *
 *   boot → LODEMUS loads → intro → main menu → reality → the loop.
 *
 * The loop is a fixed-step simulation (engine/loop.js) with a render pass
 * afterwards. All the expensive systems update on their own schedules; the
 * frame budget is spent where the player is looking.
 */
import { Vector3 } from 'three';

import { clamp, clamp01, lerp } from './core/math.js';
import { Rng, seedFromString } from './core/rand.js';
import { createSettings } from './settings.js';
import { createSaveSystem, createProgressTracker } from './save.js';
import {
  ARCHIVES,
  ARCHIVIST,
  DEATH_LINES,
  MACHINE,
  PROLOGUE,
  REALMS,
  SIMOLYSIS,
  TRUTHS,
  UPGRADES,
  WHISPERS,
  realmById,
} from './lore.js';

import { TextureLibrary } from './render/textures.js';
import { Renderer } from './render/renderer.js';
import { SkySystem } from './render/sky.js';
import { CinematicStage } from './render/cinematic.js';

import { World } from './world/world.js';
import { CreatureMaterials } from './world/creatures.js';
import { WATER_LEVEL } from './world/terrain.js';

import { InputSystem } from './engine/input.js';
import { Player, PLAYER_TUNING, surfaceTraction } from './engine/player.js';
import { CameraRig } from './engine/camera.js';
import { GameLoop, attachResizeHandler, attachVisibilityHandler } from './engine/loop.js';
import { InteractionSystem, LandmarkRegistry } from './engine/interact.js';
import { COMMENTARY, LODEMUS_LINES, LOADING_TIPS, MENU, SCAN_SUFFIXES, pickFrom } from './engine/text.js';

import { AudioEngine } from './audio/audio.js';

import { Hud } from './ui/hud.js';
import { Menu } from './ui/menu.js';
import { IntroSequence } from './ui/intro.js';
import { Codex } from './ui/codex.js';
import { LoadingScreen } from './ui/loading.js';

const FOOTSTEP_SURFACE = {
  grass: 'foot.grass',
  moss: 'foot.grass',
  soil: 'foot.sand',
  sand: 'foot.sand',
  rock: 'foot.rock',
  marble: 'foot.rock',
  crystal: 'foot.metal',
  metal: 'foot.metal',
  concrete: 'foot.rock',
  carpet: 'foot.grass',
  flesh: 'foot.water',
  coral: 'foot.rock',
  circuit: 'foot.metal',
  bark: 'foot.grass',
  leaf: 'foot.grass',
  snow: 'foot.sand',
};

/** Which truth is unlocked by what the player is doing, right now. */
const TRUTH_CHECKS = [
  { id: 'truth-dust', check: (g) => g.world.realmId === 'valley' && g.sky.daylight > 0.55 && g.player.position.y > 40 },
  { id: 'truth-water', check: (g) => g.player.state === 'water' || g.player.underwater },
  { id: 'truth-fall', check: (g) => (g.world.water?.waterfallProximity(g.player.position, 90) ?? 0) > 0.55 },
  { id: 'truth-eyes', check: (g) => g.world.realmId === 'cities' && g.nearestCreatureOfSpecies('eye', 40) != null },
  { id: 'truth-colossus', check: (g) => g.world.realmId === 'colossus' || g.player.position.y > 620 },
  { id: 'truth-machine', check: (g) => g.world.machine && g.world.machine.position.distanceTo(g.player.position) < 24 },
  { id: 'truth-god', check: (g) => g.peakReached || (g.player.position.y > 340 && g.player.state === 'flight') },
];

export class Game {
  constructor({ canvas, root = document.body } = {}) {
    this.canvas = canvas;
    this.root = root;
    this.phase = 'boot'; // boot | intro | menu | playing | paused | dead
    this.quality = null;
    this.settings = null;
    this.saveSystem = null;
    this.progress = null;
    this.textures = null;
    this.renderer = null;
    this.sky = null;
    this.world = null;
    this.player = null;
    this.camera = null;
    this.input = null;
    this.audio = null;
    this.hud = null;
    this.menu = null;
    this.intro = null;
    this.codex = null;
    this.loading = null;
    this.cinematic = null;
    this.interaction = null;
    this.landmarks = new LandmarkRegistry();
    this.loop = null;
    this.seen = new Set();
    this.timers = { commentary: 0, whispers: 0, autosave: 0, discovery: 0, hudSync: 0, audio: 0 };
    this.rng = new Rng(1337);
    this.frameStats = null;
    this.realmBannerShown = null;
    this.peakReached = false;
    this.debug = false;
    this.escapeReady = 0;
    this.slot = 'auto';
    this.gravityEffect = null;
    this.sense = {};
    this.distanceAtStart = 0;
    this.timeScale = 1;
    this._boundKeyHandler = (event) => this.onGlobalKey(event);
    this.frameCounter = 0;
    this.audioReady = false;
  }

  /* ================================================================ *
   * BOOT
   * ================================================================ */

  async boot() {
    // ---- canvas & settings ----
    this.loading = new LoadingScreen({ root: this.root });
    const steps = this.loading.steps([
      'READING THE LATTICE',
      'COMPILING SURFACE MEMORY',
      'GROWING THE VALLEY',
      'POPULATING THE FIRST DRAFT',
      'TUNING THE SKY',
      'WAKING THE MACHINE',
    ]);

    this.settings = createSettings({ preset: 'high' });
    const hadSettings = this.settings.load();
    if (!hadSettings) {
      const detected = this.settings.detectQuality?.() ?? 'high';
      this.settings.patch({ quality: detected }, { persist: true });
    }
    this.saveSystem = createSaveSystem();
    this.seed = this.settings.get('seed') || 1337;
    this.rng = new Rng(this.seed);
    this.quality = this.buildQuality();

    // ---- textures ----
    await this.yieldFrame();
    this.textures = new TextureLibrary({ quality: this.quality, seed: this.seed });
    this.textures.surface('grass', { seed: this.seed + 1 });
    steps();

    await this.yieldFrame();
    this.textures.waterNormal({ seed: this.seed + 3 });
    this.textures.surface('rock', { seed: this.seed + 2 });
    steps();

    // ---- renderer ----
    await this.yieldFrame();
    this.renderer = new Renderer({
      canvas: this.canvas,
      settings: this.settings,
      quality: this.quality,
      textures: this.textures,
      seed: this.seed,
    });
    steps();

    // ---- audio (starts suspended until the first gesture) ----
    this.audio = new AudioEngine({
      settings: this.settings,
      onSubtitle: (subtitle) => this.onSubtitle(subtitle),
    });

    // ---- input ----
    this.input = new InputSystem({
      canvas: this.canvas,
      settings: this.settings,
      onAction: (action, event) => this.onInputAction(action, event),
    });
    window.addEventListener('keydown', this._boundKeyHandler, true);

    // ---- UI ----
    await this.yieldFrame();
    this.hud = new Hud({ root: this.root, settings: this.settings });
    this.menu = new Menu({
      root: this.root,
      settings: this.settings,
      input: this.input,
      saveSystem: this.saveSystem,
      onAction: (kind, payload) => this.onMenuAction(kind, payload),
    });
    this.codex = new Codex({
      root: this.root,
      progress: null,
      onAction: (kind) => {
        if (kind === 'codex-closed') this.onCodexClosed();
      },
    });
    this.intro = new IntroSequence({
      root: this.root,
      audio: this.audio,
      onPhase: (phase) => this.onIntroPhase(phase),
      onComplete: () => this.onIntroComplete(),
    });
    this.interaction = new InteractionSystem({ maxDistance: 6.5 });
    steps();

    // ---- world ----
    await this.yieldFrame();
    this.progress = createProgressTracker(this.saveSystem, this.slot, this.seed);
    this.cinematic = new CinematicStage({ textures: this.textures, quality: this.quality, seed: this.seed });
    steps();

    await this.yieldFrame();
    this.sky = new SkySystem({
      scene: this.renderer.scene,
      renderer: this.renderer.renderer,
      textures: this.textures,
      quality: this.quality,
      settings: this.settings,
      seed: this.seed,
      onLightning: (power) => {
        this.hud?.flashScreen('#ffffff', 0.25 * power);
        this.camera?.addTrauma(0.35 * power);
        this.audio?.play('world.thunder', { gain: 0.8 });
      },
    });
    steps();

    await this.yieldFrame();
    this.player = new Player({
      field: null,
      tuning: {},
      spawn: { x: 0, y: 60, z: 0 },
    });
    this.renderer.attach({ scene: this.renderer.scene, sky: this.sky, onStats: (stats) => this.onStats(stats) });
    steps();

    // ---- camera rig ----
    // Before the world, not after: placing the player sets the rig's yaw so
    // the first frame already looks where the player is facing.
    this.camera = new CameraRig({ fov: this.settings.get('fov'), near: 0.15, far: 26000 });
    steps();

    await this.yieldFrame();
    this.buildWorld();
    steps();

    this.setupLoop();

    this.applySettings();
    this.settings.on((key) => this.onSettingChanged(key));

    await this.yieldFrame();
    this.loading.finish({ label: 'REALITY READY' });
    steps();

    // ---- go ----
    const introWatched = this.settings.get('endedEarth') || this.progress.get('introWatched');
    if (!introWatched) {
      this.startIntro();
    } else {
      this.showMenu();
    }
    this.loop.start();
    return this;
  }

  buildQuality() {
    const preset = this.settings.preset ?? {};
    return {
      ...preset,
      renderScale: this.settings.get('renderScale') ?? preset.renderScale ?? 1,
      pixelRatioCap: this.settings.get('pixelRatioCap') ?? preset.pixelRatioCap ?? 1.5,
      motionScale: this.settings.get('motionScale') ?? preset.motionScale ?? 0.35,
      viewDistance: this.settings.get('viewDistance') ?? 1,
      glitchIntensity: this.settings.get('glitchIntensity') ?? 0.5,
      autoQuality: this.settings.get('autoQuality'),
      seed: this.seed,
    };
  }

  /** Build the hub world and everything in it. */
  buildWorld() {
    const scene = this.renderer.scene;
    const materials = new CreatureMaterials(this.textures, this.seed);
    this.world = new World({
      scene,
      renderer: this.renderer.renderer,
      camera: this.renderer.camera,
      textures: this.textures,
      quality: this.quality,
      seed: this.seed,
      progress: this.progress,
      audio: this.audio,
      materials,
    });
    this.world.buildValley();

    // Player plugs into the valley
    this.player.field = this.world.field;
    this.player.groundProvider = (x, z, y) => this.world.groundHeight(x, z, y);
    this.player.abilities.fly = (this.progress.get('upgrades')?.flight ?? 0) > 0 || this.settings.get('godMode');
    this.player.abilities.ghost = true;
    this.spawnPlayer();

    // Landmarks become discoverable places
    const landmarks = this.world.field.landmarks?.(this.quality.landmarkCount ?? 14) ?? [];
    for (const landmark of landmarks) {
      this.landmarks.add('valley', {
        id: landmark.id ?? landmark.name,
        name: landmark.name,
        x: landmark.x,
        z: landmark.z,
        y: landmark.y ?? this.world.field.heightAt(landmark.x, landmark.z),
        kind: landmark.kind ?? 'peak',
        realm: 'valley',
      });
    }
    for (const fall of this.world.water?.waterfalls ?? []) {
      this.landmarks.add('valley', { id: `fall-${fall.id}`, name: fall.name, x: fall.x, z: fall.z, y: this.world.field.heightAt(fall.x, fall.z), kind: 'waterfall', realm: 'valley' });
    }
    this.registerInteractables();

    // creature callbacks: audio + discovery
    this.world.population.onSpawn = (creature, firstTime) => {
      if (firstTime) this.discoverSpecies(creature);
    };
    this.world.population.onAttack = (creature, target) => {
      if (target === this.player) {
        this.hud?.flashScreen('#ff4d4d', 0.4);
        this.camera?.addTrauma(0.5);
        this.audio?.play('player.hurt', { gain: 0.7 });
        this.player.health = clamp01(this.player.health - 0.08);
      }
    };
    this.world.population.onCall = (creature) => this.creatureCall(creature);

    // player callbacks: footsteps, splashes, landings
    this.player.onFootstep = (kind) => this.footstep(kind);
    this.player.onSplash = (kind, position, power) => this.splash(kind, position, power);
    this.player.onSwimStroke = () => this.audio?.play('water.wade', { gain: 0.4 });
    this.player.onLand = (impact, damage) => {
      if (damage > 0) {
        this.hud?.flashScreen('#ff5a5a', clamp01(damage * 3));
        this.audio?.play('player.hurt', { gain: 0.5 });
      }
      this.camera?.addTrauma(clamp01(impact / 40) * 0.6);
    };

    // world → game events
    this.world.onRealmEntered = (realm) => this.onRealmEntered(realm);

    return this;
  }

  /** Find a beautiful, walkable place to wake up in. */
  spawnPlayer() {
    const field = this.world.field;
    const rng = new Rng(this.seed ^ 0x51);
    let best = null;
    for (let i = 0; i < 400; i++) {
      const angle = rng.angle();
      const radius = lerp(120, field.options.valleyRadius * 0.85, Math.sqrt(rng.float()));
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      const height = field.heightAt(x, z);
      if (height < 3 || height > 180) continue;
      const slope = field.slopeAt(x, z);
      const water = field.shoreDistance?.(x, z, 8, 14) ?? 999;
      // Prefer: near water, flat-ish, with a view (height 20-120).
      const score =
        -Math.abs(height - 52) * 0.02 -
        slope * 6 -
        Math.abs(water - 70) * 0.012 +
        (rng.float() - 0.5) * 0.4;
      if (!best || score > best.score) best = { x, z, score, height };
    }
    const spawn = best ?? { x: 0, z: 0, height: field.heightAt(0, 0) };
    this.spawnPoint = new Vector3(spawn.x, spawn.height + 1.2, spawn.z);
    this.player.reset({ x: this.spawnPoint.x, y: this.spawnPoint.y, z: this.spawnPoint.z });
    this.player.yaw = Math.atan2(-spawn.x, -spawn.z) + Math.PI;
    this.player.pitch = -0.05;
    if (this.camera) {
      this.camera.yaw = this.player.yaw;
      this.camera.pitch = this.player.pitch;
    }
    this.renderer.camera.position.set(spawn.x, spawn.height + PLAYER_TUNING.eyeHeight, spawn.z);
    return this.spawnPoint;
  }

  /* ================================================================ *
   * INTRO
   * ================================================================ */

  startIntro() {
    this.phase = 'intro';
    this.hud.setVisible(false);
    this.cinematic.update(0, { phase: 'title' });
    this.intro.start();
    this.settings.set('endedEarth', false);
    this.audio?.init?.();
  }

  onIntroPhase(phase) {
    this.cinematic.setPhase(phase, { time: 0 });
    this.hud.setCinematicBars(true);
    switch (phase) {
      case 'burst':
        this.audio?.play('energy.burst', { gain: 1 });
        this.cinematic.shockwave();
        break;
      case 'dust':
        this.audio?.play('dust.ignite', { gain: 0.8 });
        break;
      case 'machine':
        this.audio?.play('machine.start', { gain: 0.9 });
        break;
      case 'plug':
        this.audio?.play('lodemus.hum', { gain: 0.7 });
        break;
      case 'simolysis':
        this.audio?.setMusicTheme('wonder', { immediate: false });
        break;
      case 'menu':
        this.audio?.setMusicTheme('void', { immediate: false });
        break;
      default:
        break;
    }
  }

  onIntroComplete() {
    this.hud.setCinematicBars(false);
    this.progress.set('introWatched', true);
    this.progress.set('chapter', Math.max(this.progress.get('chapter'), 1));
    this.settings.set('endedEarth', true);
    this.progress.flush();
    this.showMenu();
  }

  /* ================================================================ *
   * MENU
   * ================================================================ */

  showMenu() {
    this.phase = 'menu';
    this.hud.setVisible(false);
    this.menu.show('main');
    this.cinematic.setPhase('menu', { time: 0 });
    this.audio?.setMusicTheme('void', { immediate: false });
    this.audio?.narrate(pickFrom(ARCHIVIST.menu ?? ['The multiverse is full of potential. Choose a door.'], this.rng.int(0, 999)), {
      mood: 'reverent',
      priority: 0,
    });
  }

  onMenuAction(kind, payload) {
    if (kind === 'sfx') {
      this.audio?.play(payload, { gain: 0.8 });
      return;
    }
    switch (kind) {
      case 'menu':
        this.handleMenuChoice(payload);
        break;
      case 'pause':
        this.handlePauseChoice(payload);
        break;
      case 'settings':
        this.applySettingChange(payload.key, payload.value);
        break;
      case 'reality':
        this.enterRealm(payload, { transition: true, reason: 'menu' });
        break;
      case 'save':
        this.loadSlot(payload);
        break;
      default:
        break;
    }
  }

  handleMenuChoice(choice) {
    this.audio?.init?.();
    switch (choice) {
      case 'play':
        this.startFrameCounter();
        this.phase = 'playing';
        this.menu.hide();
        this.hud.setVisible(this.settings.get('hud') !== false);
        this.audio?.setMusicTheme(realmById(this.world.realmId).music, { immediate: false });
        this.narrateOnce('firstStepValley', COMMENTARY.firstStepValley);
        this.audio?.narrate(LODEMUS_LINES.boot[0], { mood: 'calm', speaker: 'LODEMUS', priority: 1 });
        this.input.requestPointerLock();
        break;
      case 'continue':
        this.continueSave();
        break;
      case 'settings':
        this.menu.show('settings');
        break;
      case 'realities':
        this.menu.show('realities');
        break;
      case 'codex':
        this.codex.show();
        this.menu.hide();
        break;
      case 'credits':
        this.menu.show('credits');
        break;
      case 'quit':
        this.quit();
        break;
      case 'saves':
        this.menu.show('saves');
        break;
      case 'main':
      case 'main-escape':
        this.showMenu();
        break;
      case 'pause':
        this.menu.show('pause');
        break;
      case 'resume':
        this.togglePause(false);
        break;
      default:
        break;
    }
  }

  handlePauseChoice(choice) {
    switch (choice) {
      case 'resume':
        this.togglePause(false);
        break;
      case 'settings':
        this.menu.show('settings');
        break;
      case 'codex':
        this.codex.show();
        this.menu.hide();
        break;
      case 'map':
        this.hud.hideMinimap(false);
        break;
      case 'save':
        this.saveNow('quicksave');
        break;
      case 'menu':
        this.togglePause(false);
        this.saveNow('auto');
        this.showMenu();
        break;
      default:
        break;
    }
  }

  continueSave() {
    const slots = this.saveSystem.list().filter((slot) => !slot.empty && !slot.corrupt);
    if (slots.length === 0) {
      this.handleMenuChoice('play');
      return;
    }
    const newest = slots.sort((a, b) => String(b.updatedAt ?? '').localeCompare(String(a.updatedAt ?? '')))[0];
    this.loadSlot(newest.slot, { start: true });
  }

  loadSlot(slot, { start = false } = {}) {
    this.slot = slot;
    this.progress = createProgressTracker(this.saveSystem, slot, this.seed);
    this.codex.progress = this.progress;
    this.world.progress = this.progress;
    const data = this.saveSystem.read(slot);
    if (data?.position) {
      this.player.reset({
        x: data.position[0] ?? this.spawnPoint.x,
        y: data.position[1] ?? this.spawnPoint.y,
        z: data.position[2] ?? this.spawnPoint.z,
      });
      this.player.yaw = data.rotation?.[0] ?? this.player.yaw;
    }
    this.applyUpgrades();
    this.hud.toast({ title: 'REALITY RESTORED', body: `${slot.toUpperCase()} · chapter ${this.progress.get('chapter')}`, kind: 'info' });
    if (start || this.phase === 'menu') {
      this.phase = 'playing';
      this.menu.hide();
      this.hud.setVisible(true);
      this.input.requestPointerLock();
    }
  }

  saveNow(slot = 'quicksave') {
    this.progress.update((state) => {
      state.position = [this.player.position.x, this.player.position.y, this.player.position.z];
      state.rotation = [this.player.yaw, this.player.pitch];
      state.realm = this.world.realmId;
      state.seed = this.seed;
      state.discoveredCount = Object.keys(state.discovered).length;
    });
    this.progress.flush();
    this.saveSystem.write(slot, this.progress.state);
    this.world.setRealmVisibility?.(this.world.realmId);
    this.hud.toast({ title: 'SAVED', body: `${slot.toUpperCase()} — the lattice keeps your place.`, kind: 'upgrade' });
    this.audio?.play('ui.confirm', { gain: 0.7 });
    this.narrateOnce('quicksave', COMMENTARY.quicksave);
    return true;
  }

  quit() {
    this.audio?.stopSpeaking?.();
    this.saveNow('auto');
    // Browsers refuse window.close() unless the tab was script-opened; be honest.
    this.menu.show('credits');
    this.hud.toast({
      title: 'THE MACHINE STAYS ON',
      body: 'Close the tab to unplug. LODEMUS will hold this reality exactly as you left it.',
      kind: 'truth',
      duration: 9,
    });
    this.audio?.narrate('You cannot leave through the front door. There has never been a front door.', { mood: 'dread', speaker: 'LODEMUS', priority: 2 });
  }

  /* ================================================================ *
   * REALITY TRANSITIONS
   * ================================================================ */

  async enterRealm(id, { transition = true, reason = 'portal' } = {}) {
    if (!this.world.realmData) return false;
    const realm = realmById(id);
    if (!realm) return false;
    // Requirement gate
    const requirement = realm.requirements?.chapter ?? 0;
    if ((this.progress.get('chapter') ?? 0) < requirement) {
      this.hud.toast({ title: 'SEALED', body: `${realm.name} requires chapter ${requirement}.`, kind: 'info' });
      this.audio?.play('ui.error', { gain: 0.6 });
      this.audio?.narrate(pickFrom(COMMENTARY.portalLocked, this.rng.int(0, 3)), { mood: 'calm', priority: 0 });
      return false;
    }
    this.phase = 'transition';
    this.hud.setCinematicBars(true);
    this.audio?.play('portal.enter', { gain: 0.9 });
    this.camera.addTrauma(0.35);
    const entered = await this.world.enterRealm(id, { transition, reason });
    if (!entered) {
      this.phase = 'playing';
      return false;
    }
    // Player follows the new reality: reset physics, keep position when the
    // realm provides its own floor within a sane distance.
    const target = this.realmSpawn(id);
    this.player.reset(target);
    this.player.field = this.realmFieldFor(id);
    this.applyUpgrades();
    this.registerInteractables();
    this.hud.setCinematicBars(false);
    this.phase = 'playing';
    this.audio?.play('realm.arrive', { gain: 0.9 });
    this.world.setRealmVisibility?.(id);
    this.updateCompassMarkers();
    return true;
  }

  realmSpawn(id) {
    switch (id) {
      case 'colossus':
        return { x: 0, y: 620, z: 0 };
      case 'cities':
        return { x: 0, y: 300, z: 0 };
      case 'deep':
        return { x: 0, y: -60, z: 0 };
      case 'microverse':
        return { x: 0, y: -140, z: 0 };
      case 'fractal':
        return { x: 0, y: 6, z: 120 };
      case 'singularity':
        return { x: 0, y: 40, z: 900 };
      case 'void':
        return { x: 0, y: 4, z: 0 };
      case 'heaven':
        return { x: 0, y: 30, z: 0 };
      case 'backrooms':
        return { x: 0.5, y: 2.2, z: 0.5 };
      case 'maze':
        return { x: 0, y: 2.2, z: 0 };
      case 'midnight':
        return { x: 0, y: 2.4, z: 0 };
      default:
        return { x: this.spawnPoint?.x ?? 0, y: (this.spawnPoint?.y ?? 40) + 1, z: this.spawnPoint?.z ?? 0 };
    }
  }

  /** Alternate realities have flat or bespoke floors; give the player a test. */
  realmFieldFor(id) {
    if (id === 'valley') return this.world.field;
    const world = this.world;
    const field = {
      options: { worldRadius: 3000 },
      heightAt: (x, z) => {
        // realms that implement a ground provider are handled separately
        switch (id) {
          case 'backrooms':
          case 'maze':
          case 'midnight':
          case 'fractal':
            return 0;
          case 'void':
            return 0;
          case 'singularity':
            return 0;
          case 'heaven':
            return -40;
          case 'deep':
            return -120;
          case 'microverse':
            return -150;
          case 'colossus':
            return world.colossus?.surfaceHeightAt({ x, y: this.player.position.y, z }) ?? 380;
          case 'cities': {
            const height = world.concordance?.surfaceHeightAt({ x, y: this.player.position.y, z });
            return height ?? 200;
          }
          default:
            return 0;
        }
      },
      normalAt: (x, z, out) => out,
      slopeAt: () => 0,
      isWater: () => false,
      biomeAt: (x, z) => ({ biome: { id, name: id, grassDensity: 0, treeDensity: 0, creatureDensity: 0, ambient: 'reverb' }, moisture: 0, warmth: 0, slope: 0, height: 0 }),
      depthAt: () => 0,
    };
    return field;
  }

  onRealmEntered(realm, reason) {
    const realmData = realmById(realm.id ?? realm);
    this.progress.update((state) => {
      if (!state.realmsVisited.includes(realmData.id)) state.realmsVisited.push(realmData.id);
      state.stats.portalsEntered = (state.stats.portalsEntered || 0) + 1;
    });
    this.hud.showBanner(realmData.name, realmData.tagline, 7);
    this.sky.applyRealmWeather?.(realmData);
    this.renderer.post?.applyRealmLook?.(realmData);
    this.hud.toast({ title: realmData.name, body: realmData.entry, kind: 'discovery', duration: 8 });
    this.camera.kick(-2);
    this.camera.addTrauma(0.25);
    // Chapter progression by exploration.
    const visited = this.progress.get('realmsVisited').length;
    const truths = this.progress.get('truthsFound').length;
    const chapter = Math.max(
      this.progress.get('chapter'),
      visited >= 4 ? 2 : 1,
      visited >= 8 ? 3 : 0,
      truths >= 3 ? 4 : 0,
      truths >= 7 ? 5 : 0
    );
    if (chapter > this.progress.get('chapter')) {
      this.progress.set('chapter', chapter);
      this.hud.toast({ title: `CHAPTER ${chapter}`, body: 'New realities have been compiled for you.', kind: 'upgrade', duration: 7 });
      this.audio?.play('level.up', { gain: 0.8 });
    }
    void reason;
  }

  /* ================================================================ *
   * INTERACTABLES
   * ================================================================ */

  registerInteractables() {
    this.interaction.clear();
    if (this.world.realmId !== 'valley') {
      this.registerRealmInteractables();
      return;
    }
    for (const portal of this.world.portals) {
      const realm = realmById(portal.targetRealm);
      this.interaction.register({
        id: `portal-${portal.targetRealm}`,
        position: () => portal.group.position,
        label: `${realm.name} — ${realm.codename}`,
        verb: 'enter',
        radius: 5,
        priority: 2,
        onInteract: () => this.enterRealm(portal.targetRealm, { reason: 'portal' }),
      });
    }
    for (const fragment of this.world.fragments) {
      if (fragment.collected) continue;
      this.interaction.register({
        id: `fragment-${fragment.index}`,
        position: () => fragment.group.position,
        label: 'ARCHIVE FRAGMENT',
        verb: 'take',
        radius: 2.6,
        priority: 3,
        onInteract: () => this.collectFragment(fragment),
      });
    }
    if (this.world.machine) {
      this.interaction.register({
        id: 'machine',
        position: () => this.world.machine.group.position,
        label: 'LODEMUS CHASSIS',
        verb: 'touch',
        radius: 12,
        priority: 1,
        onInteract: () => this.touchMachine(),
      });
    }
    for (const wormhole of this.world.wormholes) {
      this.interaction.register({
        id: `wormhole-${this.world.wormholes.indexOf(wormhole)}`,
        position: () => wormhole.group.position,
        label: 'WORMHOLE — DO NOT RESIST',
        verb: 'watch',
        radius: 60,
        priority: 0,
        onInteract: () => {
          this.audio?.play('wormhole.suck', { gain: 0.9 });
          this.camera.addTrauma(0.6);
          this.hud.toast({ title: 'GRAVITY ADVISES YOU', body: 'It is pulling. You are deciding.', kind: 'truth' });
        },
      });
    }
    this.interaction.register({
      id: 'creature-nearest',
      position: () => this.nearestCreaturePosition(),
      requires: () => this.nearestCreatureOfSpecies(null, 14) != null,
      label: 'OBSERVE',
      verb: 'approach',
      radius: 4,
      priority: 0,
      onInteract: () => this.observeCreature(),
    });
  }

  registerRealmInteractables() {
    const realm = this.world.realm;
    if (!realm) return;
    if (realm.tvs) {
      for (const [index, tv] of realm.tvs.entries()) {
        this.interaction.register({
          id: `tv-${index}`,
          position: () => tv.node.position,
          label: tv.broadcast ? `KVLX-MIDNIGHT · ${tv.broadcast.speaker}` : 'TELEVISION',
          verb: 'watch',
          radius: 3,
          priority: 2,
          enabled: true,
          onInteract: () => {
            tv.active = true;
            tv.timer = 14;
            this.audio?.play('tv.static', { gain: 0.9 });
            if (tv.broadcast) {
              this.audio?.narrate(tv.broadcast.text, { mood: tv.broadcast.kind === 'film' ? 'heroic' : 'calm', speaker: tv.broadcast.speaker, priority: 2 });
            }
            this.progress.addStat('tvsBreached');
          },
        });
      }
    }
    if (realm.concordance) {
      for (const island of realm.concordance.islands) {
        this.interaction.register({
          id: `island-${island.id}`,
          position: () => island.group.position,
          label: `${island.name} — FLOATING DISTRICT`,
          verb: 'inspect',
          radius: island.radius,
          priority: 1,
          onInteract: () => {
            this.hud.toast({ title: island.name, body: 'A district that voted to stop touching the ground.', kind: 'discovery' });
            this.progress.discover(`island-${island.id}`);
          },
        });
      }
    }
    if (realm.wormholes) {
      for (const wormhole of realm.wormholes) {
        this.interaction.register({
          id: `realm-wormhole-${realm.wormholes.indexOf(wormhole)}`,
          position: () => wormhole.group.position,
          label: 'WORMHOLE',
          verb: 'watch',
          radius: 80,
          priority: 0,
          onInteract: () => this.audio?.play('wormhole.suck', { gain: 0.8 }),
        });
      }
    }
    if (realm.droplet) {
      this.interaction.register({
        id: 'droplet',
        position: () => realm.droplet.group.position,
        label: 'A SINGLE DROP OF WATER, CATHEDRAL-SIZED',
        verb: 'inspect',
        radius: realm.droplet.radius,
        priority: 1,
        onInteract: () => {
          this.hud.toast({ title: 'SURFACE TENSION', body: 'It is holding a world in there. Politely.', kind: 'discovery' });
          this.progress.discover('droplet');
        },
      });
    }
    if (realm.colossus) {
      this.interaction.register({
        id: 'colossus',
        position: () => realm.colossus.group.position,
        label: 'THE GREAT ONE — DO NOT WAKE IT',
        verb: 'inspect',
        radius: 400,
        priority: 0,
        onInteract: () => {
          this.hud.toast({ title: 'THE GREAT ONE', body: 'There are cities in its fur. The oldest is empty and smells of libraries.', kind: 'truth' });
          this.progress.findTruth('truth-colossus');
          this.onTruthFound('truth-colossus');
        },
      });
    }
    // Always allow going home.
    this.interaction.register({
      id: 'return-to-valley',
      position: () => this.player.position,
      label: 'RETURN TO THE FIRST DRAFT',
      verb: 'wake up',
      radius: 0.1,
      priority: -1,
      enabled: this.progress.get('realmsVisited').length > 1,
      onInteract: () => this.world.returnToValley().then(() => this.onRealmEntered('valley', 'return')),
    });
  }

  collectFragment(fragment) {
    const archive = ARCHIVES[fragment.index % ARCHIVES.length];
    fragment.collect();
    this.progress.addArchive(archive.id);
    this.progress.addStat('itemsCollected');
    this.progress.update((state) => {
      state.essence = (state.essence || 0) + 25;
    });
    this.interaction.unregister(`fragment-${fragment.index}`);
    this.audio?.play('essence.pickup', { gain: 0.9 });
    this.hud.flashScreen('#ffe6a8', 0.18);
    this.hud.toast({ title: archive.title, body: 'Recovered to the codex (TAB).', kind: 'discovery' });
    this.codex.present({ title: archive.title, sub: archive.realm?.toUpperCase(), body: archive.text, kind: 'archive' });
    this.narrateOnce('firstFragment', COMMENTARY.firstFragment);
    this.updateCompassMarkers();
    return archive;
  }

  touchMachine() {
    const machine = this.world.machine;
    machine.used = true;
    this.progress.set('metSimolysis', true);
    this.progress.findTruth('truth-machine');
    this.onTruthFound('truth-machine');
    this.audio?.play('lodemus.hum', { gain: 0.9 });
    this.audio?.narrate(pickFrom(COMMENTARY.machineRemembrance, this.rng.int(0, 99)), { mood: 'reverent', speaker: 'LODEMUS', priority: 2 });
    this.hud.toast({ title: 'THE LODEMUS CHASSIS', body: MACHINE.promise ?? 'Your body is optional. Your existence is not.', kind: 'truth', duration: 8 });
    this.camera.addTrauma(0.2);
  }

  onTruthFound(id) {
    const truth = TRUTHS.find((t) => t.id === id);
    if (!truth) return;
    this.hud.toast({ title: `TRUTH ${truth.index}: ${truth.title}`, body: truth.completion ?? truth.hint, kind: 'truth', duration: 9 });
    this.audio?.play('discover.new', { gain: 1 });
    this.hud.flashScreen('#ffffff', 0.25);
    this.camera.kick(-1.5);
    this.codex.present({ title: truth.title, sub: `TRUTH ${truth.index}`, body: truth.body, kind: 'truth' });
    const found = this.progress.get('truthsFound').length;
    if (found >= TRUTHS.length) this.onAllTruths();
    else this.audio?.narrate(pickFrom(SIMOLYSIS.lines.truth, this.rng.int(0, 9)), { mood: 'god', character: 'god', speaker: 'SIMOLYSIS', priority: 1 });
  }

  onAllTruths() {
    this.hud.showBanner('THE LATTICE IS OPEN', 'Everything you want next, you can now author.', 10);
    this.audio?.setMusicTheme('ascension', { immediate: false });
    this.audio?.narrate(SIMOLYSIS.lines.final[0], { mood: 'god', character: 'god', speaker: 'SIMOLYSIS', priority: 3 });
    this.progress.set('chapter', 5);
    this.progress.update((state) => {
      state.essence = (state.essence || 0) + 2000;
    });
  }

  observeCreature() {
    const found = this.nearestCreatureOfSpecies(null, 60);
    if (!found) return false;
    this.discoverSpecies(found, true);
    this.audio?.play('scan.pulse', { gain: 0.5 });
    return true;
  }

  discoverSpecies(creature, force = false) {
    const species = creature.species;
    const isNew = !this.progress.isDiscovered(species.id);
    this.progress.discover(species.id);
    this.progress.update((state) => {
      if (!state.scannedSpecies.includes(species.id)) state.scannedSpecies.push(species.id);
    });
    if (isNew || force) {
      this.hud.toast({
        title: isNew ? `NEW SPECIES: ${species.name}` : species.name,
        body: `${species.behavior} · ${pickFrom(SCAN_SUFFIXES, species.id.length * 7)}`,
        kind: 'discovery',
        icon: '◎',
      });
      if (isNew) {
        this.audio?.play('discover.new', { gain: 0.7 });
        this.progress.update((state) => {
          state.essence = (state.essence || 0) + 40;
          state.stats.creaturesSeen = (state.stats.creaturesSeen || 0) + 1;
        });
        const key = keyForSpecies(species.id);
        if (key) this.narrateOnce(key, COMMENTARY[key]);
      }
    }
    return isNew;
  }

  /**
   * The truth lattice: conditions are evaluated continuously and fire once.
   */
  checkTruths() {
    const found = this.progress.get('truthsFound');
    if (found.length >= TRUTHS.length) return;
    for (const entry of TRUTH_CHECKS) {
      if (found.includes(entry.id)) continue;
      if (entry.check(this)) {
        this.progress.findTruth(entry.id);
        this.onTruthFound(entry.id);
      }
    }
  }

  nearestCreaturePosition() {
    const found = this.nearestCreatureOfSpecies(null, 120);
    return found ? found.position : this.player.position;
  }

  nearestCreatureOfSpecies(speciesId, maxDistance = 40) {
    const population = this.world.population;
    if (!population) return null;
    let best = null;
    let bestDistance = maxDistance;
    for (const creature of population.creatures) {
      if (speciesId && creature.species.id !== speciesId) continue;
      const distance = creature.distanceTo(this.player.position);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = creature;
      }
    }
    return best;
  }

  /* ================================================================ *
   * AUDIO GLUE
   * ================================================================ */

  footstep(kind) {
    if (!this.audio || this.audio.muted) return;
    if (kind === 'jump') {
      this.audio.play('player.jump', { gain: 0.6, rate: 0.9 + this.rng.float() * 0.2 });
      return;
    }
    if (kind === 'land' || kind === 'heavy') {
      this.audio.play('player.land', { gain: kind === 'heavy' ? 1 : 0.6 });
      return;
    }
    const biome = this.world.field?.biomeAt?.(this.player.position.x, this.player.position.z);
    const surfaces = biome?.biome?.surfaces ?? ['grass'];
    const kindName = surfaces[(this.rng.int(0, surfaces.length - 1))] ?? surfaces[0] ?? 'grass';
    const id = this.player.underwater || this.player.state === 'water' ? 'foot.water' : FOOTSTEP_SURFACE[kindName] ?? 'foot.grass';
    const gain = kind === 'run' ? 0.55 : 0.34;
    this.audio.play(id, {
      gain: gain * surfaceTraction(biome?.biome?.id ?? 'meadow', this.world._wetness ?? 0),
      pan: clamp((this.rng.float() - 0.5) * 0.5, -1, 1),
      rate: 0.9 + this.rng.float() * 0.25,
      minInterval: 0.06,
    });
  }

  splash(kind, position, power) {
    if (kind === 'enter') {
      this.audio?.play('water.enter', { gain: clamp01(0.4 + power / 30) });
      this.hud?.flashScreen('#9fd8ff', 0.14);
      this.camera?.addTrauma(clamp01(power / 40) * 0.3);
      this.world.water?.registerSplash?.(position, clamp01(power / 18) + 0.4, () => {});
    } else {
      this.audio?.play('water.splash', { gain: 0.5 });
    }
  }

  creatureCall(creature) {
    const map = {
      grazer: 'creature.grazer',
      strider: 'creature.strider',
      bloomback: 'creature.grazer',
      skitterjaw: 'creature.skitterjaw',
      lusca: 'creature.whale',
      skywhale: 'creature.whale',
      eye: 'creature.eye',
      mothlight: 'creature.moth',
      titanroot: 'creature.colossus',
      attendant: 'creature.eye',
      ant: 'creature.ant',
    };
    const id = map[creature.species.id];
    if (!id) return;
    const distance = creature.distanceTo(this.player.position);
    const gain = clamp01(1 - distance / 260) * 0.7;
    if (gain <= 0.02) return;
    this.audio?.play(id, { gain: gain * (0.4 + (creature.species.rarity ?? 0.5)), rate: 0.85 + this.rng.float() * 0.3 });
  }

  /** Periodic context: biome ambience, soundtrack intensity, subtitles. */
  updateAudio(dt) {
    if (!this.audio) return;
    this.audio.setListener({
      x: this.renderer.camera.position.x,
      y: this.renderer.camera.position.y,
      z: this.renderer.camera.position.z,
      forwardX: Math.sin(this.player.yaw),
      forwardZ: Math.cos(this.player.yaw),
      rightX: Math.cos(this.player.yaw),
      rightZ: -Math.sin(this.player.yaw),
    });
    this.timers.audio -= dt;
    if (this.timers.audio > 0) return;
    this.timers.audio = 0.35;
    const context = this.world.environmentContext(this.player.position, this.sky.weather);
    this.audio.setEnvironment(context);
    const danger = this.nearestPredatorDanger();
    this.audio.setMusicIntensity(clamp01(0.35 + danger * 0.6 + (this.world.isUnderwater ? 0.2 : 0)));
    if (context.nearWaterfall > 0.5) this.audio.play('waterfall.near', { gain: context.nearWaterfall * 0.5, minInterval: 2.5 });
    if (danger > 0.7) this.narrateOnce('dangerMusic', [LODEMUS_LINES.danger], { cooldown: 30 });
    this.lastContext = context;
  }

  nearestPredatorDanger() {
    const population = this.world.population;
    if (!population) return 0;
    let danger = 0;
    for (const creature of population.creatures) {
      if ((creature.species.aggression ?? 0) < 0.5) continue;
      const distance = creature.distanceTo(this.player.position);
      danger = Math.max(danger, clamp01(1 - distance / 60) * creature.species.aggression);
    }
    return danger;
  }

  onSubtitle(subtitle) {
    // One caption bar for the whole game, whether we are in the intro, the
    // menu or standing in a lake.
    this.showCaption(subtitle);
  }

  /** A single shared subtitle bar that works in menus, intro and gameplay. */
  showCaption({ text, speaker = null, duration = 4 } = {}) {
    if (!this.captionNode) {
      this.captionNode = document.createElement('div');
      this.captionNode.className = 'caption-bar';
      this.root.appendChild(this.captionNode);
    }
    if (this.settings.get('subtitles') === false) {
      this.captionNode.classList.remove('visible');
      return;
    }
    this.captionNode.innerHTML = speaker ? `<b>${escapeHtml(speaker)}:</b> ${escapeHtml(text)}` : escapeHtml(text);
    this.captionNode.classList.add('visible');
    clearTimeout(this._captionTimeout);
    this._captionTimeout = setTimeout(() => this.captionNode.classList.remove('visible'), Math.max(1.6, duration) * 1000);
  }

  narrateOnce(key, lines, { cooldown = 0 } = {}) {
    if (!lines || lines.length === 0) return false;
    const now = performance.now();
    if (cooldown > 0) {
      const last = this.seen.get(`${key}:time`);
      if (last && now - last < cooldown * 1000) return false;
      this.seen.set(`${key}:time`, now);
    } else {
      if (this.seen.has(key)) return false;
      this.seen.add(key);
    }
    const line = pickFrom(lines, this.rng.int(0, 9973));
    return this.audio?.narrate(line, { mood: 'calm', priority: cooldown > 0 ? 0 : 1 }) ?? false;
  }

  /* ================================================================ *
   * LOOP
   * ================================================================ */

  setupLoop() {
    this.loop = new GameLoop({
      onFixed: (dt) => this.fixedUpdate(dt),
      onFrame: (dt, alpha) => this.renderFrame(dt, alpha),
    });
    this.resizeHandler = attachResizeHandler(({ width, height }) => this.onResize(width, height));
    this.visibilityHandler = attachVisibilityHandler(this.loop, {
      onHidden: () => {
        if (this.phase === 'playing') this.togglePause(true);
      },
    });
    this.onResize(window.innerWidth, window.innerHeight, true);
  }

  onResize(width, height, force = false) {
    this.renderer?.resize(width, height);
    if (force) this.renderer?.resize(width, height);
  }

  togglePause(paused) {
    if (paused) {
      this.phase = 'paused';
      this.loop.setPaused(true);
      this.menu.show('pause');
      this.input.exitPointerLock();
      this.hud.setVisible(false);
    } else {
      this.phase = 'playing';
      this.loop.setPaused(false);
      this.menu.hide();
      this.hud.setVisible(this.settings.get('hud') !== false);
      this.input.requestPointerLock();
    }
  }

  /** Fixed-step simulation: physics and everything that must be stable. */
  fixedUpdate(dt) {
    if (!this.world || !this.player) return;
    const controlling = this.phase === 'playing' || this.phase === 'transition';

    if (controlling) {
      this.player.update(dt, {
        input: this.input,
        realm: this.world.realmData,
        waterLevel: this.world.realmId === 'valley' ? WATER_LEVEL : this.realmWaterLevel(),
        underwater: this.world.isUnderwater,
        movingGround: null,
        mode: 'normal',
      });
      // Upgrades
      this.applyUpgrades();
    } else {
      this.player.update(dt, { input: null, realm: this.world.realmData, mode: 'ui' });
    }

    // Interaction focus (also in menu-free exploration only)
    if (controlling) {
      const eye = this.renderer.camera.position;
      const forward = this.camera.forward();
      this.interaction.update(dt, eye, forward, { player: this.player, game: this });
      if (this.input.wasPressed('interact')) {
        const result = this.interaction.trigger({ game: this, player: this.player });
        if (result === false) this.audio?.play('ui.error', { gain: 0.5 });
      }
    }
  }

  realmWaterLevel() {
    switch (this.world.realmId) {
      case 'deep':
        return 200; // you are inside the ocean
      case 'microverse':
        return -60;
      case 'backrooms':
      case 'maze':
      case 'midnight':
      case 'fractal':
      case 'void':
      case 'heaven':
      case 'colossus':
      case 'cities':
      default:
        return -9999;
    }
  }

  /** Per-frame: world systems, sky, audio, HUD, rendering. */
  renderFrame(dt, alpha) {
    const clock = Math.min(dt || 1 / 60, 0.1);
    this.frameCounter++;

    if (this.phase === 'intro' || this.phase === 'menu') {
      this.cinematic.update(clock, {});
      this.renderer.renderScene(this.cinematic.scene, this.cinematic.camera);
      this.intro.update(clock);
      this.loading.update(clock);
      this.input.endFrame(clock);
      return;
    }

    const playing = this.phase === 'playing' || this.phase === 'transition' || this.phase === 'paused';

    // ---- camera ----
    const groundQuery = (x, z, y) => this.world.groundHeight(x, z, y ?? this.player.position.y);
    this.camera.update(clock, this.player, {
      mode: this.cameraMode,
      groundHeight: groundQuery,
      shake: this.settings.get('cameraShake'),
      underwater: this.world.realmId === 'valley' ? (this.world.water?.underwater ?? 0) : this.world.realmId === 'deep' ? 0.6 : 0,
      ghost: this.player.ghost,
      thirdPersonBlocked: this.camera.mode === 'third',
    });
    this.renderer.setFov(this.camera.fov);
    this.renderer.camera.position.set(this.camera.position.x, this.camera.position.y, this.camera.position.z);
    this.renderer.camera.rotation.set(this.camera.pitch, this.camera.yaw, this.camera.roll, 'YXZ');

    // ---- world ----
    if (playing) {
      this.world.update(clock, {
        playerPosition: this.player.position,
        cameraPosition: this.renderer.camera.position,
        cameraForward: this.camera.forward(),
        timeOfDay: this.sky.timeOfDay,
        sun: { direction: this.sky.sunLight.position.clone().normalize(), color: this.sky.sunLight.color },
        speaking: this.audio?.speaking ?? false,
      });
      this.sky.update(clock, this.renderer.camera.position, { realm: this.world.realmData });
      this.world.setDaylight?.(this.sky.daylight);
      this.renderer.updateShadowFrustum(this.player.position, this.sky.sunLight.position.clone().normalize());
    }

    // ---- simulation bookkeeping ----
    if (this.phase === 'playing') {
      this.progress.tick(clock, { interval: 40 });
      this.progress.maxStat('highestPeak', this.player.position.y);
      this.progress.maxStat('deepestDepth', -this.player.position.y);
      this.progress.addStat('distance', this.player.speed * clock);
      this.checkTruths();
      this.checkLandmarkDiscovery();
      this.checkWorldEvents(clock);
      if (this.player.position.y > 300) this.peakReached = true;
      if (this.player.state === 'dead') this.onPlayerDeath();
    }

    // ---- audio ----
    this.audio?.update?.();
    this.updateAudio(clock);

    // ---- god rays / post context ----
    const postContext = this.buildPostContext(clock);

    // ---- HUD ----
    this.timers.hudSync -= clock;
    if (this.timers.hudSync <= 0) {
      this.timers.hudSync = 0.3;
      this.updateCompassMarkers();
    }
    this.updateHud(clock, postContext);

    // ---- render ----
    this.renderer.render(clock, postContext);

    this.input.endFrame(clock);
    this.loading.update(clock);
    this.escapeReady = Math.max(0, this.escapeReady - clock);
  }

  get cameraMode() {
    if (this.cameraModeOverride) return this.cameraModeOverride;
    return this.settings.get('thirdPerson') ? 'third' : 'first';
  }

  set cameraModeOverride(mode) {
    this._cameraModeOverride = mode;
  }

  get cameraModeOverride() {
    return this._cameraModeOverride ?? null;
  }

  buildPostContext(dt) {
    const realm = this.world.realmData ?? realmById('valley');
    const sunScreen = this.renderer.projectToScreen(this.sky.sunLight.position);
    const transition = this.world.transition;
    const glitchBase = (this.settings.get('glitchIntensity') ?? 0.5) * 0.25;
    const glitch = clamp01(
      glitchBase +
        (transition ? 0.75 * (transition.phase === 'out' ? transition.t / transition.duration : 1 - transition.t / transition.duration) : 0) +
        (this.player.ghost ? 0.12 : 0) +
        (this.world.realmId === 'void' ? 0.1 : 0)
    );
    const distance = this.world.realmId === 'valley' ? this.player.position.y : 0;
    const underwater = this.world.realmId === 'valley' ? this.world.water?.underwater ?? 0 : this.world.realmId === 'deep' ? 0.8 : 0;
    return {
      glitch,
      distortion: clamp01(underwater * 0.7 + (this.player.ghost ? 0.25 : 0)),
      gravity: this.gravityEffect ?? (realm.id === 'singularity' ? { radius: 0.24, strength: 0.4, center: { x: 0.5, y: 0.5 } } : null),
      motionBlur: clamp01((this.player.speed / 30) * (this.settings.get('motionScale') ?? 0.35)),
      exposure: realm.id === 'void' ? 1.15 : realm.id === 'backrooms' ? 0.95 : 1,
      scanlines: this.world.realmId === 'midnight' ? 0.35 : this.world.realmId === 'backrooms' ? 0.2 : 0,
      rgbShift: glitch * 0.6,
      sunScreen: sunScreen.uv,
      sunVisible: sunScreen.visible && this.sky.sunElevation() > -0.05,
      sunColor: this.sky.sunLight.color,
      godrayStrength: clamp01(this.sky.weather.cloudCoverage * -0.5 + 1) * 0.5,
      underwater,
      distance,
      fov: this.camera.fov,
      realmPalette: realm.palette,
    };
  }

  updateHud(dt, postContext) {
    if (!this.hud) return;
    const prompt = this.interaction.prompt();
    const realm = this.world.realmData ?? realmById('valley');
    const stats = this.frameStats ?? {
      fps: this.loop.fps,
      frameMs: this.loop.averageFrameMs,
      worstMs: this.loop.worstFrameMs,
      triangleText: '',
      creatures: this.world.population?.count ?? 0,
      tier: this.renderer.adaptive?.tierName ?? 'AUTO',
    };
    this.hud.update(dt, {
      player: this.player,
      camera: this.camera,
      realm,
      compass: this.compassMarkers ?? [],
      prompt,
      stats,
      terrainSample: null,
      dwell: 0,
    });
    // Scan ring: nearest interactable distance feedback
    void postContext;
  }

  updateCompassMarkers() {
    const markers = [];
    const realm = this.world.realmId;
    const field = this.world.field;
    if (realm === 'valley') {
      for (const landmark of this.landmarks.all('valley').slice(0, 8)) {
        markers.push({
          id: `lm-${landmark.id}`,
          x: landmark.x,
          z: landmark.z,
          angle: Math.atan2(landmark.x - this.player.position.x, landmark.z - this.player.position.z),
          distance: Math.hypot(landmark.x - this.player.position.x, landmark.z - this.player.position.z),
          label: landmark.name,
          color: '#9fe8ff',
          map: true,
          discovered: landmark.discovered,
        });
      }
      for (const portal of this.world.portals) {
        const realmData = realmById(portal.targetRealm);
        markers.push({
          id: `portal-${portal.targetRealm}`,
          x: portal.group.position.x,
          z: portal.group.position.z,
          angle: Math.atan2(portal.group.position.x - this.player.position.x, portal.group.position.z - this.player.position.z),
          distance: portal.group.position.distanceTo(this.player.position),
          label: realmData.codename,
          color: colorToCss(realmData.palette.accent),
          map: true,
        });
      }
      if (this.world.machine) {
        const machine = this.world.machine.group.position;
        markers.push({
          id: 'machine',
          x: machine.x,
          z: machine.z,
          angle: Math.atan2(machine.x - this.player.position.x, machine.z - this.player.position.z),
          distance: machine.distanceTo(this.player.position),
          label: 'LODEMUS',
          color: '#6fc8ff',
          map: true,
        });
      }
      void field;
    } else {
      markers.push({
        id: 'return',
        x: this.player.position.x,
        z: this.player.position.z,
        angle: 0,
        distance: 0,
        label: 'RETURN',
        color: '#ffd9a0',
        map: false,
      });
    }
    this.compassMarkers = markers;
    this.hud.setMapData(markers);
    this.gridPainter = this.gridPainter ?? null;
  }

  checkLandmarkDiscovery() {
    if (this.world.realmId !== 'valley') return;
    const nearest = this.landmarks.nearest('valley', this.player.position);
    if (!nearest || nearest.distance > 90) return;
    const discovered = this.landmarks.discover('valley', nearest.landmark.id);
    if (!discovered) return;
    this.progress.update((state) => {
      state.discoveredLandmarks = state.discoveredLandmarks ?? [];
      state.discoveredLandmarks.push({ id: discovered.id, name: discovered.name, realm: 'valley' });
    });
    this.hud.toast({ title: discovered.name, body: 'Landmark named and added to the atlas.', kind: 'discovery' });
    this.audio?.play('discover.new', { gain: 0.8 });
    this.updateCompassMarkers();
  }

  checkWorldEvents(dt) {
    // Weather drama: occasional storms, lightning, and the LODEMUS commentary.
    this._weatherTimer = (this._weatherTimer ?? 40) - dt;
    if (this._weatherTimer <= 0) {
      this._weatherTimer = 90 + this.rng.float() * 240;
      const options = this.world.realmId === 'valley' ? ['clear', 'overcast', 'rain', 'storm', 'mist'] : ['clear', 'mist'];
      const next = this.rng.pick(options);
      if (next !== this.sky.weather.state) {
        this.sky.setWeather(next);
        if (next === 'storm') {
          this.narrateOnce('stormWarn', COMMENTARY.weatherStorm, { cooldown: 240 });
          setTimeout(() => this.sky.strikeLightning({ power: 1 }), 2500 + this.rng.float() * 4000);
        } else if (next === 'rain') {
          this.narrateOnce('rainWarn', COMMENTARY.weatherRain, { cooldown: 300 });
        } else if (next === 'mist') {
          this.narrateOnce('mistWarn', COMMENTARY.weatherMist, { cooldown: 300 });
        }
      }
    }

    // The valley whispers at night; the void whispers always.
    this.timers.whispers -= dt;
    if (this.timers.whispers <= 0) {
      this.timers.whispers = 60 + this.rng.float() * 120;
      if (this.sky.isNight || this.world.realmId === 'void' || this.world.realmId === 'heaven') {
        const text = pickFrom(WHISPERS, this.rng.int(0, 10000));
        this.audio?.narrate(text, { mood: 'whisper', character: 'whisper', priority: 0, subtitle: true });
      }
    }

    // The machine hums louder as you approach; the Great One's heartbeat.
    const beatDistance = this.world.colossus ? this.world.colossus.group.position.distanceTo(this.player.position) : Infinity;
    if (beatDistance < 900 && !this._beatHook) {
      this._beatHook = true;
      this.world.colossus.onBeat = (position) => {
        const distance = position.distanceTo(this.player.position);
        const strength = clamp01(1 - distance / 900);
        this.camera.addTrauma(0.4 * strength);
        this.audio.play('creature.colossus', { gain: strength * 0.8, minInterval: 3 });
      };
    }

    // Slow commentary in quiet moments.
    this.timers.commentary -= dt;
    if (this.timers.commentary <= 0) {
      this.timers.commentary = 150 + this.rng.float() * 240;
      if (this.phase === 'playing' && !this.audio?.speaking) {
        this.audio?.narrate(pickFrom(COMMENTARY.idle, this.rng.int(0, 1000)), { mood: 'calm', priority: 0 });
      }
    }

    // The wormhole in the valley eventually takes what it is offered.
    const effect = this.world.lastWormholeEffect;
    if (effect?.pull > 0.35) {
      this.gravityEffect = {
        radius: 0.18 + effect.pull * 0.22,
        strength: effect.pull * 0.85,
        center: null,
      };
      this.camera.addTrauma(0.02 * effect.pull);
    } else if (this.world.gravityEffect) {
      this.gravityEffect = this.world.gravityEffect;
    } else {
      this.gravityEffect = null;
    }
  }

  onPlayerDeath() {
    const line = pickFrom(DEATH_LINES, this.rng.int(0, 1000));
    this.audio?.play('player.death', { gain: 1 });
    this.audio?.narrate(line, { mood: 'dread', speaker: 'LODEMUS', priority: 2 });
    this.progress.addStat('deaths');
    this.progress.update((state) => {
      state.essence = Math.max(0, (state.essence || 0) - 50);
    });
    this.hud.toast({ title: 'CONTINUITY RESTORED', body: 'You are reconstructed from the last good copy.', kind: 'truth' });
    this.progress.flush();
    this.player.reset({ x: this.spawnPoint.x, y: this.spawnPoint.y, z: this.spawnPoint.z });
    this.player.health = 1;
    this.player.breath = 1;
    this.hud.flashScreen('#000000', 0.8);
    this.narrateOnce('firstDeath', COMMENTARY.firstDeath);
  }

  onStats(stats) {
    if (stats.type === 'frame') {
      this.frameStats = {
        fps: stats.fps,
        frameMs: stats.frameMs,
        worstMs: stats.worstMs,
        tier: stats.tier,
        triangleText: `${(stats.triangles / 1000).toFixed(0)}k tri · ${stats.drawCalls} calls`,
        creatures: this.world?.population?.count ?? 0,
        position: this.player?.position,
      };
    } else if (stats.type === 'quality') {
      this.hud?.toast({ title: 'ENGINE ADAPTED', body: `Now running at ${stats.tier} · scale ${stats.scale.toFixed(2)}`, kind: 'info', duration: 4 });
    }
  }

  /* ================================================================ *
   * INPUT
   * ================================================================ */

  onInputAction(action, event) {
    if (action === 'pointerlock') {
      if (!this.menu.isOpen && this.phase === 'playing') {
        // The player released the mouse: pause politely.
        this.togglePause(true);
      }
      return;
    }
    if (action === 'pause' || action === `pause:release`) return; // handled globally
    const playing = this.phase === 'playing';
    switch (action) {
      case 'codex':
        if (this.phase === 'menu') return;
        this.codex.toggle();
        if (this.codex.open) {
          this.togglePause(true);
          this.menu.hide();
        }
        break;
      case 'map':
        this.hud.hideMinimap(!this.hud.mapWrap.classList.contains('hidden'));
        break;
      case 'camera':
        this._cameraModeOverride = this.cameraModeOverride === 'third' ? 'first' : 'third';
        this.camera.toggleShoulder();
        break;
      case 'scan':
        if (playing) this.doScan();
        break;
      case 'narrate':
        if (playing) this.describePlace();
        break;
      case 'quicksave':
        if (playing) this.saveNow('quicksave');
        break;
      case 'quickload':
        if (playing || this.phase === 'paused') this.loadSlot('quicksave', { start: true });
        break;
      case 'screenshot':
        this.takeScreenshot(false);
        break;
      case 'screenshotHi':
        this.takeScreenshot(true);
        break;
      case 'ghost':
        if (playing) {
          this.hud.toast({
            title: this.player.ghost ? 'DISSOLVED' : 'SOLID AGAIN',
            body: this.player.ghost ? 'Nothing can touch you. Nothing can hold you.' : 'You have a body again. Be careful with it.',
            kind: 'info',
            duration: 3,
          });
          this.narrateOnce('firstGhost', COMMENTARY.firstGhost);
          this.progress.addStat('ghosts');
        }
        break;
      case 'drop':
        if (playing) this.world.enterRealm(this.rng.pick(['void', 'backrooms', 'maze', 'fractal', 'singularity', 'midnight', 'heaven', 'microverse', 'colossus', 'cities', 'deep']), { reason: 'teleport' });
        break;
      default:
        break;
    }
    void event;
  }

  onGlobalKey(event) {
    if (event.code === 'Escape') {
      if (this.phase === 'playing') {
        this.togglePause(true);
        event.preventDefault();
      } else if (this.phase === 'paused' && !this.menu.isOpen) {
        this.togglePause(false);
        event.preventDefault();
      } else if (this.codex.open) {
        this.codex.hide();
      }
    }
    if (event.code === 'Backquote' && event.ctrlKey) {
      this.debug = !this.debug;
      this.settings.set('showFps', this.debug);
    }
  }

  doScan() {
    this.hud.scanPulseWide();
    this.audio?.play('scan.pulse', { gain: 1 });
    this.progress.addStat('scans');
    const biome = this.world.field?.biomeAt?.(this.player.position.x, this.player.position.z);
    const creature = this.nearestCreatureOfSpecies(null, 90);
    const lines = [];
    if (biome?.biome) {
      lines.push(`${biome.biome.name}: ${biome.biome.ambient ?? 'stable'}`);
    }
    if (creature) {
      lines.push(`${creature.species.name} at ${creature.distanceTo(this.player.position).toFixed(0)}m`);
      this.discoverSpecies(creature, true);
    }
    const count = this.world.population?.count ?? 0;
    lines.push(`${count} organisms tracked in this sector`);
    this.hud.toast({ title: 'BIOSCAN', body: lines.join(' · '), kind: 'info', duration: 6 });
    this.narrateOnce('scanLines', COMMENTARY.scan, { cooldown: 120 });
    return lines;
  }

  describePlace() {
    const realm = this.world.realmData;
    const biome = this.world.field?.biomeAt?.(this.player.position.x, this.player.position.z);
    const nearest = this.landmarks.nearest('valley', this.player.position);
    const parts = [realm?.tagline ?? ''];
    if (biome?.biome) parts.push(`Biome: ${biome.biome.name}.`);
    if (nearest && nearest.distance < 400) parts.push(`${nearest.landmark.name} is ${Math.round(nearest.distance)} metres away.`);
    const text = parts.filter(Boolean).join(' ');
    this.audio?.narrate(text, { mood: 'reverent', priority: 1 });
    this.hud.toast({ title: 'FIELD NOTES', body: text, kind: 'info', duration: 7 });
  }

  takeScreenshot(hi = false) {
    const url = this.renderer.screenshot();
    const link = document.createElement('a');
    link.href = url;
    link.download = `multiverse-${hi ? 'hi-' : ''}${new Date().toISOString().replace(/[:.]/g, '-')}.png`;
    link.click();
    this.hud.toast({ title: 'FRAME CAPTURED', body: 'Filed under your downloads, where all memories end up.', kind: 'info', duration: 3 });
    this.audio?.play('ui.confirm', { gain: 0.6 });
  }

  onCodexClosed() {
    if (this.phase === 'paused') {
      this.menu.show('pause');
      return;
    }
    if (this.phase === 'playing') this.input.requestPointerLock();
  }

  /* ================================================================ *
   * SETTINGS
   * ================================================================ */

  applySettings() {
    const s = this.settings;
    this.quality = this.buildQuality();
    this.renderer?.applyQuality(this.quality);
    this.renderer?.setFov(s.get('fov'));
    this.camera.baseFov = s.get('fov');
    this.hud?.setVisible(s.get('hud') !== false && this.phase !== 'menu' && this.phase !== 'intro');
    this.audio?.applySettings?.();
    if (this.input) {
      this.input.invertY = s.get('invertY');
      this.input.sensitivity = s.get('mouseSensitivity');
    }
  }

  onSettingChanged(key) {
    switch (key) {
      case 'quality':
        this.applySettings();
        this.hud?.toast({ title: 'QUALITY CHANGED', body: `Preset: ${this.settings.get('quality').toUpperCase()}`, kind: 'info', duration: 4 });
        break;
      case 'masterVolume':
      case 'musicVolume':
      case 'ambienceVolume':
      case 'sfxVolume':
      case 'voiceVolume':
      case 'narration':
        this.audio?.applySettings?.();
        break;
      case 'hud':
      case 'crosshair':
        this.hud?.setVisible(this.settings.get('hud') !== false && this.phase === 'playing');
        break;
      case 'subtitles':
        if (this.settings.get('subtitles') === false) this.captionNode?.classList.remove('visible');
        break;
      case 'fov':
        this.camera.baseFov = this.settings.get('fov');
        break;
      case 'invertY':
        this.input.invertY = this.settings.get('invertY');
        break;
      case 'mouseSensitivity':
        this.input.sensitivity = this.settings.get('mouseSensitivity');
        break;
      case 'renderScale':
      case 'pixelRatioCap':
      case 'viewDistance':
      case 'glitchIntensity':
      case 'motionScale':
      case 'autoQuality':
        this.applySettings();
        break;
      default:
        break;
    }
  }

  applySettingChange(key, value) {
    if (key === 'quality') {
      this.settings.patch({ quality: value });
      this.applySettings();
      return;
    }
    this.settings.set(key, value);
  }

  applyUpgrades() {
    const upgrades = this.progress.get('upgrades') ?? {};
    this.player.abilities.fly = (upgrades.flight ?? 0) > 0 || this.settings.get('godMode');
    this.player.abilities.climb = true;
    if (upgrades.breath) this.player.tuning.breatheDrain = PLAYER_TUNING.breatheDrain * (1 - upgrades.breath * 0.3);
    if (upgrades.sprint) this.player.tuning.runSpeed = PLAYER_TUNING.runSpeed * (1 + upgrades.sprint * 0.08);
  }

  /** Buy an upgrade with essence. Used by the codex/upgrade UI. */
  purchaseUpgrade(id) {
    const upgrade = UPGRADES[id];
    if (!upgrade) return false;
    const owned = this.progress.get('upgrades')?.[id] ?? 0;
    if (owned >= upgrade.max) return false;
    const essence = this.progress.get('essence') ?? 0;
    if (essence < upgrade.essenceCost) {
      this.hud.toast({ title: 'NOT ENOUGH ESSENCE', body: `${upgrade.name} costs ${upgrade.essenceCost}.`, kind: 'info' });
      this.audio?.play('ui.error', { gain: 0.6 });
      return false;
    }
    this.progress.update((state) => {
      state.essence -= upgrade.essenceCost;
      state.upgrades[id] = owned + 1;
    });
    this.applyUpgrades();
    this.audio?.play('upgrade.apply', { gain: 0.9 });
    this.hud.toast({ title: `UPGRADE: ${upgrade.name}`, body: upgrade.blurb, kind: 'upgrade' });
    this.narrateOnce('firstUpgrade', COMMENTARY.firstUpgrade);
    return true;
  }

  /* ================================================================ *
   * MISC
   * ================================================================ */

  startFrameCounter() {
    this.distanceAtStart = this.progress.get('stats')?.distance ?? 0;
  }

  yieldFrame() {
    return new Promise((resolve) => requestAnimationFrame(() => resolve()));
  }

  dispose() {
    this.loop?.stop();
    window.removeEventListener('keydown', this._boundKeyHandler, true);
    this.resizeHandler?.dispose?.();
    this.visibilityHandler?.dispose?.();
    this.input?.detach();
    this.world?.dispose();
    this.sky?.dispose?.();
    this.renderer?.dispose?.();
    this.audio?.dispose?.();
    this.cinematic?.dispose?.();
  }
}

function keyForSpecies(id) {
  const map = {
    grazer: 'firstHerbivore',
    strider: 'firstCreature',
    bloomback: 'firstCreature',
    skitterjaw: 'firstPredator',
    lusca: 'firstWhale',
    skywhale: 'firstTyphon',
    eye: 'firstEye',
    mothlight: 'firstMoth',
    titanroot: 'firstTitan',
    attendant: 'firstCreature',
    ant: 'firstAnt',
  };
  return map[id] ?? null;
}

function colorToCss(hex) {
  return `#${Number(hex ?? 0xffffff).toString(16).padStart(6, '0')}`;
}

function escapeHtml(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export { LOADING_TIPS, PROLOGUE, seedFromString, MENU, TRUTH_CHECKS };
