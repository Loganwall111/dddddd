import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Vector4 } from '@babylonjs/core/Maths/math.vector';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture';
import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import type { Scene } from '@babylonjs/core/scene';
import { BLOCKS, block, ATLAS_COLS, ATLAS_ROWS } from './registry';
import { hash3 } from '../world/noise';
import { VoxelAtlasPlugin } from '../rendering/VoxelAtlasPlugin';
import type { Season } from '../core/types';

const itemMaterials = new WeakMap<PBRMaterial | StandardMaterial, StandardMaterial>();
const seasonAtlases = new WeakMap<PBRMaterial, { pixels: Uint8ClampedArray; season: string }>();
const WIDTH = ATLAS_COLS * 16, HEIGHT = ATLAS_ROWS * 16;
export type VoxelMaterial = PBRMaterial & { voxelPlugin: VoxelAtlasPlugin; glassMaterial: PBRMaterial };
const spriteMaterials=new WeakMap<Scene,Map<number,StandardMaterial>>();

function tint(hex: string, value: number): string {
  const color = Color3.FromHexString(hex).scale(value);
  return `rgb(${Math.min(255, color.r * 255)},${Math.min(255, color.g * 255)},${Math.min(255, color.b * 255)})`;
}
export function createBlockMaterial(scene: Scene): VoxelMaterial {
  const texture = new DynamicTexture('original-pixel-atlas', { width: WIDTH, height: HEIGHT }, scene, false, Texture.NEAREST_SAMPLINGMODE);
  const emissive = new DynamicTexture('emissive-atlas', { width: WIDTH, height: HEIGHT }, scene, false, Texture.NEAREST_SAMPLINGMODE);
  const normals = new DynamicTexture('procedural-normal-atlas', { width: WIDTH, height: HEIGHT }, scene, false, Texture.NEAREST_SAMPLINGMODE);
  const orm = new DynamicTexture('procedural-roughness-metallic-atlas', { width: WIDTH, height: HEIGHT }, scene, false, Texture.NEAREST_SAMPLINGMODE);
  normals.gammaSpace = false; orm.gammaSpace = false;
  const ctx = texture.getContext(), glow = emissive.getContext(), nc = normals.getContext(), mc = orm.getContext();
  glow.fillStyle = '#000000'; glow.fillRect(0, 0, WIDTH, HEIGHT);
  for (const b of BLOCKS) for (let face = 0; face < 2; face++) {
    const tile = b.id * 2 + face, ox = tile % ATLAS_COLS * 16, oy = Math.floor(tile / ATLAS_COLS) * 16;
    const base = face === 1 && b.top && b.texture !== 'ore' ? b.top : b.color;
    for (let x = 0; x < 16; x++) for (let y = 0; y < 16; y++) {
      const r = hash3(x, y, b.id, 513);
      let color = base, bright = .87 + r * .24;
      if (b.texture === 'grass' && !face && y < 3 + Math.floor(hash3(x, 1, 0, 6) * 3)) color = b.top || base;
      if (b.texture === 'plank' && (y % 4 === 0 || (x + Math.floor(y / 4) * 7) % 16 === 0)) bright *= .65;
      if (b.texture === 'wood' && !face && x % 4 === 0) bright *= .69;
      if (b.texture === 'wood' && face && Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5)) % 3 < 1) bright *= .76;
      if (b.texture === 'brick' && (y % 5 === 0 || (x + Math.floor(y / 5) * 6) % 12 === 0)) bright *= .68;
      if (b.texture === 'ore' && hash3(Math.floor(x / 2), Math.floor(y / 2), b.id, 456) > .72) color = b.top || '#adccce';
      if (b.texture === 'glass') bright = x === 0 || y === 0 || x === 15 || y === 15 || x === y ? 1.14 : .76;
      if (b.texture === 'tnt' && !face && y > 5 && y < 11) { color = '#e7dec3'; bright = .9 + r * .1; }
      if (b.texture === 'glow') bright = .7 + Math.abs(Math.sin(x * .7 + y * .31)) * .55;
      if (b.texture === 'stone') bright *= .91 + hash3(Math.floor(x/3),Math.floor(y/3),b.id,771)*.18;
      if (b.texture === 'mushroom' && hash3(Math.floor(x/3),Math.floor(y/3),b.id,82)>.72) color='#eadbc1';
      if (b.texture === 'bone') bright *= x%5===0?.78:1;
      if (b.texture === 'rune' && (x===3||x===12||y===3||y===12||x===y&&x>5&&x<11)) bright *= 1.5;
      if (b.texture === 'metal') bright *= x===0||y===0?.72:1.05;
      ctx.fillStyle = tint(color, bright); ctx.fillRect(ox + x, oy + y, 1, 1);
      if (b.emissive) { glow.fillStyle = tint(color, bright * .82); glow.fillRect(ox + x, oy + y, 1, 1); }
      const detail = b.texture==='brick' || b.texture==='plank' ? y%4===0 ? -.8 : .2 : (r-.5)*.8;
      nc.fillStyle=`rgb(${Math.round(128+detail*43)},${Math.round(128+(hash3(x+1,y,b.id,513)-r)*48)},246)`;nc.fillRect(ox+x,oy+y,1,1);
      mc.fillStyle=`rgb(240,${Math.round((b.roughness??(b.texture==='glass'?.1:b.texture==='metal'?.28:.88))*255)},${Math.round((b.metallic??(b.texture==='metal'?.8:.015))*255)})`;mc.fillRect(ox+x,oy+y,1,1);
    }
    if (b.id === 27 && !face) {
      ctx.fillStyle = '#584332'; ctx.font = 'bold 5px monospace'; ctx.fillText('TNT', ox + 3, oy + 10);
    }
    if (b.id === 24 && !face) { ctx.fillStyle = '#303937'; ctx.fillRect(ox + 4, oy + 7, 8, 6); ctx.fillStyle = '#b99565'; ctx.fillRect(ox + 5, oy + 11, 6, 1); }
    if (b.id === 29 && !face) { ctx.fillStyle = '#58482f'; ctx.fillRect(ox, oy + 6, 16, 2); ctx.fillStyle = '#ddc782'; ctx.fillRect(ox + 7, oy + 6, 3, 5); }
    if (b.id === 23 && face) { ctx.strokeStyle = '#715336'; ctx.lineWidth = 1; for (let i = 4; i < 15; i += 4) { ctx.beginPath(); ctx.moveTo(ox + i, oy + 1); ctx.lineTo(ox + i, oy + 15); ctx.stroke(); ctx.beginPath(); ctx.moveTo(ox + 1, oy + i); ctx.lineTo(ox + 15, oy + i); ctx.stroke(); } }
  }
  texture.update(true); emissive.update(true); normals.update(true); orm.update(true);
  const material = new PBRMaterial('voxel-pbr-material', scene) as VoxelMaterial;
  material.albedoTexture = texture; material.emissiveTexture = emissive;
  material.emissiveColor = Color3.White(); material.emissiveIntensity = .75;
  material.metallic = 1; material.roughness = 1; material.metallicTexture = orm;
  material.useRoughnessFromMetallicTextureAlpha = false; material.useRoughnessFromMetallicTextureGreen = true; material.useMetallnessFromMetallicTextureBlue = true;
  material.environmentIntensity = .4; material.directIntensity = 1.1; material.clearCoat.isEnabled = true; material.clearCoat.intensity = 0; material.clearCoat.roughness = .12;
  material.backFaceCulling = true;
  const itemMaterial = new StandardMaterial('item-material', scene);
  itemMaterial.diffuseTexture = texture; itemMaterial.emissiveTexture = emissive;
  itemMaterial.emissiveColor = Color3.Black(); itemMaterial.specularColor = Color3.Black();
  itemMaterials.set(material, itemMaterial);
  seasonAtlases.set(material, { pixels: new Uint8ClampedArray(ctx.getImageData(0, 0, WIDTH, HEIGHT).data), season: 'Summer' });
  material.voxelPlugin = new VoxelAtlasPlugin(material,normals);
  const glass=new PBRMaterial('clear-voxel-glass',scene);glass.albedoTexture=texture;glass.metallic=0;glass.roughness=.065;glass.alpha=.26;glass.backFaceCulling=false;glass.twoSidedLighting=true;glass.transparencyMode=PBRMaterial.PBRMATERIAL_ALPHABLEND;glass.environmentIntensity=.8;
  new VoxelAtlasPlugin(glass,normals);material.glassMaterial=glass;
  return material;
}
export function applySeason(material: PBRMaterial, season: Season) {
  const state = seasonAtlases.get(material);
  if (!state || state.season === season) return;
  state.season = season;
  const texture = material.albedoTexture as DynamicTexture, ctx = texture.getContext(), image = ctx.getImageData(0, 0, WIDTH, HEIGHT);
  image.data.set(state.pixels);
  const tintColor = season === 'Autumn' ? [178, 133, 66] : season === 'Winter' ? [192, 210, 197] : [132, 160, 85];
  if (season !== 'Summer') for (const id of BLOCKS.filter(b=>b.texture==='leaf'||b.id===1||b.id===39).map(b=>b.id)) for (let face = 0; face < 2; face++) {
    const tile = id * 2 + face, ox = tile % ATLAS_COLS * 16, oy = Math.floor(tile / ATLAS_COLS) * 16;
    for (let x = 0; x < 16; x++) for (let y = 0; y < 16; y++) {
      const offset = ((oy + y) * WIDTH + ox + x) * 4;
      if (id === 1 && face === 0 && image.data[offset] > image.data[offset + 1]) continue;
      const factor = .82 + hash3(x, y, id, 6) * .25;
      for (let c = 0; c < 3; c++) image.data[offset + c] = tintColor[c] * factor;
    }
  }
  ctx.putImageData(image, 0, 0); texture.update(true);
}
const iconCache = new Map<number, string>();
export function blockMesh(id: number, scene: Scene, material: StandardMaterial | PBRMaterial, size = 1) {
  const def=block(id);
  if(!def.solid&&!def.portal){
    let sprites=spriteMaterials.get(scene);if(!sprites){sprites=new Map();spriteMaterials.set(scene,sprites);}
    let sprite=sprites.get(id);
    if(!sprite){sprite=new StandardMaterial(`pixel-item-${id}`,scene);const image=new Texture(itemIcon(id),scene,true,false,Texture.NEAREST_SAMPLINGMODE);image.hasAlpha=true;sprite.diffuseTexture=image;sprite.useAlphaFromDiffuseTexture=true;sprite.backFaceCulling=false;sprite.specularColor=Color3.Black();sprite.emissiveColor=new Color3(.22,.22,.22);sprites.set(id,sprite);}
    const mesh=MeshBuilder.CreatePlane(`item-${id}`,{size:size*1.65,sideOrientation:2},scene);mesh.material=sprite;mesh.isPickable=false;return mesh;
  }
  const uv = (tile: number) => new Vector4((tile % ATLAS_COLS + .03) / ATLAS_COLS, 1 - (Math.floor(tile / ATLAS_COLS) + .97) / ATLAS_ROWS, (tile % ATLAS_COLS + .97) / ATLAS_COLS, 1 - (Math.floor(tile / ATLAS_COLS) + .03) / ATLAS_ROWS);
  const mesh = MeshBuilder.CreateBox(`item-${id}`, { size, faceUV: [uv(id * 2), uv(id * 2), uv(id * 2), uv(id * 2), uv(id * 2 + 1), uv(id * 2)] }, scene);
  mesh.material = itemMaterials.get(material) || material; mesh.isPickable = false; return mesh;
}
export function itemIcon(id: number): string {
  if (iconCache.has(id)) return iconCache.get(id)!;
  const b = block(id);
  let body = '';
  if(b.spawn){body=`<path fill="${b.color}" d="M16 4h8v4h4v4h4v8h4v10h-4v4H8v-4H4V20h4v-8h4V8h4z"/><path fill="${b.top}" d="M12 12h8v8h-8zm12 12h8v6h-8zM8 25h7v5H8z"/><path fill="#ffffff" opacity=".3" d="M13 9h4v4h-4zm-4 8h3v7H9z"/>`;}
  else if (b.tool === 'pickaxe') body = `<path fill="#795635" d="m10 26 3 3 16-16-3-3z"/><path fill="${b.color}" d="m13 7 3-3 15 3 6 8-4 4-6-8-10-2z"/><path fill="#e5e8d7" opacity=".5" d="m16 4 15 3-2 2-15-3z"/>`;
  else if (b.tool === 'sword') body = `<path fill="${b.color}" d="M28 4h7v7L19 27l-6-6z"/><path fill="#f5f8e9" d="M28 4h4L16 24l-3-3z"/><path fill="#b99951" d="m9 20 3-3 14 14-3 3z"/><path fill="#725038" d="m8 27 4-4 6 6-4 4z"/>`;
  else if (b.tool === 'axe') body = `<path fill="#795635" d="m12 32-3-3L29 8l3 3z"/><path fill="${b.color}" d="M20 5h10v6l-8 9-9-8z"/>`;
  else if(b.tool==='igniter') body=`<path fill="${b.color}" d="M8 14h6v-5h14v5h5v13h-6v-7h-8v9h-6v-5H8z"/><path fill="#f1c45f" d="m25 2 3 6-4 2-3-5z"/><path fill="#627168" d="M14 29h9v5h-9z"/>`;
  else if (b.texture === 'food') body = `<path fill="${b.color}" d="M12 10h6V7h8v3h5v5h4v15h-5v4H12v-4H7V16h5z"/><path fill="#f1ba8a" opacity=".5" d="M12 14h6v4h-3v7h-4z"/><path fill="#6d8550" d="M22 4h8v4h-8z"/>`;
  else if (id === 59) body = '<path fill="#a58458" d="m9 31 4 4L33 9l-4-4z"/>';
  else if (b.armor) body = b.armor === 2 ? `<path fill="${b.color}" d="M9 11h5V7h15v4h5v19h-8v-9H16v9H9z"/>` : `<path fill="${b.color}" d="m9 8 7-3 4 7h3l4-7 8 3 4 12h-8v15H12V20H4z"/>`;
  else {
    body = `<path fill="${b.top || b.color}" d="M20 4 36 12 20 20 4 12z"/><path fill="${b.color}" d="M4 12 20 20v18L4 30z"/><path fill="${tint(b.color, .67)}" d="M20 20 36 12v18l-16 8z"/>`;
    for (let i = 0; i < 9; i++) {
      const x = 7 + (i % 3) * 4, y = 16 + Math.floor(i / 3) * 5 + i % 3 * 2;
      body += `<path opacity="${.06 + hash3(i, id, 1, 12) * .2}" fill="${i % 2 ? '#fff' : '#000'}" d="m${x} ${y} 3 1.5v3l-3-1.5z"/>`;
    }
    if (id === 27) body += '<path fill="#ebdcc1" d="m4 20 16 8v6L4 26z"/><path fill="#ded2b9" d="m20 28 16-8v6l-16 8z"/>';
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40" shape-rendering="crispEdges">${body}</svg>`;
  const url = `data:image/svg+xml,${encodeURIComponent(svg)}`; iconCache.set(id, url); return url;
}