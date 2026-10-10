import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture';
import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import type { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import type { Scene } from '@babylonjs/core/scene';
import type { Stack, WorldSave } from '../core/types';
import type { VoxelWorld } from '../world/World';
import { hash3 } from '../world/noise';
import { blockMesh } from '../blocks/textures';
import { addItem } from '../inventory/inventory';
import type { GameAudio } from '../audio/Audio';
import { VoxelRig } from './VoxelRig';
import { MOBS } from './registry';
import { PROCEDURAL_START } from '../blocks/registry';
import { DIMENSIONS } from '../core/types';
import { getBiome } from '../world/generator';

interface Creature {
  mesh: Mesh; rig: VoxelRig; kind: string;
  health: number; maxHealth: number; heading: number; timer: number; hurt: number;
  home: Vector3; boss: boolean; attack: number; plate?: Mesh;
}
interface Drop { mesh: Mesh; stack: Stack; velocity: Vector3; age: number; settled: boolean; ground: number; pickupDelay: number }
interface Projectile { mesh: Mesh; velocity: Vector3; life: number }
interface Telegraph { mesh: Mesh; position: Vector3; time: number; damage: number }

export class EntitySystem {
  private creatures: Creature[] = [];
  private drops: Drop[] = [];
  private projectiles: Projectile[] = [];
  private telegraphs: Telegraph[] = [];
  private materials = new Map<string, StandardMaterial>();
  private clock = 0;
  private spawnTimer = 0;
  onDamage?: (amount: number) => void;
  onToast?: (message: string) => void;
  onMesh?: (mesh: Mesh, add: boolean) => void;
  onExplosion?: (position:Vector3)=>void;
  onDeathDebris?: (position: Vector3, body: string, accent: string) => void;
  showNameplates = true;
  private villageVisits=new Set<string>();
  constructor(private scene: Scene, private world: VoxelWorld, private material: PBRMaterial, private save: WorldSave, private audio: GameAudio) {}
  private color(hex: string, emissive = false): StandardMaterial {
    const key = `${hex}:${emissive}`;
    if (this.materials.has(key)) return this.materials.get(key)!;
    const mat = new StandardMaterial(key, this.scene); mat.diffuseColor = Color3.FromHexString(hex); mat.specularColor = Color3.Black();
    if (emissive) mat.emissiveColor = mat.diffuseColor.scale(.8);
    this.materials.set(key, mat); return mat;
  }
  spawn(kind: string, position: Vector3) {
    const def=MOBS[kind];if(!def||this.creatures.length>=42){this.onToast?.('Creature limit reached in this area.');return false;}
    position=position.clone();
    if(def.aquatic){const level=DIMENSIONS[this.save.dimension].water;const floor=this.world.ground(position.x,position.z);if(floor>=level-1){this.onToast?.('Use an aquatic spawn egg in open water.');return false;}position.y=Math.max(floor+.7,level-1.3);}
    if(def.flying)position.y+=def.boss?6:3;
    const rig=new VoxelRig(this.scene,kind),mesh=rig.root;mesh.position.copyFrom(position);this.onMesh?.(mesh,true);
    const plate = this.makePlate(kind, def);
    plate.parent = mesh;
    this.creatures.push({mesh,rig,kind,health:def.health,maxHealth:def.health,heading:Math.random()*Math.PI*2,timer:Math.random()*4,hurt:0,home:position.clone(),boss:!!def.boss,attack:5,plate});
    return true;
  }
  spawnInitial(position: Vector3) {
    for (let i = 0; i < 8; i++) {
      const x = position.x + (hash3(i, 1, 0, this.world.config.seed) - .5) * 32, z = position.z + 5 + hash3(i, 2, 0, this.world.config.seed) * 24;
      if (!this.world.isLoaded(x, z)) continue;
      const y = this.world.ground(x, z);
      if (y < 27 || y > 85) continue;
      const kind = this.save.dimension === 'nether' ? 'ember' : this.save.dimension === 'end' ? 'endling' : this.save.dimension==='sift'?i%2?'spirit':`wild-${i}`:['sheep','cow','pig','sniffer','fox','chicken','rabbit','wolf'][i];
      if (MOBS[kind].hostile && this.save.difficulty === 'peaceful') continue;
      this.spawn(kind, new Vector3(x, y, z));
    }
    if (this.save.dimension === 'overworld' || this.save.dimension === 'sky') for (let i = 0; i < 5; i++) this.spawn('bird', position.add(new Vector3(i * 8, 25 + i, 25)));
    if(this.save.dimension==='overworld'&&this.save.preset!=='flat')for(const [x,z] of [[21,-1],[23,4],[16,15]])if(this.world.isLoaded(x,z))this.spawn('villager',new Vector3(x,this.world.ground(x,z),z));
    if(this.save.dimension==='overworld')for(let i=0;i<5;i++){const x=position.x+i*3,z=48+Math.sin(x*.018)*11;if(this.world.isLoaded(x,z)&&this.world.ground(x,z)<24)this.spawn('fish',new Vector3(x,24,z));}
    const bossKind = this.save.dimension === 'end' ? 'dragon' : this.save.dimension === 'nether' ? 'warden' : null;
    if (bossKind && !this.save.defeatedBosses.includes(bossKind) && this.save.difficulty !== 'peaceful') this.spawn(bossKind, position.add(new Vector3(12, bossKind === 'dragon' ? 14 : 1, 18)));
  }
  spawnTourAmbient(position: Vector3) {
    const biome = getBiome(position.x, position.z, this.world.config);
    for (const creature of [...this.creatures]) {
      if (Vector3.Distance(creature.mesh.position, position) < 115) continue;
      this.onMesh?.(creature.mesh, false); creature.plate?.dispose(); creature.rig.dispose();
      this.creatures = this.creatures.filter(item => item !== creature);
    }
    const woodland = ['woodland','birch','taiga','jungle','redwood','darkwood','cherry','autumn','silver','willow'].includes(biome.id);
    const arid = ['desert','badlands','bones','savanna','volcanic'].includes(biome.id);
    const herd = woodland ? ['fox','wolf','rabbit'] : arid ? ['rabbit','fox','chicken'] : ['sheep','cow','rabbit'];
    for (let i = 0; i < 3; i++) {
      const angle = i * Math.PI * 2 / 3 + hash3(i, Math.floor(position.x), Math.floor(position.z), this.world.config.seed) * 1.4;
      const distance = 8 + hash3(i, 41, Math.floor(position.z), this.world.config.seed) * 11;
      const x = position.x + Math.cos(angle) * distance, z = position.z + Math.sin(angle) * distance;
      if (!this.world.isLoaded(x, z)) continue;
      const y = this.world.ground(x, z);
      if (y < DIMENSIONS[this.save.dimension].water + 1 || y > 90) continue;
      if (this.creatures.some(creature => Vector3.Distance(creature.mesh.position, new Vector3(x, y, z)) < 5)) continue;
      this.spawn(herd[i], new Vector3(x, y, z));
    }
    for (let i = 0; i < 2; i++) {
      const position3 = new Vector3(position.x + (i ? 1 : -1) * 9, position.y + 18 + i * 3, position.z + 15);
      this.spawn('bird', position3);
    }
  }
  drop(stack: Stack, position: Vector3, velocity = new Vector3((Math.random() - .5) * 2, 3, (Math.random() - .5) * 2), pickupDelay = .55) {
    if (this.drops.length >= 100) { const old = this.drops.shift()!; old.mesh.dispose(); }
    const mesh = blockMesh(stack.id, this.scene, this.material, .25); mesh.position.copyFrom(position);
    this.drops.push({ mesh, stack: { ...stack }, velocity, age: 0, settled: false, ground: 0, pickupDelay });
  }
  attack(origin: Vector3, direction: Vector3, damage: number): boolean {
    let candidate: Creature | undefined, distance = Infinity;
    for (const c of this.creatures) {
      const center = c.mesh.position.add(new Vector3(0, c.boss ? 1 : .8, 0)), offset = center.subtract(origin), d = offset.length();
      if (d < (c.boss ? 12 : 4.8) && d < distance && Vector3.Dot(direction, offset.normalize()) > (c.boss ? .91 : .965)&&this.clearSight(origin,center)) { candidate = c; distance = d; }
    }
    if (!candidate) return false;
    this.hit(candidate, damage); return true;
  }
  private hit(c: Creature, damage: number) {
    if(c.mesh.isDisposed())return;
    c.health -= damage; c.hurt = .8; this.audio.play('hurt', .5);
    c.mesh.scaling.setAll(1.05);
    if (c.health <= 0) {
      this.drop({ id: c.boss ? 35 : c.kind === 'sheep' ? 57 : 45, count: c.boss ? 12 : 2 }, c.mesh.position.add(Vector3.Up()));
      this.save.player.xp += c.boss ? 80 : 3;
      if (c.boss) { if(!this.save.defeatedBosses.includes(c.kind))this.save.defeatedBosses.push(c.kind);this.onToast?.(`${MOBS[c.kind].name} defeated. The realm falls quiet.`); }
      this.onDeathDebris?.(c.mesh.position.clone(), MOBS[c.kind].body, MOBS[c.kind].accent);
      this.onMesh?.(c.mesh, false); c.plate?.dispose(); c.rig.dispose(); this.creatures = this.creatures.filter(entity => entity !== c);
    }
  }
  blast(position: Vector3, radius: number) { for (const c of [...this.creatures]) { const distance = Vector3.Distance(position, c.mesh.position); if (distance < radius) this.hit(c, (radius - distance) * 5); } }
  get boss() { const c = this.creatures.find(entity => entity.boss); return c ? { name: MOBS[c.kind].name.toUpperCase(), health: c.health, maxHealth: c.maxHealth } : null; }
  interact(origin:Vector3,direction:Vector3){
    const villager=this.creatures.find(c=>{const center=c.mesh.position.add(new Vector3(0,1.45,0)),offset=center.subtract(origin);return c.kind==='villager'&&offset.length()<5&&Vector3.Dot(offset.normalize(),direction)>.92&&this.clearSight(origin,center);});
    if(!villager)return null;
    villager.timer=6;villager.heading=Math.atan2(origin.x-villager.mesh.position.x,origin.z-villager.mesh.position.z);
    const index=Math.abs(Math.floor(villager.home.x+villager.home.z))%3;
    return {name:['Rowan','Elara','Bram'][index],profession:['Wayfinder','Archivist','Provisioner'][index],text:[
      'Welcome, wanderer. Beyond these fields lie mushroom valleys, old boneyards, and rivers you should never drink. Follow the stone stairs near 42, -62 to find the ancient city beneath us.',
      'The old gate remembers a song. C, G, E, B, then C once more. Play the four resonance blocks in that order. The Sift looks kind, but its rainbow waters are not. You have been warned.',
      'The seasons change more than the leaves. Winter freezes the shallows. Storms can bring a twisting wind. Keep a little food in your pack. I can trade you fresh bread for three pieces of coal.'
    ][index]};
  }
  private seaTimer = 0;
  /** Sea life drifts into open water near the player; deep ocean is where it appears. */
  private spawnSeaLife(player: Vector3) {
    const level = DIMENSIONS.overworld.water;
    if (this.creatures.length >= 36 || this.creatures.filter(c => MOBS[c.kind].seaLife).length >= 22) return;
    const keys = Object.keys(MOBS).filter(k => MOBS[k].seaLife);
    for (let tries = 0; tries < 6; tries++) {
      const angle = Math.random() * Math.PI * 2, distance = 14 + Math.random() * 26;
      const x = player.x + Math.cos(angle) * distance, z = player.z + Math.sin(angle) * distance;
      if (!this.world.isLoaded(x, z)) continue;
      const floor = this.world.ground(x, z);
      if (floor > level - 5) continue;
      this.spawn(keys[Math.floor(Math.random() * keys.length)], new Vector3(x, floor, z));
      return;
    }
  }
  update(dt: number, player: Vector3, time: number, spectator = false) {
    this.clock += dt; this.spawnTimer += dt; this.seaTimer += dt;
    if (!spectator && this.seaTimer > 4 && this.save.dimension === 'overworld') { this.seaTimer = 0; this.spawnSeaLife(player); }
    if (!spectator && this.spawnTimer > 25 && this.creatures.length < 40 && this.creatures.filter(c=>MOBS[c.kind].hostile&&!c.boss).length<7 && this.save.difficulty !== 'peaceful' && (time > .53 || time < .03) && this.save.dimension === 'overworld') {
      this.spawnTimer = 0; const x = player.x + Math.sin(this.clock) * 20, z = player.z + Math.cos(this.clock) * 20;
      if (this.world.isLoaded(x, z)) this.spawn(['shade','skeleton','creeper','spider'][Math.floor(Math.random()*4)], new Vector3(x, this.world.ground(x, z), z));
    }
    if(!spectator&&this.save.dimension==='overworld'&&this.save.preset!=='flat'){
      const vx=Math.round((player.x-21)/480),vz=Math.round((player.z-6)/480),key=`${vx},${vz}`,x=vx*480+21,z=vz*480+6;
      if(!this.villageVisits.has(key)&&Math.hypot(x-player.x,z-player.z)<35&&this.world.isLoaded(x,z)){this.villageVisits.add(key);if(vx===0&&vz===0||hash3(vx,334,vz,this.world.config.seed)>.5)this.spawn('villager',new Vector3(x,this.world.ground(x,z),z));}
    }
    for (const c of [...this.creatures]) {
      if(c.mesh.isDisposed())continue;
      const pos = c.mesh.position, distance = Vector3.Distance(pos, player);
      const definition=MOBS[c.kind];
      c.timer -= dt; c.hurt = Math.max(0, c.hurt - dt); c.attack -= dt;c.rig.flash(c.hurt>.55);c.rig.animate(this.clock,1);
      if (c.plate) c.plate.setEnabled(this.showNameplates && distance < 26 && distance > 2.5);
      if (distance > 115) { this.onMesh?.(c.mesh, false); c.plate?.dispose(); c.rig.dispose(); this.creatures = this.creatures.filter(e => e !== c); continue; }
      if (spectator) continue;
      if(definition.aquatic){pos.x=c.home.x+Math.sin(this.clock*.6+c.heading)*2;pos.z=c.home.z+Math.cos(this.clock*.6+c.heading)*2;pos.y=Math.min(DIMENSIONS[this.save.dimension].water-.5,c.home.y+Math.sin(this.clock*.8)*.5);c.mesh.rotation.y=this.clock*.6+c.heading;continue;}
      if (definition.flying&&!c.boss) {
        pos.x = c.home.x + Math.sin(this.clock * .16 + c.heading) * 15; pos.z = c.home.z + Math.cos(this.clock * .16 + c.heading) * 15;
        pos.y = c.home.y + Math.sin(this.clock * 1.6) * .5; c.mesh.rotation.y = this.clock * .16 + c.heading + Math.PI / 2;
        if(definition.hostile&&distance<25&&c.attack<0&&this.save.difficulty!=='peaceful'){this.fireBolt(c,player);c.attack=4;}continue;
      }
      if (c.boss) {
        const rage = c.health < c.maxHealth * .5;
        if (c.kind === 'dragon'||c.kind==='wither') {
          const a = this.clock * (rage ? .3 : .18); pos.x = player.x + Math.sin(a) * 19; pos.z = player.z + Math.cos(a) * 19;
          pos.y = player.y + 5 + Math.sin(this.clock * .45) * 4; c.mesh.rotation.y = a + Math.PI; c.mesh.rotation.z = Math.sin(this.clock * 1.6) * .13;
        } else { const delta = player.subtract(pos); delta.y = 0; if (distance > 7) { delta.normalize().scaleInPlace(dt * (rage ? 2 : 1)); pos.addInPlace(delta); } pos.y = this.world.ground(pos.x, pos.z, pos.y + 4) + Math.sin(this.clock * 2) * .15; c.mesh.rotation.y = Math.atan2(player.x - pos.x, player.z - pos.z); }
        if (c.attack <= 0 && distance < 60 && this.save.difficulty !== 'peaceful') {
          c.attack = rage ? 3.5 : 6;
          const marker = MeshBuilder.CreateCylinder('attack-warning', { diameter: rage ? 5 : 4, height: .06, tessellation: 32 }, this.scene);
          marker.position.set(player.x, this.world.ground(player.x, player.z, player.y + 1) + .04, player.z); marker.material = this.color('#d78955', true);
          this.telegraphs.push({ mesh: marker, position: marker.position.clone(), time: 1.65, damage: rage ? 8 : 5 });
          if (rage||c.kind==='wither') {
            const fire = MeshBuilder.CreateBox('cinder-bolt', { size: .6 }, this.scene); fire.position.copyFrom(pos).addInPlace(new Vector3(0, 2, 0)); fire.material = this.color('#ffb673', true);
            this.projectiles.push({ mesh: fire, velocity: player.add(Vector3.Up()).subtract(fire.position).normalize().scale(11), life: 5 });
          }
        }
        continue;
      }
      const hostile = definition.hostile && this.save.difficulty !== 'peaceful';
      if (c.timer <= 0) { c.heading += (Math.random() - .5) * 2; c.timer = 2 + Math.random() * 4;if(Math.random()<.2)this.audio.creature(c.kind,Math.max(0,1-distance/28)); }
      if (hostile && distance < 22 || c.hurt > 0) c.heading = Math.atan2(player.x - pos.x, player.z - pos.z) + (!definition.hostile ? Math.PI : 0);
      const speed = c.hurt > 0 ? 3 : c.kind==='villager'&&distance<4?0:definition.speed*(hostile&&distance<22?1:hostile?.35:1);
      const nx = pos.x + Math.sin(c.heading) * speed * dt, nz = pos.z + Math.cos(c.heading) * speed * dt;
      if (this.world.isLoaded(nx, nz)) {
        const ground = this.world.ground(nx, nz, pos.y + 1.5);
        if (Math.abs(ground - pos.y) < 1.6 && (ground > 25 || this.save.dimension !== 'overworld')&&!this.world.solid(nx,ground+1,nz)) { pos.x = nx; pos.z = nz; pos.y += (ground - pos.y) * Math.min(1, dt * 12); } else c.heading += 1;
      }
      c.mesh.rotation.y = c.heading; c.mesh.rotation.z = Math.sin(this.clock * 8 + c.heading) * .025;
      c.rig.animate(this.clock,speed);
      if(c.kind==='skeleton'&&hostile&&distance<18&&distance>3&&c.attack<=0){this.fireBolt(c,player);c.attack=2.5;}
      if(c.kind==='creeper'&&hostile&&distance<3){c.hurt=.6;if(c.attack<=0){const center=pos.clone();this.hit(c,99);this.onExplosion?.(center);continue;}}
      if(c.kind==='endling'&&c.hurt>.6&&c.attack<=0){const tx=player.x+Math.sin(this.clock)*6,tz=player.z+Math.cos(this.clock)*6;if(this.world.isLoaded(tx,tz))pos.set(tx,this.world.ground(tx,tz),tz);c.attack=4;}
      if(definition.model==='sniffer'&&c.attack<-22){this.drop({id:PROCEDURAL_START+(Math.floor(this.clock)%12)*9+8,count:1},pos.add(Vector3.Up()));c.attack=10;this.onToast?.('A sniffer unearthed something unusual.');}
      if (hostile && distance < 1.8 && c.attack <= 0) { this.onDamage?.(this.save.difficulty === 'hard' ? 4 : 2); c.attack = 1.2; }
    }
    if (spectator) return;
    for (const warning of [...this.telegraphs]) {
      warning.time -= dt; warning.mesh.scaling.setAll(1 + Math.sin(warning.time * 15) * .06);
      if (warning.time <= 0) { if (Vector3.Distance(player, warning.position) < 3) this.onDamage?.(warning.damage); this.audio.play('explosion', .35); warning.mesh.dispose(); this.telegraphs = this.telegraphs.filter(t => t !== warning); }
    }
    for (const p of [...this.projectiles]) {
      p.life -= dt; p.mesh.position.addInPlace(p.velocity.scale(dt));
      const hit = Vector3.Distance(p.mesh.position, player.add(Vector3.Up())) < 1.2;
      if (hit) this.onDamage?.(4);
      if (hit || p.life <= 0 || this.world.solid(p.mesh.position.x, p.mesh.position.y, p.mesh.position.z)) { p.mesh.dispose(); this.projectiles = this.projectiles.filter(v => v !== p); }
    }
    for (const d of [...this.drops]) {
      d.age += dt;
      if (!d.settled) {
        d.velocity.y -= 15 * dt; const next = d.mesh.position.add(d.velocity.scale(dt));
        if (this.world.solid(next.x, next.y - .15, next.z)) { d.settled = true; d.ground = Math.floor(next.y - .15) + 1.28; }
        else d.mesh.position.copyFrom(next);
      } else d.mesh.position.y = d.ground + Math.sin(this.clock * 2.5 + d.age) * .07;
      d.mesh.rotation.y += dt;
      if (d.age > d.pickupDelay && Vector3.Distance(d.mesh.position, player.add(new Vector3(0, .7, 0))) < 1.8) {
        d.stack.count = addItem(this.save.player.inventory, d.stack.id, d.stack.count, d.stack.durability);
        if (d.stack.count === 0) this.audio.play('collect', .35);
      }
      if (d.age > 180 || d.stack.count === 0 || d.mesh.position.y < -20) { d.mesh.dispose(); this.drops = this.drops.filter(drop => drop !== d); }
    }
  }
  private makePlate(kind: string, def: { name: string; hostile: boolean; boss?: boolean; model: string }) {
    const color = def.boss ? '#ffd97a' : kind === 'villager' ? '#a8e6a1' : def.hostile ? '#ff9a8a' : '#f2f2e8';
    const tex = new DynamicTexture(`name-${kind}-${Math.floor(Math.random()*1e6)}`, { width: 256, height: 64 }, this.scene, false, Texture.NEAREST_SAMPLINGMODE);
    const ctx = tex.getContext() as unknown as CanvasRenderingContext2D; ctx.clearRect(0, 0, 256, 64);
    ctx.font = 'bold 30px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.shadowColor = 'black'; ctx.shadowBlur = 6; ctx.fillStyle = color; ctx.fillText(def.name.toUpperCase().slice(0, 18), 128, 34); tex.update(); tex.hasAlpha = true;
    const mat = new StandardMaterial(`name-mat-${kind}`, this.scene);
    mat.diffuseTexture = tex; mat.useAlphaFromDiffuseTexture = true; mat.disableLighting = true; mat.emissiveColor = Color3.FromHexString(color); mat.backFaceCulling = false;
    const plate = MeshBuilder.CreatePlane('mob-nameplate', { width: def.boss ? 3.4 : 1.9, height: def.boss ? 0.85 : 0.48 }, this.scene);
    plate.material = mat; plate.isPickable = false; plate.billboardMode = Mesh.BILLBOARDMODE_ALL;
    const lift = def.model === 'dragon' ? 3.2 : def.model === 'wither' ? 3.4 : def.model === 'bird' ? 1.2 : def.model === 'fish' ? 0.9 : 2.25;
    plate.position.set(0, lift, 0);
    return plate;
  }
  private fireBolt(c:Creature,player:Vector3){const mesh=MeshBuilder.CreateBox('mob-projectile',{width:.12,height:.12,depth:.65},this.scene);mesh.position.copyFrom(c.mesh.position).addInPlace(new Vector3(0,1.4,0));mesh.material=this.color(c.kind==='skeleton'?'#c3b990':'#7de1c9',c.kind!=='skeleton');this.projectiles.push({mesh,velocity:player.add(Vector3.Up()).subtract(mesh.position).normalize().scale(12),life:4});}
  private clearSight(from:Vector3,to:Vector3){const delta=to.subtract(from),steps=Math.ceil(delta.length()*4);for(let i=1;i<steps;i++){const p=from.add(delta.scale(i/steps));if(this.world.solid(p.x,p.y,p.z))return false;}return true;}
  dispose() {
    this.creatures.forEach(c => { this.onMesh?.(c.mesh, false); c.plate?.dispose(); c.rig.dispose(); }); this.drops.forEach(d => d.mesh.dispose());
    this.telegraphs.forEach(t => t.mesh.dispose()); this.projectiles.forEach(p => p.mesh.dispose()); this.materials.forEach(m => m.dispose());
    this.creatures = []; this.drops = []; this.telegraphs = []; this.projectiles = [];
  }
}