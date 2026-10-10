import type { DimensionId, Season, WorldPreset } from '../core/types';
import { EXTRA, PROCEDURAL_START } from '../blocks/registry';
import { fbm, hash3, noise2, noise3 } from './noise';
import { mcDepth, mcFill, mcHigh, mcLow, mcSelector } from './minecraftNoise';
import * as legacy from './legacyGenerator';
import { biomeAt, forestMultiplier } from './biomes';
import { applyMegaStructures } from './structures';
export { BIOMES } from './biomes';
export type { Biome } from './biomes';
export const SIZE = 16, HEIGHT = 128, PAD = 18, SEA = 26;
export const blockIndex = (x: number, y: number, z: number) => (x * SIZE + z) * HEIGHT + y;
export const paddedIndex = (x: number, y: number, z: number) => (x * PAD + z) * HEIGHT + y;
export interface GenConfig { seed: number; dimension: DimensionId; preset: WorldPreset; generationVersion?: 1 | 2; season?: Season; siftUnlocked?: boolean }
const smooth = (a: number, b: number, x: number) => { const t = Math.max(0,Math.min(1,(x-a)/(b-a))); return t*t*(3-2*t); };
export function surfaceHeight(x: number, z: number, cfg: GenConfig): number {
  if (cfg.generationVersion === 1 && cfg.dimension !== 'sift') return legacy.surfaceHeight(x,z,cfg);
  if (cfg.preset === 'flat' && cfg.dimension === 'overworld') return 30;
  const { seed, dimension } = cfg;
  const n = fbm(x * .008, z * .008, seed, 3);
  if (dimension === 'end' || dimension === 'sky') return Math.floor(53 + n * 14);
  if (dimension === 'nether') {
    const base = 16 + n * 23 + Math.pow(noise2(x*.008,z*.008,seed+3),3)*34;
    const refuge = 1 - smooth(6,20,Math.hypot(x-2,z+4)); return Math.floor(base*(1-refuge)+34*refuge);
  }
  if (dimension === 'crystal') return Math.floor(22 + n * 21);
  if (dimension === 'sift') {
    const valley = Math.abs(Math.sin(x*.008 + noise2(x*.005,z*.005,seed)*3));
    const base = 19 + n*30 + valley*8, refuge = 1-smooth(6,18,Math.hypot(x-2,z+4));
    return Math.floor(base*(1-refuge)+37*refuge);
  }
  // Vanilla-style routing: smooth low base, rough high detail gated by selector, subtle depth.
  const low = mcLow(x, z, seed), high = mcHigh(x, z, seed);
  const sel = Math.max(0, Math.min(1, mcSelector(x, z, seed)));
  const depth = mcDepth(x, z, seed);
  const continental = fbm(x*.0016,z*.0016,seed+121,3), erosion = noise2(x*.004,z*.004,seed+818);
  const ridge = 1-Math.abs(noise2(x*.006,z*.006,seed+711)*2-1);
  const mountain = smooth(.52,.8,continental)*(1-erosion)*ridge*ridge;
  const amplitude = cfg.preset === 'extreme' ? 150 : cfg.preset === 'amplified' ? 95 : 58;
  let h = 27 + (low-.5)*34 + (high-.5)*26*sel + (depth-.5)*6 + (n-.5)*5 + mountain*amplitude;
  const riverNoise = Math.abs(noise2(x*.0022+51,z*.0022-23,seed+992)-.5);
  h -= (1-smooth(.008,.04,riverNoise))*13;
  const spawnRiver = Math.abs(z - 49 - Math.sin(x*.01)*11);
  h -= (1-smooth(5,20,spawnRiver))*16*(1-smooth(120,185,Math.hypot(x,z)));
  if (cfg.preset === 'archipelago') h-=12;
  // Deep ocean basins: low continental values drop the floor toward the bottom of the world.
  const deepSea = smooth(.46,.3,continental) * (1-smooth(.5,.7,mountain));
  h = h*(1-deepSea) + (2+erosion*10)*deepSea;
  const spawn = 1-smooth(8,55,Math.hypot(x-2,z+4)); h=h*(1-spawn)+35*spawn;
  return Math.floor(Math.max(2,Math.min(111,h)));
}
export function getBiome(x: number,z: number,cfg: GenConfig) {
  if (cfg.generationVersion === 1 && cfg.dimension !== 'sift') return { ...biomeAt(x,z,cfg.seed,cfg.dimension), ...legacy.getBiome(x,z,cfg) };
  return biomeAt(x,z,cfg.seed,cfg.dimension,surfaceHeight(x,z,cfg));
}
export function islandDepth(x: number,z: number,seed: number): number {
  const central = 1-Math.hypot(x,z)/51;
  const cx=Math.round(x/132)*132,cz=Math.round(z/132)*132, radius=21+hash3(cx,0,cz,seed)*21;
  const outer = cx === 0 && cz === 0 ? -1 : 1-Math.hypot(x-cx,z-cz)/radius;
  return Math.max(central,outer);
}
function carveCaves(x: number, y: number, z: number, h: number, seed: number, floating: boolean, preset: WorldPreset): 'air' | 'crystal' | 'lava' | null {
  if (floating || preset === 'flat' || y <= 4 || y >= h - 3) return null;
  // Lava tubes: thin, winding tunnels deep underground that pool with lava at the bottom.
  if (y < 46 && noise3(x*.02,0,z*.02,seed+612) > .35 && Math.abs(noise3(x*.05,y*.03,z*.05,seed+611)-.5) < .02) return y <= 10 ? 'lava' : 'air';
  const cheese = noise3(x*.038,y*.055,z*.038,seed+880);
  const wormA = Math.abs(noise3(x*.06,y*.075,z*.06,seed+453)-.5);
  const wormB = Math.abs(noise3(x*.055,y*.065,z*.055,seed+454)-.5);
  const depthBoost = y < 30 ? 0.025 : 0;
  if (cheese > 0.74 - depthBoost || (wormA < 0.016 && wormB < 0.05) || (wormB < 0.014 && y < 40)) {
    if (y < 26 && noise3(x*.11,y*.13,z*.11,seed+2024) > 0.8) return 'crystal';
    return 'air';
  }
  return null;
}
export function generateChunk(cx: number,cz: number,cfg: GenConfig,edits: Record<string,number>): { padded: Uint16Array; data: Uint16Array } {
  if (cfg.generationVersion === 1 && cfg.dimension !== 'sift') {
    const old=legacy.generateChunk(cx,cz,cfg,{}), padded=new Uint16Array(old.padded),ox=cx*16-1,oz=cz*16-1;
    for (const [key,id] of Object.entries(edits)) { const [x,y,z]=key.split(',').map(Number); if (x>=ox&&x<ox+PAD&&z>=oz&&z<oz+PAD&&y>=0&&y<HEIGHT) padded[paddedIndex(x-ox,y,z-oz)]=id; }
    const data=new Uint16Array(SIZE*SIZE*HEIGHT); for(let x=0;x<SIZE;x++)for(let z=0;z<SIZE;z++) data.set(padded.subarray(paddedIndex(x+1,0,z+1),paddedIndex(x+1,0,z+1)+HEIGHT),blockIndex(x,0,z));
    return {padded,data};
  }
  const padded=new Uint16Array(PAD*PAD*HEIGHT),ox=cx*16-1,oz=cz*16-1,dim=cfg.dimension;
  const set=(x:number,y:number,z:number,id:number)=>{if(x>=ox&&x<ox+PAD&&z>=oz&&z<oz+PAD&&y>=0&&y<HEIGHT)padded[paddedIndex(x-ox,y,z-oz)]=id;};
  const floating=dim==='end'||dim==='sky';
  for(let lx=0;lx<PAD;lx++)for(let lz=0;lz<PAD;lz++){
    const x=ox+lx,z=oz+lz,h=surfaceHeight(x,z,cfg),biome=biomeAt(x,z,cfg.seed,dim,h),depth=floating?islandDepth(x,z,cfg.seed):1;
    if(depth<=0)continue;
    const bottom=floating?h-Math.ceil(depth*25):0;
    const soilDepth = 3 + Math.floor(mcFill(x, z, cfg.seed) * 2.333);
    for(let y=bottom;y<=h;y++){
      let id=y===0?44:y===h?biome.top:y>h-soilDepth?biome.soil:dim==='nether'?30:dim==='end'?33:dim==='sift'?108:y<16?71:3;
      const carve=carveCaves(x,y,z,h,cfg.seed,floating,cfg.preset);
      if(carve==='air')id=0;
      else if(carve==='lava')id=EXTRA.LAVA;
      else if(carve==='crystal')id=hash3(x,y,z,cfg.seed+77)>.5?EXTRA.CRYSTAL_CLUSTER:101;
      if((id===3||id===71)&&y<h-5){const ore=hash3(Math.floor(x/2),Math.floor(y/2),Math.floor(z/2),cfg.seed+51);if(ore>.991)id=PROCEDURAL_START+(Math.floor(ore*10000)%12)*9;else if(ore>.978)id=y<18?15:14;else if(ore>.945)id=12;else if(ore>.9)id=13;else if(ore>.88)id=11;}
      if(cfg.season==='Winter'&&dim==='overworld'&&y===h&&h>SEA&&biome.climate!=='hot'&&cfg.preset!=='flat')id=10;
      set(x,y,z,id);
    }
    if(dim==='overworld'&&cfg.season==='Winter'&&h<SEA&&h>SEA-6&&biome.climate!=='hot')set(x,SEA,z,36);
    if((dim==='overworld'||dim==='sift')&&h<SEA-1&&hash3(x,42,z,cfg.seed)>.968){for(let y=h+1;y<Math.min(SEA,h+4);y++)set(x,y,z,dim==='sift'?101:94);}
    // Coral reefs and tube worms on the seabed.
    if(dim==='overworld'&&cfg.preset!=='flat'&&h>3&&h<SEA-3){
      const r=hash3(x,55,z,cfg.seed);
      if(r>.955){
        const kinds=[EXTRA.CORAL_PINK,EXTRA.CORAL_BLUE,EXTRA.CORAL_PURPLE];
        const kind=kinds[Math.floor(hash3(x,56,z,cfg.seed)*3)%3], height=1+Math.floor(hash3(x,57,z,cfg.seed)*3);
        for(let y=h+1;y<=h+height;y++)set(x,y,z,kind);
      } else if(r<.03) set(x,h+1,z,EXTRA.TUBE_WORM);
    }
    // Ground foliage makes forests and meadows feel alive without blocking movement.
    if(dim==='overworld'&&h>SEA&&cfg.preset!=='flat'){
      const f = hash3(x, 91, z, cfg.seed);
      const flowerField = biome.id==='plains'||biome.id==='lavender'||biome.id==='meadow';
      if(f>.9-(flowerField?.06:0)) set(x,h+1,z,EXTRA.GRASS_TUFT);
      else if(f>.86&&flowerField) set(x,h+1,z,EXTRA.WILDFLOWERS);
      else if(f<.04&&biome.id==='autumn') set(x,h+1,z,EXTRA.FALLEN_LEAVES);
      else if(f<.03) set(x,h+1,z,EXTRA.PEBBLES);
    }
    if(dim==='nether'||dim==='crystal'){
      const roof=Math.floor(96+noise2(x*.04,z*.04,cfg.seed+861)*14);
      for(let y=roof;y<HEIGHT;y++)set(x,y,z,y>124?44:dim==='nether'?30:71);
      if(hash3(Math.floor(x/4),0,Math.floor(z/4),cfg.seed+812)>.76)for(let y=roof-8;y<roof;y++)set(x,y,z,dim==='nether'?31:35);
    }
  }
  if(cfg.preset!=='flat'||dim!=='overworld')for(let gx=Math.floor((ox-7)/9);gx<=Math.floor((ox+PAD+7)/9);gx++)for(let gz=Math.floor((oz-7)/9);gz<=Math.floor((oz+PAD+7)/9);gz++){
    const chance=hash3(gx,97,gz,cfg.seed),x=gx*9+2+Math.floor(hash3(gx,3,gz,cfg.seed)*5),z=gz*9+2+Math.floor(hash3(gx,9,gz,cfg.seed)*5),h=surfaceHeight(x,z,cfg),b=biomeAt(x,z,cfg.seed,dim,h);
    const density=b.density*(dim==='overworld'?forestMultiplier(x,z,cfg.seed):1);
    if(Math.hypot(x-2,z+4)<12||dim==='overworld'&&Math.hypot(x-21,z-5)<21||floating&&islandDepth(x,z,cfg.seed)<.1||chance>density||h<(dim==='nether'?25:dim==='sift'?28:SEA+1))continue;
    if(b.feature==='mushrooms'){
      const stem=dim==='nether'?b.tree||88:67,cap=dim==='nether'?b.foliage||89:chance<.2?65:66,hh=4+Math.floor(hash3(gx,5,gz,cfg.seed)*4);
      for(let y=1;y<=hh;y++)set(x,h+y,z,stem);
      for(let dx=-3;dx<=3;dx++)for(let dz=-3;dz<=3;dz++)if(Math.abs(dx)+Math.abs(dz)<6)set(x+dx,h+hh,z+dz,cap);
      for(let dx=-2;dx<=2;dx++)for(let dz=-2;dz<=2;dz++)set(x+dx,h+hh+1,z+dz,cap);
    }else if(b.feature==='bones'){
      for(let dz=-3;dz<=3;dz++)set(x,h+1,z+dz,69);
      for(let dz=-2;dz<=2;dz+=2)for(let s=-1;s<=1;s+=2){for(let y=1;y<=3;y++)set(x+s*2,h+y,z+dz,69);set(x+s,h+4,z+dz,69);}
    }else if(b.feature==='spires'||b.feature==='crystals'){
      const hh=6+Math.floor(hash3(gx,5,gz,cfg.seed)*19),id=b.feature==='crystals'?(chance<.1?62:101):dim==='sift'?75:dim==='end'?25:22;
      for(let y=1;y<=hh;y++)for(let dx=-1;dx<=1;dx++)for(let dz=-1;dz<=1;dz++)if(y<hh-2||dx===0&&dz===0)set(x+dx,h+y,z+dz,y===hh&&dim==='end'?34:id);
    }else if(b.feature==='cactus'){for(let y=1;y<4;y++)set(x,h+y,z,99);}
    else if(b.tree){
      const conifer=b.tree===5||b.tree===115;
      const jungle=b.id==='jungle', savanna=b.id==='savanna';
      const trunkH = dim==='end' ? 4 : jungle ? 10+Math.floor(hash3(gx,6,gz,cfg.seed)*4) : conifer ? 9 : savanna ? 4 : 5+Math.floor(hash3(gx,6,gz,cfg.seed)*3);
      for(let y=1;y<=trunkH;y++)set(x,h+y,z,b.tree);
      const topY=h+trunkH;
      if(savanna){for(let dx=-3;dx<=3;dx++)for(let dz=-3;dz<=3;dz++)if(Math.abs(dx)+Math.abs(dz)<5)set(x+dx,topY+1,z+dz,b.foliage);}
      else for(let y=conifer?topY-h-6:trunkH-2;y<=trunkH+2;y++){const r=conifer?Math.max(0,Math.ceil((trunkH+2-y)/2.7)):jungle?3:y===trunkH+2?1:2;for(let dx=-r;dx<=r;dx++)for(let dz=-r;dz<=r;dz++){if(dx===0&&dz===0&&y<=trunkH||Math.abs(dx)===r&&Math.abs(dz)===r&&r>1)continue;set(x+dx,h+y,z+dz,cfg.season==='Winter'&&y===trunkH+2&&b.climate!=='hot'?10:b.foliage);}}
    }
  }
  const house=(bx:number,bz:number)=>{
    const h=surfaceHeight(bx,bz,cfg);
    for(let x=bx-3;x<=bx+3;x++)for(let z=bz-3;z<=bz+3;z++){
      for(let y=Math.min(surfaceHeight(x,z,cfg),h);y<=h;y++)set(x,y,z,8);set(x,h,z,7);
      for(let y=1;y<=4;y++){const wall=Math.abs(x-bx)===3||Math.abs(z-bz)===3,door=z===bz-3&&x===bx&&y<3,window=y===2&&(Math.abs(x-bx)===3&&z===bz||z===bz+3&&x===bx);set(x,h+y,z,wall&&!door?window?9:7:0);}
      set(x,h+5+3-Math.abs(x-bx),z,17);
    }
    set(bx-2,h+1,bz+2,23);set(bx-1,h+1,bz+2,24);set(bx+2,h+1,bz+2,29);set(bx,h+4,bz,28);
  };
  if(dim==='overworld'&&cfg.preset!=='flat'){
    for(let vx=Math.floor((ox-45)/480);vx<=Math.floor((ox+PAD+45)/480);vx++)for(let vz=Math.floor((oz-45)/480);vz<=Math.floor((oz+PAD+45)/480);vz++){
      const bx=vx*480+21,bz=vz*480+6;
      if((vx===0&&vz===0)||hash3(vx,334,vz,cfg.seed)>.5){
        for(const [dx,dz] of [[-8,0],[8,3],[0,15],[16,17]]){const hx=bx+dx,hz=bz+dz;if(hx+4>=ox&&hx-4<ox+PAD&&hz+4>=oz&&hz-4<oz+PAD)house(hx,hz);}
        for(let x=Math.max(ox,bx-14);x<Math.min(ox+PAD,bx+22);x++)for(let z=Math.max(oz,bz-10);z<Math.min(oz+PAD,bz+23);z++)if(Math.abs(x-bx)<2||Math.abs(z-bz+6)<2)set(x,surfaceHeight(x,z,cfg),z,38);
      }
    }
    const ax=42,az=-28,ay=16;
    for(let x=Math.max(ox,ax-12);x<Math.min(ox+PAD,ax+13);x++)for(let z=Math.max(oz,az-10);z<Math.min(oz+PAD,az+11);z++){
      set(x,ay,z,(x+z)%5===0?70:104);for(let y=ay+1;y<=ay+12;y++)set(x,y,z,0);
      if((Math.abs(x-ax)===10&&Math.abs(z-az)<8)||(Math.abs(z-az)===8&&Math.abs(x-ax)<10))for(let y=ay+1;y<ay+7;y++)if(x%5===0||z%5===0)set(x,y,z,104);
    }
    for(let s=0;s<25;s++)for(let dx=-1;dx<=1;dx++){const x=ax+dx,z=az-9-s,y=ay+Math.min(19,s);set(x,y,z,104);for(let up=1;up<6;up++)set(x,y+up,z,0);}
    for(let dx=-3;dx<=3;dx++)for(let y=0;y<=6;y++)set(ax+dx,ay+1+y,az+4,Math.abs(dx)===3||y===0||y===6?72:0);
    for(let i=0;i<4;i++){set(ax-3+i*2,ay+1,az-1,79+i);set(ax-3+i*2,ay,az-1,106);}
    set(ax-8,ay+1,az,106);set(ax+8,ay+1,az,106);
    applyMegaStructures(ox,oz,PAD,cfg,set);
  }
  if(cfg.preset!=='flat'){
    const px=-13,pz=9,ph=surfaceHeight(px,pz,cfg);
    for(let dx=-2;dx<=2;dx++)for(let y=0;y<=5;y++)set(px+dx,ph+y,pz,Math.abs(dx)===2||y===0||y===5?(dim==='end'?92:25):dim==='sift'?83:26);
  }
  if((dim==='overworld'&&cfg.siftUnlocked||dim==='sift')&&cfg.preset!=='flat'){
    for(let rx=Math.floor((ox-8)/768);rx<=Math.floor((ox+PAD+8)/768);rx++)for(let rz=Math.floor((oz-8)/768);rz<=Math.floor((oz+PAD+8)/768);rz++){
      const x=rx*768+387,z=rz*768-211;if(hash3(rx,931,rz,cfg.seed)<.82)continue;
      if(Math.hypot(x-2,z+4)<260)continue;
      const y=surfaceHeight(x,z,cfg)+1;
      for(let dx=-2;dx<=2;dx++)for(let dy=0;dy<=5;dy++)set(x+dx,y+dy,z,Math.abs(dx)===2||dy===0||dy===5?108:83);
    }
  }
  if(dim==='end')for(let i=0;i<8;i++){
    const x=Math.round(Math.sin(i*Math.PI/4)*33),z=Math.round(Math.cos(i*Math.PI/4)*33),h=surfaceHeight(x,z,cfg),hh=16+i%3*6;
    if(x+2<ox||x-2>ox+PAD||z+2<oz||z-2>oz+PAD)continue;
    for(let dx=-2;dx<=2;dx++)for(let dz=-2;dz<=2;dz++)if(dx*dx+dz*dz<=5)for(let y=h;y<h+hh;y++)set(x+dx,y,z+dz,25);
    set(x,h+hh,z,34);
  }
  for(const [key,id] of Object.entries(edits)){const [x,y,z]=key.split(',').map(Number);set(x,y,z,id);}
  const data=new Uint16Array(SIZE*SIZE*HEIGHT);
  for(let x=0;x<SIZE;x++)for(let z=0;z<SIZE;z++){const start=paddedIndex(x+1,0,z+1);data.set(padded.subarray(start,start+HEIGHT),blockIndex(x,0,z));}
  return {padded,data};
}
