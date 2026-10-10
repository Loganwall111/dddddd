import type { AbstractEngine } from '@babylonjs/core/Engines/abstractEngine';
import { initializeEngine } from './engine';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { FreeCamera } from '@babylonjs/core/Cameras/freeCamera';
import type { LinesMesh } from '@babylonjs/core/Meshes/linesMesh';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { Scene } from '@babylonjs/core/scene';
import '@babylonjs/core/Culling/ray';
import '@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent';
import { createBlockMaterial, blockMesh, applySeason, type VoxelMaterial } from '../blocks/textures';
import { block, maxStack, placeable, CONTENT } from '../blocks/registry';
import { VoxelWorld } from '../world/World';
import { Horizon } from '../world/Horizon';
import { getBiome } from '../world/generator';
import { PlayerController } from '../player/Player';
import { Environment } from '../rendering/Environment';
import { BreakOverlay } from '../rendering/BreakOverlay';
import { PortalSystem } from '../dimensions/Portals';
import { TornadoSystem } from '../rendering/Tornado';
import { VolcanoSystem } from '../rendering/Volcano';
import { ColoredLights } from '../rendering/ColoredLights';
import { PuddleSystem } from '../rendering/Puddles';
import { DebrisSystem } from '../rendering/Debris';
import { TourSystem } from '../tour/TourSystem';
import { PlayerVisual } from '../player/PlayerVisual';
import { fluidHazard } from '../world/biomes';
import { EntitySystem } from '../entities/Entities';
import { ExplosionSystem } from '../explosions/Explosions';
import { GameAudio } from '../audio/Audio';
import { addItem, consumeItem, countItem } from '../inventory/inventory';
import { RECIPES, resolveRecipe, tickFurnace, type Recipe } from '../crafting/recipes';
import { saveWorld } from '../persistence/storage';
import type { CommandHost } from '../commands/commands';
import { addItem as addInventoryItem } from '../inventory/inventory';
import { DIMENSIONS, DEFAULT_CHARACTER, type CharacterStyle, type DimensionId, type GameEvent, type GameMode, type Settings, type Target, type WorldSave } from './types';

export class Game {
  readonly scene: Scene;
  readonly camera: FreeCamera;
  readonly audio = new GameAudio();
  readonly environment: Environment;
  readonly material: VoxelMaterial;
  readonly horizon: Horizon;
  world!: VoxelWorld;
  player!: PlayerController;
  entities!: EntitySystem;
  explosions!: ExplosionSystem;
  portals!: PortalSystem;
  tornadoes!: TornadoSystem;
  volcanoes!: VolcanoSystem;
  coloredLights!: ColoredLights;
  puddles!: PuddleSystem;
  debris!: DebrisSystem;
  tour!: TourSystem;
  save!: WorldSave;
  paused = true;
  ready = false;
  disposed = false;
  transitioning = false;
  private selection: LinesMesh;
  private cracks: BreakOverlay;
  private held: Mesh | null = null;
  private avatar: PlayerVisual;
  private lastHeld = -1;
  private thirdPerson = false;
  private target: Target | null = null;
  private mining = false;
  private mineProgress = 0;
  private mineKey = '';
  private attackCooldown = 0;
  private snapshotTimer = 0;
  private saveTimer = 0;
  private survivalTimer = 0;
  private hazardTimer = 0;
  private seasonalRecovery=0;
  private bloodMoon = false;
  private portalCooldown = 0;
  private shake = 0;
  private pendingSave: Promise<void> | null = null;
  private lastTime = performance.now();
  private constructor(public canvas: HTMLCanvasElement, public engine: AbstractEngine, public settings: Settings, public emit: (event: GameEvent) => void) {
    this.scene = new Scene(engine); this.scene.skipPointerMovePicking = true;
    this.camera = new FreeCamera('explorer', new Vector3(2, 45, -4), this.scene); this.camera.inputs.clear();
    this.material = createBlockMaterial(this.scene); this.environment = new Environment(this.scene, this.camera, settings);
    this.environment.onError=message=>this.emit({type:'error',message});
    this.environment.onThunder=(delay,intensity)=>this.audio.thunder(delay,intensity);
    this.horizon = new Horizon(this.scene, this.material);
    this.horizon.onMesh = (mesh, add) => { if (add) this.environment.water.addToRenderList(mesh); else this.environment.water.removeFromRenderList(mesh); };
    this.horizon.onWater=data=>this.environment.updateWaterGeometry(data);
    this.cracks = new BreakOverlay(this.scene);
    this.material.onError = (_effect, errors) => this.emit({ type: 'error', message: `Voxel shader compilation failed: ${errors}` });
    const corners = [new Vector3(0,0,0),new Vector3(1,0,0),new Vector3(1,0,1),new Vector3(0,0,1),new Vector3(0,1,0),new Vector3(1,1,0),new Vector3(1,1,1),new Vector3(0,1,1)];
    const edges = [[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4],[0,4],[1,5],[2,6],[3,7]];
    this.selection = MeshBuilder.CreateLineSystem('block-target', { lines: edges.map(([a,b]) => [corners[a].scale(1.005), corners[b].scale(1.005)]) }, this.scene);
    this.selection.color = new Color3(.98, .96, .77); this.selection.isPickable = false; this.selection.setEnabled(false);
    this.avatar = new PlayerVisual(this.scene,this.camera);
    this.environment.track(this.avatar.rig.root,true);
    canvas.addEventListener('mousedown', this.onMouseDown); canvas.addEventListener('contextmenu', this.onContext);
    canvas.addEventListener('wheel', this.onWheel, { passive: false });
    window.addEventListener('mousemove', this.onMouseMove); window.addEventListener('mouseup', this.onMouseUp);
    window.addEventListener('keydown', this.onKeyDown); window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('resize', this.onResize); window.addEventListener('blur', this.onBlur);
    document.addEventListener('pointerlockchange', this.onPointerLock);
    document.addEventListener('visibilitychange', this.onVisibility);
    this.audio.setVolume(settings.volume, settings.music);
    this.engine.runRenderLoop(this.frame); this.engine.resize();
  }
  static async create(canvas: HTMLCanvasElement, settings: Settings, emit: (event: GameEvent) => void) {
    const engine = await initializeEngine(canvas);
    try { return new Game(canvas, engine, settings, emit); } catch (error) { engine.dispose(); throw error; }
  }
  async start(save: WorldSave) {
    this.ready = false; this.save = save; this.paused = true;
    this.setCharacter(save.character||DEFAULT_CHARACTER);
    this.world = new VoxelWorld(this.scene, this.material, save); this.world.renderDistance = this.settings.renderDistance;
    this.world.onMesh = (mesh, added) => this.environment.track(mesh, added);
    this.world.onError = message => this.emit({ type: 'error', message });
    this.world.onRemove = (id, x, y, z) => {
      const key = `${this.save.dimension}:${x},${y},${z}`, position = new Vector3(x + .5, y + .7, z + .5);
      if (id === 29 && this.save.containers[key]) {
        for (const stack of this.save.containers[key]) if (stack) this.entities.drop(stack, position);
        delete this.save.containers[key];
      }
      if (id === 24 && this.save.furnaces[key]) {
        const furnace = this.save.furnaces[key];
        for (const stack of [furnace.input, furnace.fuel, furnace.output]) if (stack) this.entities.drop(stack, position);
        delete this.save.furnaces[key];
      }
    };
    this.player = new PlayerController(this.camera, this.world, save, this.settings);
    this.player.onFall = amount => { if (this.player.position.y < -30) { if (save.mode === 'creative') void this.respawn(); else this.damage(99); } else this.damage(amount); };
    this.player.onStep = () => this.audio.play('step'); this.player.onJump = () => this.audio.play('jump', .3);
    this.createSimulation(); this.environment.setDimension(save.dimension);
    const [x, , z] = save.player.position;
    await this.world.waitForSpawn(x, z, progress => this.emit({ type: 'loading', progress, label: 'Growing your world' }));
    if (this.disposed) return;
    if (save.player.position[1] === 0) this.player.position.y = this.world.ground(x, z) + .05;
    for (let i = 0; i < 20 && this.player.collides(this.player.position.x, this.player.position.y, this.player.position.z); i++) this.player.position.y += 1;
    this.player.updateCamera(); this.entities.spawnInitial(this.player.position);
    this.ready = true; this.refresh();
    if (this.save.player.health <= 0) this.emit({ type: 'death' });
    else this.emit({ type: 'ready', backend: this.engine.isWebGPU ? 'WebGPU' : 'WebGL 2' });
  }
  private createSimulation() {
    this.tour?.stopTour();
    this.portals?.dispose(); this.tornadoes?.dispose(); this.volcanoes?.dispose();
    this.coloredLights?.dispose(); this.puddles?.dispose(); this.debris?.dispose();
    this.portals = new PortalSystem(this.scene, this.world, this.save, this.audio, message => this.toast(message));
    this.tornadoes = new TornadoSystem(this.scene, this.world);
    this.tornadoes.onDamage = amount => this.damage(amount);
    this.tornadoes.onToast = message => this.toast(message);
    this.volcanoes = new VolcanoSystem(this.scene, this.world, this.audio);
    this.volcanoes.onToast = message => this.toast(message);
    this.coloredLights = new ColoredLights(this.scene, this.world, this.save);
    this.puddles = new PuddleSystem(this.scene, this.world);
    this.debris = new DebrisSystem(this.scene, this.world);

    this.entities = new EntitySystem(this.scene, this.world, this.material, this.save, this.audio);
    this.entities.onDamage = amount => this.damage(amount);
    this.entities.onToast = message => this.toast(message);
    this.entities.onMesh = (mesh, add) => this.environment.track(mesh, add);
    this.entities.showNameplates = this.settings.nameplates;
    this.explosions = new ExplosionSystem(this.scene, this.world, this.material, this.audio, this.entities);
    this.entities.onExplosion = position => this.explosions.detonate(position);
    this.entities.onDeathDebris = (position, body, accent) => this.debris.mobBurst(position, body, accent);
    this.explosions.onDebris = (position, blockId, count, power) => this.debris.burst(position, blockId, count, power);
    this.explosions.onBlast = (position, radius) => {
      const distance = Vector3.Distance(this.tour?.active ? this.camera.position : this.player.position, position);
      if (distance < radius + 8 && this.settings.cameraShake) this.shake = .4 * Math.max(0, 1 - distance / 16);
      if (!this.tour?.active && distance < radius) { this.damage(Math.ceil((radius - distance) * 2)); this.player.velocity.y += (radius - distance) * 1.5; }
    };

    this.tour = new TourSystem(this.camera, this.world);
    this.tour.onCaption = (stop, index, total) => {
      this.emit({ type: 'tour-caption', title: stop.title, subtitle: stop.subtitle, index, total });
      if (stop.biomeId === 'volcanic') this.volcanoes.eruptAt(stop.lookAt.x, stop.lookAt.z, true);
    };
    this.tour.onLoading = (active, progress, label) => this.emit({ type: 'tour-loading', active, progress, label });
    this.tour.onArrival = stop => this.entities.spawnTourAmbient(stop.lookAt);
    this.tour.onError = message => this.emit({ type: 'error', message });
    this.tour.onEnd = () => this.finishCinematicTour();

    this.coloredLights.enabled = this.settings.coloredLights;
    this.puddles.enabled = this.settings.puddles;
    this.debris.enabled = this.settings.debris;
  }
  private frame = () => {
    if (this.disposed) return;
    const now = performance.now(), dt = Math.min(.05, (now - this.lastTime) / 1000); this.lastTime = now;
    if (this.world && this.player) {
      if (this.tour?.active) this.tour.update(dt);
      const focus = this.tour?.active ? this.tour.streamPosition : this.player.position;
      const touring = this.tour?.active === true;
      this.world.stream(focus.x, focus.z);
      this.horizon.update(focus.x, focus.z, this.settings.renderDistance, this.world.config);
      if (this.ready && !this.paused && !this.transitioning) {
        if (!touring) {
          const steps = Math.max(1, Math.ceil(dt / .016));
          for (let i = 0; i < steps; i++) this.player.update(dt / steps);
        }
        this.save.playtime += dt; if (this.save.gameRules?.doDaylightCycle !== false) this.save.time = (this.save.time + dt / 1200) % 1;
        this.attackCooldown = Math.max(0, this.attackCooldown - dt); this.portalCooldown = Math.max(0, this.portalCooldown - dt);
        this.entities.update(dt, touring ? this.camera.position : this.player.position, this.save.time, touring);
        this.explosions.update(dt);
        if (!touring) this.tornadoes.update(dt, this.save.weather, this.player, this.settings);
        const focusBiome = getBiome(focus.x, focus.z, this.world.config);
        this.audio.updateAmbience(dt, this.save.dimension, this.save.season === 'Winter' && this.save.weather !== 'clear' ? 'snow' : this.save.weather, this.world.fluidAt(focus.x, focus.y, focus.z), this.save.time > .52, focusBiome.id, focus.y);
        this.volcanoes.update(dt, focus);
        this.coloredLights.enabled = this.settings.coloredLights;
        this.coloredLights.update(dt, focus);
        this.puddles.enabled = this.settings.puddles;
        this.puddles.update(dt, focus, this.save.weather !== 'clear');
        this.debris.enabled = this.settings.debris;
        this.debris.update(dt);
        this.entities.showNameplates = this.settings.nameplates;
        if (!touring) { this.updateInteraction(dt); this.updateSurvival(dt); }
        Object.values(this.save.furnaces).forEach(furnace => { if (tickFurnace(furnace, dt)) this.save.player.xp += 1; });
        this.saveTimer += dt;
        if (this.saveTimer > 30) { this.saveTimer = 0; void this.saveNow().catch(() => {}); }
        if (this.save.cycleSeasons && Math.floor(this.save.playtime / 900) !== Math.floor((this.save.playtime - dt) / 900)) {
          const seasons = ['Spring','Summer','Autumn','Winter'] as const;
          this.save.season = seasons[(seasons.indexOf(this.save.season) + 1) % 4]; this.toast(`${this.save.season} has arrived.`);
        }
        if (this.save.cycleWeather && Math.floor(this.save.playtime / 240) !== Math.floor((this.save.playtime - dt) / 240)) this.save.weather = Math.random() > .6 ? Math.random() > .7 ? 'storm' : 'rain' : 'clear';
        if (!touring) {
          const portal = this.world.getBlock(this.player.position.x, this.player.position.y + 1, this.player.position.z);
          if (block(portal).portal && this.portalCooldown <= 0) void this.travel(portal === CONTENT.SIFT_PORTAL ? (this.save.dimension === 'sift' ? 'overworld' : 'sift') : DIMENSIONS[this.save.dimension].next);
        }
      }
      if (this.ready && this.paused && !this.transitioning) Object.values(this.save.furnaces).forEach(furnace => { if (tickFurnace(furnace, dt)) this.save.player.xp += 1; });
      applySeason(this.material, this.save.season);
      if(this.world.config.season!==this.save.season)this.seasonalRecovery=12;
      this.world.updateSeason();
      if(this.seasonalRecovery>0){this.seasonalRecovery-=dt;if(this.world.isLoaded(this.player.position.x,this.player.position.z)&&this.player.collides(this.player.position.x,this.player.position.y,this.player.position.z)){for(let up=1;up<=5;up++)if(!this.player.collides(this.player.position.x,this.player.position.y+up,this.player.position.z)){this.player.teleport([this.player.position.x,this.player.position.y+up,this.player.position.z]);break;}}}
      const wet = this.save.weather === 'clear' || this.save.dimension === 'nether' ? 0 : .75;
      this.material.roughness = 1-wet*.65; this.material.clearCoat.intensity = wet;
      this.material.voxelPlugin.time += dt; this.material.voxelPlugin.sea = DIMENSIONS[this.save.dimension].water;
      this.material.voxelPlugin.caustics = this.save.dimension === 'nether'||!this.world.fluidAt(this.camera.position.x,this.camera.position.y,this.camera.position.z) ? 0 : 1.6;
      this.environment.update(dt, this.save.time, this.camera.position, this.save.weather, this.save.season, this.world.config, this.world.fluidAt(this.camera.position.x,this.camera.position.y,this.camera.position.z), this.save.playtime);
      if (this.environment.bloodMoon && !this.bloodMoon) { this.toast('A blood moon rises over the Overworld.'); this.audio.thunder(0.25, 0.45); }
      this.bloodMoon = this.environment.bloodMoon;
      this.portals?.update(dt,this.player.yaw,this.player.pitch,this.settings);
      const moving=!this.paused&&['KeyW','KeyA','KeyS','KeyD'].some(key=>this.player.keys.has(key));
      this.avatar.update(this.paused?0:dt,this.player.position,this.player.yaw,this.player.pitch,moving,this.mining,this.thirdPerson);
      if (this.thirdPerson) {
        this.player.updateCamera(); this.camera.position.subtractInPlace(this.camera.getForwardRay().direction.scale(3.8)); this.camera.position.y += .3;
      }
      if (this.shake > .001 && !this.paused) { this.camera.rotation.z = (Math.random() - .5) * this.shake; this.shake *= Math.exp(-dt * 5); }
      this.snapshotTimer += dt; if (this.snapshotTimer > .15 && this.ready) { this.snapshotTimer = 0; this.refresh(); }
    }
    this.scene.render();
  };
  private updateSurvival(dt: number) {
    if (this.save.mode !== 'survival') return;
    this.hazardTimer+=dt;
    if(this.hazardTimer>1){this.hazardTimer=0;const pos=this.player.position;if(this.world.fluidAt(pos.x,pos.y,pos.z)){const amount=fluidHazard(this.save.dimension,pos.x,pos.z,this.world.config.seed);if(amount>0)this.damage(amount);}}
    this.survivalTimer += dt;
    if (this.survivalTimer > 8) {
      this.survivalTimer = 0;
      if (this.save.difficulty !== 'peaceful') this.save.player.hunger = Math.max(0, this.save.player.hunger - (this.player.keys.has('ShiftLeft') ? .75 : .25));
      if (this.save.player.hunger >= 15 || this.save.difficulty === 'peaceful') this.save.player.health = Math.min(20, this.save.player.health + 1);
      if (this.save.player.hunger <= 0 && this.save.player.health > 1) this.damage(1);
      if (this.world.fluidAt(this.player.position.x,this.player.position.y+1.62,this.player.position.z)) this.damage(this.save.dimension === 'nether' ? 5 : 2);
    }
  }
  private updateInteraction(dt: number) {
    this.target = this.player.target();
    this.cracks.update(this.target, this.mining ? this.mineProgress : 0);
    this.selection.setEnabled(!!this.target);
    if (this.target) this.selection.position.set(this.target.x - .0025, this.target.y - .0025, this.target.z - .0025);
    const stack = this.save.player.inventory[this.save.player.selected], heldId = stack?.id || 0;
    if (this.lastHeld !== heldId) {
      this.held?.dispose(); this.held = null; this.lastHeld = heldId;
      if (heldId) { this.held = blockMesh(heldId, this.scene, this.material, .28); this.held.parent = this.camera; this.held.position.set(.42, -.36, .72); this.held.rotation.set(-.2, -.4, .1); this.held.renderingGroupId = 2; }
    }
    this.held?.setEnabled(!this.thirdPerson);
    if (this.held) this.held.rotation.x = -.2 - (this.mining ? Math.sin(performance.now() * .025) * .28 : 0);
    if (!this.mining) { this.mineProgress = 0; return; }
    if (this.attackCooldown <= 0 && this.entities.attack(this.camera.position, this.camera.getForwardRay().direction, block(heldId).tool === 'sword' ? block(heldId).speed||7 : 2)) {
      this.attackCooldown = .4; this.mineProgress = 0; this.useDurability(); return;
    }
    if (!this.target || this.attackCooldown > 0) return;
    const target = this.target, key = `${target.x},${target.y},${target.z}`;
    if (this.mineKey !== key) { this.mineProgress = 0; this.mineKey = key; }
    const definition = block(target.id), tool = block(heldId);
    if (target.id === 44 && this.save.mode !== 'creative') return;
    const effective = tool.tool === 'pickaxe' && ['stone', 'brick', 'ore', 'glow'].includes(definition.texture) || tool.tool === 'axe' && ['wood', 'plank', 'leaf'].includes(definition.texture);
    const duration = this.save.mode === 'creative' ? .12 : Math.max(.15, definition.hardness * 1.3 / (effective ? tool.speed || 1 : 1));
    this.mineProgress += dt / duration;
    this.selection.color.set(1, 1 - this.mineProgress * .35, .7 - this.mineProgress * .4);
    if (this.mineProgress >= 1) {
      if (this.world.setBlock(target.x, target.y, target.z, 0)) {
        this.debris?.burst(new Vector3(target.x + .5, target.y + .5, target.z + .5), target.id, this.save.mode === 'creative' ? 6 : 4, 2.8);
        if (this.save.mode !== 'creative') {
          this.entities.drop({ id: definition.drop || target.id, count: 1 }, new Vector3(target.x + .5, target.y + .5, target.z + .5));
          this.save.player.xp += definition.texture === 'ore' ? 1 : 0; this.useDurability();
        }
        this.audio.play('mine'); this.mineProgress = 0; this.attackCooldown = this.save.mode === 'creative' ? .13 : .06;
      }
    }
  }
  private useDurability() {
    if (this.save.mode === 'creative') return;
    const slot = this.save.player.inventory[this.save.player.selected];
    if (!slot || !block(slot.id).durability) return;
    slot.durability = (slot.durability ?? block(slot.id).durability!) - 1;
    if (slot.durability <= 0) { this.toast(`${block(slot.id).name} broke.`); this.save.player.inventory[this.save.player.selected] = null; }
  }
  use() {
    if (!this.ready || this.paused || this.transitioning) return;
    const target = this.player.target(), stack = this.save.player.inventory[this.save.player.selected];
    if(stack?.id===CONTENT.NOTE_KEY){this.toast('Ancient city: 42, 16, -28. The melody is C, G, E, B, C.');return;}
    if(stack?.id===CONTENT.TORNADO_TOTEM){if(!this.settings.tornadoes)this.toast('Enable tornadoes in Graphics settings first.');else if(this.save.dimension!=='overworld')this.toast('The stormcaller answers only in the Overworld.');else if(this.tornadoes.summon(this.player.position))this.consumeSelected();return;}
    if(stack?.id===CONTENT.ENDER_PEARL){if(target){const x=target.x+.5,z=target.z+.5,y=target.y+1.1;if(!this.player.collides(x,y,z)){this.player.teleport([x,y,z]);this.consumeSelected();this.audio.play('portal');this.damage(2);}}return;}
    if(stack&&block(stack.id).spawn){const point=target?new Vector3(target.x+target.normal[0]+.5,target.y+target.normal[1],target.z+target.normal[2]+.5):this.player.position.add(this.camera.getForwardRay().direction.scale(4));point.y=this.world.ground(point.x,point.z,point.y+3);if(this.entities.spawn(block(stack.id).spawn!,point))this.consumeSelected();this.refresh();return;}
    const npc=this.entities.interact(this.camera.position,this.camera.getForwardRay().direction);
    if(npc&&!this.player.keys.has('ShiftLeft')){this.pause();this.audio.speak(npc.text,this.settings.npcVoice);this.emit({type:'dialogue',...npc});return;}
    if (stack && block(stack.id).nutrition) {
      this.save.player.hunger = Math.min(20, this.save.player.hunger + block(stack.id).nutrition!);
      this.save.player.health = Math.min(20, this.save.player.health + 1); this.consumeSelected(); this.audio.play('collect'); this.refresh(); return;
    }
    if (!target) return;
    if(this.portals.note(target))return;
    if(stack&&block(stack.id).tool==='igniter'&&this.portals.activateFrame(target)){this.useDurability();return;}
    if (!this.player.keys.has('ShiftLeft')) {
      if (target.id === 27) { this.explosions.prime(target.x, target.y, target.z); return; }
      if (block(target.id).portal) { void this.travel(target.id===CONTENT.SIFT_PORTAL?(this.save.dimension==='sift'?'overworld':'sift'):DIMENSIONS[this.save.dimension].next); return; }
      if ([23, 24, 29].includes(target.id)) {
        const key = `${this.save.dimension}:${target.x},${target.y},${target.z}`;
        if (target.id === 24) this.save.furnaces[key] ||= { input: null, fuel: null, output: null, burn: 0, progress: 0 };
        if (target.id === 29) this.save.containers[key] ||= Array(27).fill(null);
        this.pause(); this.emit({ type: 'inventory', context: target.id === 23 ? 'crafting' : target.id === 24 ? 'furnace' : 'chest', key }); return;
      }
    }
    if (!stack || !placeable(stack.id)) return;
    const x = target.x + target.normal[0], y = target.y + target.normal[1], z = target.z + target.normal[2];
    if(block(stack.id).portal){if(this.player.position.x>x-2.3&&this.player.position.x<x+3.3&&this.player.position.z>z-.3&&this.player.position.z<z+1.3&&this.player.position.y<y+6&&this.player.position.y+1.8>y){this.toast('Step back before opening a portal here.');return;}if(this.portals.createFrame(x,y,z,stack.id))this.consumeSelected();else this.toast('A portal needs a clear space five blocks wide and six high.');return;}
    if (this.player.intersectsBlock(x, y, z) && block(stack.id).solid) return;
    if (this.world.getBlock(x, y, z) !== 0) return;
    if (this.world.setBlock(x, y, z, stack.id)) { this.audio.play('place'); this.consumeSelected(); this.refresh(); }
  }
  private consumeSelected() {
    if (this.save.mode === 'creative') return;
    const slot = this.save.player.inventory[this.save.player.selected];
    if (slot && --slot.count <= 0) this.save.player.inventory[this.save.player.selected] = null;
  }
  give(id: number, index = this.save.player.selected) {
    if (this.save.mode !== 'creative') return;
    this.save.player.inventory[index] = { id, count: maxStack(id), ...(block(id).durability ? { durability: block(id).durability } : {}) };
    this.audio.play('click', .4); this.refresh();
  }
  select(index: number) { this.save.player.selected = (index + 9) % 9; this.refresh(); }
  /** Capabilities exposed to the /command parser. */
  commandHost(): CommandHost {
    return {
      give: (id, count) => {
        const rest = addInventoryItem(this.save.player.inventory, id, count);
        this.refresh();
        if (rest > 0) throw new Error(`Inventory is full: ${rest} could not be added.`);
      },
      setMode: mode => this.setMode(mode),
      teleport: (x, y, z) => { this.player.teleport([x, y, z]); this.refresh(); },
      setTime: time => { this.save.time = time; this.refresh(); },
      getGameRule: rule => this.save.gameRules?.[rule] !== false,
      setGameRule: (rule, value) => { this.save.gameRules = { ...this.save.gameRules, [rule]: value }; },
      travel: dimension => { void this.travel(dimension); },
    };
  }
  dropSelected() {
    const stack = this.save.player.inventory[this.save.player.selected]; if (!stack) return;
    this.entities.drop({ ...stack, count: 1 }, this.camera.position.add(this.camera.getForwardRay().direction.scale(.8)), this.camera.getForwardRay().direction.scale(5).add(new Vector3(0, 2, 0)), 1.3);
    if (--stack.count <= 0) this.save.player.inventory[this.save.player.selected] = null; this.refresh();
  }
  damage(amount: number) {
    if (!this.ready || this.save.mode === 'creative' || this.save.player.health <= 0) return;
    const armor = this.save.player.equipment.reduce((n, stack) => n + (stack ? block(stack.id).armor || 0 : 0), 0);
    this.save.player.health = Math.max(0, this.save.player.health - Math.max(1, amount * (1 - armor * .035)));
    this.audio.play('hurt'); if (this.settings.cameraShake) this.shake = .08;
    if (this.save.player.health <= 0) {
      for (const stack of this.save.player.inventory) if (stack) this.entities.drop(stack, this.player.position.add(Vector3.Up()), undefined, 4);
      this.save.player.inventory.fill(null); this.pause(); this.emit({ type: 'death' });
    }
    this.refresh();
  }
  async respawn() {
    this.save.player.health = 20; this.save.player.hunger = 20;
    if (this.save.dimension !== 'overworld') await this.travel('overworld');
    else {
      this.pause(); this.player.teleport([2.5, 120, -4.5]);
      await this.world.waitForSpawn(2.5, -4.5, progress => this.emit({ type: 'loading', progress, label: 'Finding the way home' }));
      this.player.teleport([2.5, this.world.ground(2.5, -4.5) + .05, -4.5]);
      this.emit({ type: 'ready', backend: this.engine.isWebGPU ? 'WebGPU' : 'WebGL 2' });
    }
    this.refresh();
  }
  async travel(dimension: DimensionId) {
    if (this.transitioning || dimension === this.save.dimension) return;
    this.transitioning = true; this.pause(); this.audio.play('portal'); this.player.serialize();
    this.save.positions[this.save.dimension] = [...this.save.player.position];
    this.explosions.dispose(); this.entities.dispose(); this.world.changeDimension(dimension); this.environment.setDimension(dimension);
    const position = this.save.positions[dimension] || [2.5, 0, -4.5]; this.player.teleport(position); this.createSimulation();
    try {
      await this.world.waitForSpawn(position[0], position[2], progress => this.emit({ type: 'loading', progress, label: `Crossing into ${DIMENSIONS[dimension].name}` }));
      if (position[1] === 0) this.player.position.y = this.world.ground(position[0], position[2]) + .1;
      if(block(this.world.getBlock(this.player.position.x,this.player.position.y+1,this.player.position.z)).portal)this.player.position.z+=1.5;
      this.player.updateCamera(); this.entities.spawnInitial(this.player.position); this.portalCooldown = 4;
      this.player.serialize(); await this.saveNow(); this.refresh();
      this.emit({ type: 'ready', backend: this.engine.isWebGPU ? 'WebGPU' : 'WebGL 2' });
      this.toast(DIMENSIONS[dimension].subtitle);
    } catch (error) { this.emit({ type: 'error', message: error instanceof Error ? error.message : 'Dimension transition failed.' }); }
    finally { this.transitioning = false; }
  }
  setMode(mode: GameMode) { this.save.mode = mode; if (mode === 'creative') { this.save.player.health = 20; this.save.player.hunger = 20; } this.refresh(); this.toast(`${mode === 'creative' ? 'Creative' : 'Survival'} mode enabled.`); }
  setCharacter(style:CharacterStyle){this.save.character={...style};this.environment.track(this.avatar.rig.root,false);this.avatar.setStyle(style);this.environment.track(this.avatar.rig.root,true);}
  trade(){const draft=this.save.player.inventory.map(s=>s?{...s}:null);if(!consumeItem(draft,45,3)){this.toast('The villager needs three pieces of coal.');return false;}if(addItem(draft,56,2)){this.toast('Make room in your inventory first.');return false;}this.save.player.inventory=draft;this.audio.play('collect');this.toast('Trade complete: 2 fresh bread.');this.refresh();return true;}
  craft(size: 2 | 3): boolean {
    const recipe = resolveRecipe(this.save.craftGrid, size); if (!recipe) return false;
    const draft = this.save.player.inventory.map(slot => slot ? { ...slot } : null);
    if (addItem(draft, recipe.result.id, recipe.result.count)) { this.toast('Your backpack is full.'); return false; }
    this.save.player.inventory = draft;
    this.save.craftGrid.forEach((slot, i) => { if (slot && --slot.count <= 0) this.save.craftGrid[i] = null; });
    this.save.player.xp++; this.audio.play('collect', .4); this.refresh(); return true;
  }
  fillRecipe(recipe: Recipe, size: 2 | 3) {
    if (!RECIPES.includes(recipe) || recipe.size > size) { this.toast('Use a crafting bench for this recipe.'); return; }
    this.returnCraftGrid();
    if (!Object.entries(recipe.ingredients).every(([id, count]) => countItem(this.save.player.inventory, Number(id)) >= count)) { this.toast('Gather the ingredients shown in the recipe.'); return; }
    let index = 0;
    for (const [id, count] of Object.entries(recipe.ingredients)) {
      consumeItem(this.save.player.inventory, Number(id), count);
      for (let i = 0; i < count; i++) this.save.craftGrid[index++] = { id: Number(id), count: 1 };
    }
    this.refresh();
  }
  returnCraftGrid() {
    this.save.craftGrid.forEach((slot, index) => { if (slot) { const left = addItem(this.save.player.inventory, slot.id, slot.count, slot.durability); if (left) this.entities.drop({ ...slot, count: left }, this.player.position.add(Vector3.Up())); this.save.craftGrid[index] = null; } });
    this.refresh();
  }
  private finishCinematicTour() {
    this.mining = false;
    this.mineProgress = 0;
    this.thirdPerson = false;
    if (this.player) {
      this.player.keys.clear();
      this.player.updateCamera();
      this.player.active = false;
      this.world.stream(this.player.position.x, this.player.position.z, true);
      this.horizon.update(this.player.position.x, this.player.position.z, this.settings.renderDistance, this.world.config);
    }
    this.paused = true;
    this.emit({ type: 'tour-end' });
  }
  startTour() {
    if (!this.ready || this.disposed || this.transitioning || this.tour.active) return;
    if (this.save.dimension !== 'overworld') { this.toast('The cinematic tour currently covers the 32 Overworld biomes.'); return; }
    this.paused = false;
    this.thirdPerson = false;
    this.mining = false;
    this.player.active = false;
    this.player.keys.clear();
    this.player.updateCamera();
    void this.audio.unlock();
    void this.tour.start();
  }
  nextTourStop() { if (this.tour.active) void this.tour.next(); }
  stopTour() { if (this.tour.active) this.tour.stopTour(); }
  pause() {
    if (this.tour?.active) this.tour.stopTour();
    this.paused = true; this.mining = false; this.mineProgress = 0; this.selection.setEnabled(false);
    this.cracks.update(null, 0);
    if (this.player) { this.player.active = false; this.player.keys.clear(); }
    if (document.pointerLockElement === this.canvas) document.exitPointerLock();
  }
  resume() {
    if (!this.ready || this.disposed || this.transitioning || this.save.player.health <= 0) return;
    this.paused = false; this.player.active = true; void this.audio.unlock();
    try { const request = this.canvas.requestPointerLock(); if (request) request.catch(() => this.toast('Pointer lock unavailable. Hold Alt and move the mouse to look.')); }
    catch { this.toast('Hold Alt and move the mouse to look.'); }
    this.canvas.focus();
  }
  applySettings(settings: Settings) {
    this.settings = settings; this.environment.applySettings(settings); this.audio.setVolume(settings.volume, settings.music);
    if (this.player) { this.player.settings = settings; if (!this.tour?.active) this.player.updateCamera(); }
    if (this.world) {
      this.world.renderDistance = settings.renderDistance;
      const focus = this.tour?.active ? this.tour.streamPosition : this.player.position;
      this.world.stream(focus.x, focus.z, true);
    }
    if (this.coloredLights) this.coloredLights.enabled = settings.coloredLights;
    if (this.puddles) this.puddles.enabled = settings.puddles;
    if (this.debris) this.debris.enabled = settings.debris;
    if (this.entities) this.entities.showNameplates = settings.nameplates;
  }
  async saveNow() {
    if (!this.save || this.disposed) return;
    if (this.pendingSave) await this.pendingSave.catch(() => {});
    if (this.disposed) return;
    this.player.serialize();
    const task = saveWorld(this.save); this.pendingSave = task;
    try { await task; }
    catch (error) { this.toast('Could not save. Check browser storage space; export your world as a backup.'); throw error; }
    finally { if (this.pendingSave === task) this.pendingSave = null; }
  }
  refresh() {
    if (!this.save || !this.player) return;
    const p = this.save.player;
    this.emit({ type: 'snapshot', data: {
      health: p.health, hunger: p.hunger, xp: p.xp, selected: p.selected, inventory: p.inventory.map(slot => slot ? { ...slot } : null), equipment: p.equipment.map(slot => slot ? { ...slot } : null),
      position: this.player.position.asArray() as [number, number, number], dimension: this.save.dimension, mode: this.save.mode,
      biome: getBiome(this.player.position.x, this.player.position.z, this.world.config).name,
      time: this.save.time, season: this.save.season, weather: this.save.weather,
      target: this.target ? block(this.target.id).name : '', progress: this.mineProgress,
      fps: Math.round(this.engine.getFps()), chunks: this.world.chunks.size, flying: this.player.flying, boss: this.entities?.boss || null,
    } });
  }
  toast(message: string) { this.emit({ type: 'toast', message }); }
  private onMouseMove = (event: MouseEvent) => { if (document.pointerLockElement === this.canvas || event.altKey) this.player?.look(event.movementX, event.movementY); };
  private onMouseDown = (event: MouseEvent) => {
    if (this.paused || !this.ready || event.altKey) return;
    if (document.pointerLockElement !== this.canvas) {
      try { this.canvas.requestPointerLock()?.catch(() => {}); } catch { /* Alt-look remains available in restricted embeds. */ }
    }
    if (event.button === 0) this.mining = true;
    if (event.button === 2) this.use();
    if (event.button === 1 && this.target && this.save.mode === 'creative') this.give(this.target.id);
  };
  private onMouseUp = () => { this.mining = false; this.mineProgress = 0; };
  private onContext = (event: Event) => event.preventDefault();
  private onWheel = (event: WheelEvent) => { if (!this.paused) { event.preventDefault(); this.select(this.save.player.selected + Math.sign(event.deltaY)); } };
  private onKeyDown = (event: KeyboardEvent) => {
    if (!this.ready || this.paused || event.repeat && ['KeyE', 'Escape', 'KeyV', 'KeyF'].includes(event.code)) return;
    if (['Space', 'Tab', 'AltLeft', 'ControlLeft', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code)) event.preventDefault();
    if (event.code === 'Escape') { this.pause(); this.emit({ type: 'pause' }); return; }
    if (event.code === 'KeyE') { this.pause(); this.emit({ type: 'inventory' }); return; }
    if (event.code === 'KeyQ' && !event.repeat) { this.dropSelected(); return; }
    if (event.code === 'KeyF') { this.thirdPerson = !this.thirdPerson; if (!this.thirdPerson) this.player.updateCamera(); return; }
    if (/^Digit[1-9]$/.test(event.code)) this.select(Number(event.code.slice(-1)) - 1);
    this.player.keyDown(event.code);
  };
  private onKeyUp = (event: KeyboardEvent) => { this.player?.keys.delete(event.code); };
  private onPointerLock = () => { if (document.pointerLockElement !== this.canvas && this.ready && !this.paused) { this.pause(); this.emit({ type: 'pause' }); } };
  private onResize = () => this.engine.resize();
  private onBlur = () => { if (this.ready && !this.paused) { this.pause(); this.emit({ type: 'pause' }); } };
  private onVisibility = () => { if (document.hidden) { this.onBlur(); void this.saveNow().catch(() => {}); } };
  dispose() {
    if (this.disposed) return; this.pause(); this.disposed = true;
    this.engine.stopRenderLoop(this.frame);
    this.canvas.removeEventListener('mousedown', this.onMouseDown); this.canvas.removeEventListener('contextmenu', this.onContext); this.canvas.removeEventListener('wheel', this.onWheel);
    window.removeEventListener('mousemove', this.onMouseMove); window.removeEventListener('mouseup', this.onMouseUp); window.removeEventListener('keydown', this.onKeyDown); window.removeEventListener('keyup', this.onKeyUp); window.removeEventListener('resize', this.onResize); window.removeEventListener('blur', this.onBlur);
    document.removeEventListener('pointerlockchange', this.onPointerLock); document.removeEventListener('visibilitychange', this.onVisibility);
    this.portals?.dispose(); this.tornadoes?.dispose(); this.volcanoes?.dispose(); this.coloredLights?.dispose(); this.puddles?.dispose(); this.debris?.dispose();
    this.avatar.dispose(); this.explosions?.dispose(); this.entities?.dispose(); this.world?.dispose(); this.horizon.dispose(); this.environment.dispose(); this.audio.dispose(); this.scene.dispose(); this.engine.dispose();
  }
}
