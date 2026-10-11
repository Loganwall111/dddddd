/**
 * THE MULTIVERSE — world/foliage.js
 * ==================================================================
 * FOLIAGE. The lushness budget of the valley lives here: alien trees, bushes,
 * grass tufts, glowing flowers, mushrooms, reeds and crystal spires — all
 * procedurally grown, all instanced, all wind-animated, all placed from the
 * terrain field so that vegetation *follows the land*: meadows fill the
 * floors, forests climb the slopes, reeds ring the lakes, crystals grow on
 * the dry flats.
 *
 * Population is chunked and deterministic: chunk (cx,cz) always grows the
 * same plants, so the world is identical every time you walk through it.
 * Layers are LOD'd by distance and capped by the quality preset.
 */
import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  Group,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  Quaternion,
  Vector3,
  Euler,
} from 'three';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';
import { Rng, hash2 } from '../core/rand.js';
import { clamp, clamp01, lerp, smoothstep } from '../core/math.js';
import { patchFoliageMaterial } from '../render/shaders.js';
import { BIOMES } from './terrain.js';

/* ------------------------------------------------------------------ *
 * Geometry builders
 * ------------------------------------------------------------------ */

/** Give a geometry a vertex-colour attribute (1,1,1) so instancing tints work. */
function ensureVertexColor(geometry, tint = [1, 1, 1]) {
  const count = geometry.attributes.position.count;
  if (!geometry.attributes.color) {
    const colors = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      colors[i * 3] = tint[0];
      colors[i * 3 + 1] = tint[1];
      colors[i * 3 + 2] = tint[2];
    }
    geometry.setAttribute('color', new BufferAttribute(colors, 3));
  }
  return geometry;
}

/** Add the per-vertex wind attributes the foliage shader needs. */
function addHeightAttribute(geometry, { min = 0, max = 1 } = {}) {
  const position = geometry.attributes.position;
  const count = position.count;
  const heights = new Float32Array(count);
  const phases = new Float32Array(count);
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < count; i++) {
    const y = position.getY(i);
    lo = Math.min(lo, y);
    hi = Math.max(hi, y);
  }
  const span = Math.max(0.0001, hi - lo);
  for (let i = 0; i < count; i++) {
    const t = (position.getY(i) - lo) / span;
    heights[i] = clamp01(lerp(min, max, t));
    phases[i] = (hash2(Math.round(position.getX(i) * 97), Math.round(position.getZ(i) * 97)) % 1000) / 1000;
  }
  geometry.setAttribute('aHeight', new BufferAttribute(heights, 1));
  geometry.setAttribute('aPhase', new BufferAttribute(phases, 1));
  return geometry;
}

function tagGeometry(geometry, tag) {
  geometry.userData.mvTag = tag;
  return geometry;
}

/**
 * Grow a tree. Returns { trunk, canopy, height, radius, lean }.
 * Species are deliberately alien: nothing here is an oak.
 */
export function buildTree(species, rng, { lod = 0 } = {}) {
  const trunkParts = [];
  const canopyParts = [];

  const height = species.height * lerp(0.8, 1.25, rng.float());
  const trunkRadius = species.trunkRadius * lerp(0.85, 1.2, rng.float());
  const trunkSegments = Math.max(5, Math.round(lerp(10, 6, lod)));
  const radialSegments = lod > 1 ? 5 : lod > 0 ? 6 : 8;

  // --- trunk: a slightly curved, tapering stem ---
  const bend = rng.range(-0.16, 0.16);
  const bendAxis = rng.angle();
  const trunk = new BufferGeometry();
  {
    const positions = [];
    const indices = [];
    const rings = 8;
    for (let r = 0; r <= rings; r++) {
      const t = r / rings;
      const y = t * height * (species.canopyStart ?? 0.55);
      const radius = trunkRadius * (1 - t * 0.68) + 0.05;
      const bendOffsetX = Math.sin(bend * t * Math.PI) * bendAxis;
      const bendOffsetZ = Math.cos(bend * t * Math.PI) * bend * t * 1.8;
      for (let a = 0; a <= radialSegments; a++) {
        const angle = (a / radialSegments) * Math.PI * 2;
        const nx = Math.cos(angle);
        const nz = Math.sin(angle);
        // Fluted trunks (like buttress roots) read as organic.
        const flute = 1 + Math.sin(angle * (species.flutes ?? 5)) * 0.12;
        positions.push(nx * radius * flute + bendOffsetX, y, nz * radius * flute + bendOffsetZ);

      }
    }
    for (let r = 0; r < rings; r++) {
      for (let a = 0; a < radialSegments; a++) {
        const i0 = r * (radialSegments + 1) + a;
        const i1 = i0 + 1;
        const i2 = i0 + radialSegments + 1;
        const i3 = i2 + 1;
        indices.push(i0, i2, i1, i1, i2, i3);
      }
    }
    trunk.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
    trunk.setIndex(indices);
    trunk.computeVertexNormals();
    trunk.computeBoundingSphere();
  }
  trunkParts.push(trunk);

  // --- branches reaching into the canopy ---
  const branchCount = Math.round(species.branches * lerp(0.7, 1.3, rng.float()));
  for (let b = 0; b < branchCount; b++) {
    const t = rng.range(0.35, 0.92);
    const y = t * height * (species.canopyStart ?? 0.55);
    const angle = rng.angle();
    const len = species.canopyRadius * rng.range(0.35, 0.8);
    const branch = new BufferGeometry();
    branch.attributes.position = new BufferAttribute(
      new Float32Array([
        0, 0, 0,
        Math.cos(angle) * len * 0.5, len * 0.22, Math.sin(angle) * len * 0.5,
        Math.cos(angle) * len, len * 0.34, Math.sin(angle) * len,
      ]),
      3
    );
    branch.attributes.normal = new BufferAttribute(new Float32Array([0, 1, 0, 0, 1, 0, 0, 1, 0]), 3);
    branch.computeBoundingSphere();
    // thickness via scaling in x/z: cheap, effective for low LOD branches
    branch.scale(1, 1, 1);
    const matrix = new Matrix4().makeTranslation(0, y, 0);
    branch.applyMatrix4(matrix);
    trunkParts.push(branch);
  }

  // --- canopy: clustered blobs (leaf spheres) with a silhouette ---
  const clusterCount = Math.round(species.clusters * lerp(0.75, 1.25, rng.float()));
  for (let c = 0; c < clusterCount; c++) {
    const theta = rng.angle();
    const phi = rng.range(0.15, 1.0);
    const radius = species.canopyRadius * Math.sqrt(phi);
    const cx = Math.cos(theta) * radius;
    const cz = Math.sin(theta) * radius;
    const cy = height * (species.canopyStart ?? 0.55) + rng.range(0.0, species.canopyHeight ?? height * 0.45);
    const blob = new BufferGeometry();
    const size = species.canopyRadius * rng.range(0.42, 0.78);
    const sphere = new (function () {})();
    void sphere;
    // Low-poly icosahedron-ish blob via a manually jittered octahedron.
    const verts = [];
    const faces = [];
    const res = lod > 1 ? 1 : 2;
    const lat = 2 + res;
    const lon = 3 + res * 2;
    for (let i = 0; i <= lat; i++) {
      const v = i / lat;
      const theta2 = v * Math.PI;
      for (let j = 0; j <= lon; j++) {
        const u = j / lon;
        const phi2 = u * Math.PI * 2;
        const jitter = 1 + (hash2(i * 31 + c, j * 17 + c) % 100) / 400;
        verts.push(
          Math.sin(theta2) * Math.cos(phi2) * size * jitter,
          Math.cos(theta2) * size * jitter * (species.canopySquash ?? 0.78),
          Math.sin(theta2) * Math.sin(phi2) * size * jitter
        );
      }
    }
    for (let i = 0; i < lat; i++) {
      for (let j = 0; j < lon; j++) {
        const a = i * (lon + 1) + j;
        const b = a + 1;
        const cc = a + lon + 1;
        const d = cc + 1;
        faces.push(a, cc, b, b, cc, d);
      }
    }
    blob.setAttribute('position', new BufferAttribute(new Float32Array(verts), 3));
    blob.setIndex(faces);
    blob.computeVertexNormals();
    blob.translate(cx, cy, cz);
    blob.computeBoundingSphere();
    canopyParts.push(blob);
  }

  const trunkGeometry = trunkParts.length ? BufferGeometryUtils.mergeGeometries(trunkParts.map((g) => ensureIndexed(g)), false) : null;
  const canopyGeometry = canopyParts.length
    ? BufferGeometryUtils.mergeGeometries(canopyParts.map((g) => ensureIndexed(g)), false)
    : null;
  for (const part of [...trunkParts, ...canopyParts]) part.dispose();

  if (trunkGeometry) {
    addHeightAttribute(trunkGeometry, { min: 0.02, max: 0.16 });
    ensureVertexColor(trunkGeometry, [1, 1, 1]);
    tagGeometry(trunkGeometry, 'trunk');
  }
  if (canopyGeometry) {
    addHeightAttribute(canopyGeometry, { min: 0.25, max: 1 });
    ensureVertexColor(canopyGeometry, [1, 1, 1]);
    tagGeometry(canopyGeometry, 'canopy');
  }
  return { trunk: trunkGeometry, canopy: canopyGeometry, height, radius: species.canopyRadius };
}

function ensureIndexed(geometry) {
  if (!geometry.index) {
    const count = geometry.attributes.position.count;
    const index = new Uint32Array(count);
    for (let i = 0; i < count; i++) index[i] = i;
    geometry.setIndex(new BufferAttribute(index, 1));
  }
  if (!geometry.attributes.uv) {
    const count = geometry.attributes.position.count;
    geometry.setAttribute('uv', new BufferAttribute(new Float32Array(count * 2), 2));
  }
  if (!geometry.attributes.normal) geometry.computeVertexNormals();
  return geometry;
}

/** A blade-cluster tuft: the workhorse of the meadows. */
export function buildGrassTuft(rng, { blades = 5, height = 0.9, spread = 0.34 } = {}) {
  const parts = [];
  for (let b = 0; b < blades; b++) {
    const angle = (b / blades) * Math.PI * 2 + rng.range(-0.4, 0.4);
    const lean = rng.range(0.12, 0.4);
    const h = height * rng.range(0.7, 1.3);
    const width = 0.045 * rng.range(0.7, 1.4);
    const px = Math.cos(angle) * spread * rng.range(0.1, 1);
    const pz = Math.sin(angle) * spread * rng.range(0.1, 1);
    const tipX = px + Math.cos(angle) * lean * h;
    const tipZ = pz + Math.sin(angle) * lean * h;
    const geometry = new BufferGeometry();
    geometry.setAttribute(
      'position',
      new BufferAttribute(
        new Float32Array([
          px - Math.sin(angle) * width, 0, pz + Math.cos(angle) * width,
          px + Math.sin(angle) * width, 0, pz - Math.cos(angle) * width,
          tipX, h, tipZ,
        ]),
        3
      )
    );
    geometry.setAttribute('normal', new BufferAttribute(new Float32Array([0, 1, 0, 0, 1, 0, 0, 1, 0]), 3));
    geometry.setAttribute('uv', new BufferAttribute(new Float32Array([0, 0, 1, 0, 0.5, 1]), 2));
    parts.push(geometry);
  }
  const merged = BufferGeometryUtils.mergeGeometries(parts, false);
  for (const part of parts) part.dispose();
  // Normalise the wind attribute against the tuft's own height.
  const position = merged.attributes.position;
  const heights = new Float32Array(position.count);
  for (let i = 0; i < position.count; i++) heights[i] = clamp01(position.getY(i) / height);
  merged.setAttribute('aHeight', new BufferAttribute(heights, 1));
  const phases = new Float32Array(position.count);
  for (let i = 0; i < position.count; i++) phases[i] = rng.float();
  merged.setAttribute('aPhase', new BufferAttribute(phases, 1));
  ensureVertexColor(merged, [1, 1, 1]);
  merged.computeBoundingSphere();
  return merged;
}

/** Small flowering plant: stem + a few petal quads + a glowing core. */
export function buildFlower(rng, { color = 0xffd166, glowing = true } = {}) {
  const stemHeight = rng.range(0.35, 0.8);
  const stem = new BufferGeometry();
  stem.setAttribute(
    'position',
    new BufferAttribute(new Float32Array([0, 0, 0, 0.012, 0, 0, 0.012, stemHeight, 0, 0, stemHeight, 0, 0, stemHeight, 0, 0, 0, 0]), 3)
  );
  stem.setIndex([0, 1, 2, 0, 2, 3]);
  ensureVertexColor(stem, [0.35, 0.6, 0.3]);

  const petals = [];
  const petalCount = Math.round(rng.range(4, 7));
  for (let i = 0; i < petalCount; i++) {
    const angle = (i / petalCount) * Math.PI * 2;
    const size = rng.range(0.07, 0.13);
    const petal = new BufferGeometry();
    petal.setAttribute(
      'position',
      new BufferAttribute(
        new Float32Array([
          0, 0, 0,
          Math.cos(angle) * size, size * 0.35, Math.sin(angle) * size,
          Math.cos(angle + 0.7) * size, -size * 0.12, Math.sin(angle + 0.7) * size,
        ]),
        3
      )
    );
    petal.setAttribute('normal', new BufferAttribute(new Float32Array([0, 1, 0, 0, 1, 0, 0, 1, 0]), 3));
    petal.translate(0, stemHeight, 0);
    const tint = new Color(color);
    ensureVertexColor(petal, [tint.r * 1.3, tint.g * 1.3, tint.b * 1.3]);
    petals.push(petal);
  }
  const merged = BufferGeometryUtils.mergeGeometries([stem, ...petals].map((g) => ensureIndexed(g)), false);
  for (const part of [stem, ...petals]) part.dispose();
  addHeightAttribute(merged, { min: 0.8, max: 1 });
  merged.userData.glowing = glowing;
  merged.computeBoundingSphere();
  return merged;
}

export function buildBush(rng, { radius = 0.9, color = 0x4f8a3a } = {}) {
  const parts = [];
  const lobes = Math.round(rng.range(3, 6));
  for (let i = 0; i < lobes; i++) {
    const angle = rng.angle();
    const r = rng.range(0.1, radius);
    const size = radius * rng.range(0.5, 0.95);
    const lobe = new BufferGeometry();
    const verts = [];
    const faces = [];
    const lat = 3;
    const lon = 6;
    for (let a = 0; a <= lat; a++) {
      const v = a / lat;
      for (let b = 0; b <= lon; b++) {
        const u = b / lon;
        const theta = v * Math.PI;
        const phi = u * Math.PI * 2;
        verts.push(
          Math.sin(theta) * Math.cos(phi) * size,
          Math.cos(theta) * size * 0.62 + size * 0.55,
          Math.sin(theta) * Math.sin(phi) * size
        );
      }
    }
    for (let a = 0; a < lat; a++) {
      for (let b = 0; b < lon; b++) {
        const i0 = a * (lon + 1) + b;
        faces.push(i0, i0 + lon + 1, i0 + 1, i0 + 1, i0 + lon + 1, i0 + lon + 2);
      }
    }
    lobe.setAttribute('position', new BufferAttribute(new Float32Array(verts), 3));
    lobe.setIndex(faces);
    lobe.computeVertexNormals();
    lobe.translate(Math.cos(angle) * r, 0, Math.sin(angle) * r);
    const tint = new Color(color).offsetHSL(rng.range(-0.03, 0.03), rng.range(-0.08, 0.08), rng.range(-0.06, 0.06));
    ensureVertexColor(lobe, [tint.r * 1.2, tint.g * 1.2, tint.b * 1.2]);
    parts.push(lobe);
  }
  const merged = BufferGeometryUtils.mergeGeometries(parts.map((g) => ensureIndexed(g)), false);
  for (const part of parts) part.dispose();
  addHeightAttribute(merged, { min: 0.1, max: 0.7 });
  merged.computeBoundingSphere();
  return merged;
}

export function buildReed(rng, { height = 2.4 } = {}) {
  const parts = [];
  for (let i = 0; i < 4; i++) {
    const angle = rng.angle();
    const h = height * rng.range(0.7, 1.2);
    const blade = new BufferGeometry();
    const w = 0.05;
    blade.setAttribute(
      'position',
      new BufferAttribute(
        new Float32Array([
          -w, 0, 0,
          w, 0, 0,
          Math.cos(angle) * 0.25, h, Math.sin(angle) * 0.25,
        ]),
        3
      )
    );
    blade.setAttribute('normal', new BufferAttribute(new Float32Array([0, 1, 0, 0, 1, 0, 0, 1, 0]), 3));
    blade.translate(rng.range(-0.16, 0.16), 0, rng.range(-0.16, 0.16));
    ensureVertexColor(blade, [0.7, 0.95, 0.6]);
    parts.push(blade);
  }
  const merged = BufferGeometryUtils.mergeGeometries(parts.map((g) => ensureIndexed(g)), false);
  for (const part of parts) part.dispose();
  addHeightAttribute(merged, { min: 0.2, max: 1 });
  merged.computeBoundingSphere();
  return merged;
}

export function buildCrystal(rng, { height = 3.2 } = {}) {
  const parts = [];
  const shards = Math.round(rng.range(2, 5));
  for (let i = 0; i < shards; i++) {
    const h = height * rng.range(0.4, 1.1);
    const radius = rng.range(0.12, 0.34);
    const sides = 5;
    const geometry = new BufferGeometry();
    const verts = [];
    const faces = [];
    for (let s = 0; s < sides; s++) {
      const angle = (s / sides) * Math.PI * 2;
      verts.push(Math.cos(angle) * radius, 0, Math.sin(angle) * radius);
    }
    verts.push(0, h, 0);
    for (let s = 0; s < sides; s++) faces.push(s, (s + 1) % sides, sides);
    geometry.setAttribute('position', new BufferAttribute(new Float32Array(verts), 3));
    geometry.setIndex(faces);
    geometry.computeVertexNormals();
    geometry.translate(rng.range(-0.4, 0.4), 0, rng.range(-0.4, 0.4));
    geometry.rotateZ(rng.range(-0.22, 0.22));
    ensureVertexColor(geometry, [0.75, 0.95, 1.05]);
    parts.push(geometry);
  }
  const merged = BufferGeometryUtils.mergeGeometries(parts.map((g) => ensureIndexed(g)), false);
  for (const part of parts) part.dispose();
  addHeightAttribute(merged, { min: 0, max: 0.35 });
  merged.computeBoundingSphere();
  return merged;
}

export function buildMushroom(rng, { glowing = true } = {}) {
  const capRadius = rng.range(0.16, 0.42);
  const stemHeight = rng.range(0.14, 0.34);
  const stem = new BufferGeometry();
  {
    const verts = [];
    const faces = [];
    const sides = 6;
    for (let s = 0; s < sides; s++) {
      const angle = (s / sides) * Math.PI * 2;
      verts.push(Math.cos(angle) * 0.04, 0, Math.sin(angle) * 0.04);
    }
    for (let s = 0; s < sides; s++) {
      const angle = (s / sides) * Math.PI * 2;
      verts.push(Math.cos(angle) * 0.05, stemHeight, Math.sin(angle) * 0.05);
    }
    for (let s = 0; s < sides; s++) {
      const a = s;
      const b = (s + 1) % sides;
      faces.push(a, b, a + sides, b, b + sides, a + sides);
    }
    stem.setAttribute('position', new BufferAttribute(new Float32Array(verts), 3));
    stem.setIndex(faces);
    stem.computeVertexNormals();
    ensureVertexColor(stem, [0.85, 0.82, 0.75]);
  }
  const cap = new BufferGeometry();
  {
    const verts = [];
    const faces = [];
    const lat = 3;
    const lon = 7;
    for (let a = 0; a <= lat; a++) {
      const v = a / lat;
      const theta = (v * Math.PI) / 2;
      for (let b = 0; b <= lon; b++) {
        const u = b / lon;
        const phi = u * Math.PI * 2;
        verts.push(Math.sin(theta) * Math.cos(phi) * capRadius, Math.cos(theta) * capRadius * 0.85 + stemHeight, Math.sin(theta) * Math.sin(phi) * capRadius);
      }
    }
    for (let a = 0; a < lat; a++) {
      for (let b = 0; b < lon; b++) {
        const i0 = a * (lon + 1) + b;
        faces.push(i0, i0 + lon + 1, i0 + 1, i0 + 1, i0 + lon + 1, i0 + lon + 2);
      }
    }
    cap.setAttribute('position', new BufferAttribute(new Float32Array(verts), 3));
    cap.setIndex(faces);
    cap.computeVertexNormals();
    ensureVertexColor(cap, glowing ? [0.7, 1.05, 0.9] : [0.9, 0.6, 0.5]);
  }
  const merged = BufferGeometryUtils.mergeGeometries([ensureIndexed(stem), ensureIndexed(cap)], false);
  stem.dispose();
  cap.dispose();
  addHeightAttribute(merged, { min: 0.3, max: 1 });
  merged.computeBoundingSphere();
  return merged;
}

/* ------------------------------------------------------------------ *
 * Species table
 * ------------------------------------------------------------------ */

export const TREE_SPECIES = {
  broadleaf: {
    id: 'broadleaf',
    label: 'Lantern Broadleaf',
    height: 15,
    trunkRadius: 0.42,
    canopyRadius: 4.4,
    canopyHeight: 7,
    canopyStart: 0.42,
    canopySquash: 0.72,
    clusters: 9,
    branches: 5,
    flutes: 5,
    bark: 'bark',
    leaf: 'leaf',
    leafColor: 0x5fa348,
  },
  spire: {
    id: 'spire',
    label: 'Cliff Spire',
    height: 26,
    trunkRadius: 0.34,
    canopyRadius: 2.6,
    canopyHeight: 16,
    canopyStart: 0.24,
    canopySquash: 1.5,
    clusters: 12,
    branches: 3,
    flutes: 3,
    bark: 'bark',
    leaf: 'leaf',
    leafColor: 0x3f7f4e,
  },
  umbrella: {
    id: 'umbrella',
    label: 'Umbrella Hollow',
    height: 12,
    trunkRadius: 0.55,
    canopyRadius: 6.2,
    canopyHeight: 1.6,
    canopyStart: 0.85,
    canopySquash: 0.28,
    clusters: 8,
    branches: 4,
    flutes: 7,
    bark: 'bark',
    leaf: 'leaf',
    leafColor: 0x86b53f,
  },
  titan: {
    id: 'titan',
    label: 'Titanroot',
    height: 42,
    trunkRadius: 2.6,
    canopyRadius: 9,
    canopyHeight: 12,
    canopyStart: 0.62,
    canopySquash: 0.6,
    clusters: 14,
    branches: 7,
    flutes: 9,
    bark: 'bark',
    leaf: 'leaf',
    leafColor: 0x2f6b3a,
  },
};

/** Which species grow where. */
const BIOME_TREES = {
  meadow: ['broadleaf'],
  forest: ['broadleaf', 'spire', 'umbrella'],
  jungle: ['broadleaf', 'umbrella', 'titan'],
  wetland: ['umbrella', 'broadleaf'],
  cliff: ['spire'],
  highland: ['spire'],
  alpine: ['spire'],
  crystal: ['spire'],
  abyssRim: ['titan'],
  beach: ['umbrella'],
};

/* ------------------------------------------------------------------ *
 * The system
 * ------------------------------------------------------------------ */

const LAYER_DEFS = {
  grass: { maxInstances: 42000, castShadow: false, receiveShadow: true, alpha: false },
  bushes: { maxInstances: 4200, castShadow: true, receiveShadow: true },
  flowers: { maxInstances: 9000, castShadow: false, receiveShadow: false, emissive: true },
  mushrooms: { maxInstances: 3600, castShadow: false, receiveShadow: false, emissive: true },
  reeds: { maxInstances: 5200, castShadow: false, receiveShadow: true },
  crystals: { maxInstances: 1600, castShadow: true, receiveShadow: false, emissive: true },
  trees: { maxInstances: 3000, castShadow: true, receiveShadow: true },
};

export class FoliageSystem {
  constructor({ scene, textures, quality, field, seed = 1337 }) {
    this.scene = scene;
    this.textures = textures;
    this.quality = quality;
    this.field = field;
    this.seed = seed >>> 0;
    this.group = new Group();
    this.group.name = 'foliage';
    this.scene.add(this.group);

    this.chunkSize = quality.foliageChunkSize ?? 64;
    this.radius = clamp(quality.foliageRadiusChunks ?? 5, 1, 10);
    this.densityScale = clamp(quality.grassDensity ?? 1, 0.1, 2);
    this.treeScale = clamp(quality.treeDensity ?? 1, 0.05, 2);
    this.populatedChunks = new Map();
    this.materials = {};
    this.layers = {};
    this.windUniforms = [];
    this.lastCentre = { x: null, z: null };
    this.totalInstances = 0;

    this._buildLayers();
  }

  _surfaceMaterial(kind, { emissive = false, color = 0xffffff, alphaTest = 0, roughness = 0.9, metalness = 0 } = {}) {
    const set = this.textures.surface(kind, { seed: this.seed + kind.length * 7 });
    const material = new MeshStandardMaterial({
      map: set.map,
      normalMap: set.normalMap,
      roughnessMap: set.roughnessMap,
      vertexColors: true,
      side: DoubleSide,
      roughness,
      metalness,
      color,
      transparent: alphaTest > 0,
      alphaTest,
      emissive: emissive ? new Color(0x2a3f2a) : new Color(0x000000),
      emissiveIntensity: emissive ? 0.6 : 0,
      envMapIntensity: 0.4,
      dithering: true,
    });
    const uniforms = patchFoliageMaterial(material, {
      windStrength: kind === 'bark' ? 0.06 : 0.22,
      sway: kind === 'bark' ? 0.4 : 1,
      fadeDistance: this.quality.foliageFadeDistance ?? 260,
    });
    this.windUniforms.push(uniforms);
    return { material, uniforms };
  }

  _buildLayers() {
    // ---- grass ----
    const grassMaterial = this._surfaceMaterial('grass', { color: 0x9fd07a, roughness: 0.95 });
    this.layers.grass = this._makeLayer('grass', buildGrassTuft(new Rng(this.seed ^ 0x61), { blades: 6, height: 1.0 }), grassMaterial, {
      maxInstances: LAYER_DEFS.grass.maxInstances,
      castShadow: false,
    });

    // ---- flowers (emissive, they glow at dusk) ----
    const flowerMaterial = this._surfaceMaterial('leaf', { color: 0xffe3a0, emissive: true, roughness: 0.7 });
    flowerMaterial.material.emissive = new Color(0x6b5a20);
    flowerMaterial.material.emissiveIntensity = 0.9;
    this.layers.flowers = this._makeLayer('flowers', buildFlower(new Rng(this.seed ^ 0x77), { color: 0xffd166 }), flowerMaterial, {
      maxInstances: LAYER_DEFS.flowers.maxInstances,
      castShadow: false,
    });

    // ---- bushes ----
    const bushMaterial = this._surfaceMaterial('leaf', { color: 0x5c9440, roughness: 0.85 });
    this.layers.bushes = this._makeLayer('bushes', buildBush(new Rng(this.seed ^ 0x83), { radius: 1.0 }), bushMaterial, {
      maxInstances: LAYER_DEFS.bushes.maxInstances,
      castShadow: true,
    });

    // ---- mushrooms ----
    const mushroomMaterial = this._surfaceMaterial('soil', { color: 0xa8e0c8, emissive: true, roughness: 0.6 });
    mushroomMaterial.material.emissive = new Color(0x1f4a3f);
    mushroomMaterial.material.emissiveIntensity = 1.4;
    this.layers.mushrooms = this._makeLayer('mushrooms', buildMushroom(new Rng(this.seed ^ 0x91)), mushroomMaterial, {
      maxInstances: LAYER_DEFS.mushrooms.maxInstances,
      castShadow: false,
    });

    // ---- reeds ----
    const reedMaterial = this._surfaceMaterial('grass', { color: 0x8fbf6a, roughness: 0.9 });
    this.layers.reeds = this._makeLayer('reeds', buildReed(new Rng(this.seed ^ 0xa5), { height: 2.6 }), reedMaterial, {
      maxInstances: LAYER_DEFS.reeds.maxInstances,
      castShadow: false,
    });

    // ---- crystals ----
    const crystalMaterial = this._surfaceMaterial('crystal', { color: 0xbfeaff, emissive: true, roughness: 0.25, metalness: 0.1 });
    crystalMaterial.material.emissive = new Color(0x2b6a8a);
    crystalMaterial.material.emissiveIntensity = 1.1;
    this.layers.crystals = this._makeLayer('crystals', buildCrystal(new Rng(this.seed ^ 0xb3), { height: 3.4 }), crystalMaterial, {
      maxInstances: LAYER_DEFS.crystals.maxInstances,
      castShadow: true,
    });

    // ---- trees: one InstancedMesh pair per species ----
    this.treeLayers = {};
    const treeRng = new Rng(this.seed ^ 0xc7);
    for (const [id, species] of Object.entries(TREE_SPECIES)) {
      for (const lod of [0, 1]) {
        const tree = buildTree(species, treeRng.fork(lod * 31 + species.label.length), { lod });
        const bark = this._surfaceMaterial(species.bark, { color: 0x9c8a72 });
        const leaf = this._surfaceMaterial(species.leaf, {
          color: species.leafColor,
          emissive: id === 'titan',
          roughness: 0.75,
        });
        if (lod === 0) {
          this.treeLayers[id] = {
            species,
            trunk: this._makeLayer(`tree-${id}-trunk`, tree.trunk, bark, { maxInstances: 480, castShadow: true }),
            canopy: this._makeLayer(`tree-${id}-canopy`, tree.canopy, leaf, { maxInstances: 480, castShadow: true }),
            geometry: tree,
            lod: [],
          };
        } else {
          this.treeLayers[id].lod.push({
            trunk: this._makeLayer(`tree-${id}-trunk-lod1`, tree.trunk, bark, { maxInstances: 700, castShadow: false }),
            canopy: this._makeLayer(`tree-${id}-canopy-lod1`, tree.canopy, leaf, { maxInstances: 700, castShadow: false }),
          });
        }
      }
    }
  }

  _makeLayer(name, geometry, materialPair, { maxInstances = 1000, castShadow = false } = {}) {
    if (!geometry) return null;
    const mesh = new InstancedMesh(geometry, materialPair.material, maxInstances);
    mesh.name = `foliage-${name}`;
    mesh.instanceMatrix.setUsage(35048); // THREE.DynamicDrawUsage
    mesh.castShadow = castShadow;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    mesh.count = 0;
    this.group.add(mesh);
    const color = new Color();
    mesh.instanceColor = null;
    void color;
    return {
      name,
      mesh,
      geometry,
      material: materialPair.material,
      uniforms: materialPair.uniforms,
      maxInstances,
      count: 0,
      cursor: 0,
    };
  }

  /* ---------------------------------------------------------------- *
   * Population
   * ---------------------------------------------------------------- */

  update(playerPosition, dt = 0, { time = 0, windStrength = 0.3, windX = 1, windZ = 0.3 } = {}) {
    const cx = Math.floor(playerPosition.x / this.chunkSize);
    const cz = Math.floor(playerPosition.z / this.chunkSize);
    const moved = cx !== this.lastCentre.x || cz !== this.lastCentre.z;
    if (moved) {
      this.lastCentre = { x: cx, z: cz };
      this.repopulate(cx, cz, playerPosition);
    }
    for (const uniforms of this.windUniforms) {
      uniforms.uTime.value = time;
      uniforms.uGustStrength.value = windStrength * 0.9;
      uniforms.uWindDir.value.set(windX, windZ).normalize();
    }
    void dt;
  }

  repopulate(centreX, centreZ, playerPosition) {
    // Reset every layer's cursor; we refill deterministically per chunk.
    const layerCursors = new Map();
    for (const [key, layer] of Object.entries(this.layers)) {
      if (!layer) continue;
      layerCursors.set(key, 0);
      layer.count = 0;
    }
    for (const [id, tree] of Object.entries(this.treeLayers)) {
      tree.trunk.count = 0;
      tree.canopy.count = 0;
      layerCursors.set(`${id}-trunk`, 0);
      layerCursors.set(`${id}-canopy`, 0);
      for (const lod of tree.lod) {
        lod.trunk.count = 0;
        lod.canopy.count = 0;
      }
    }

    this.populatedChunks.clear();
    const matrix = new Matrix4();
    const position = new Vector3();
    const quaternion = new Quaternion();
    const scale = new Vector3();
    const euler = new Euler();
    const tilt = new Quaternion();
    const tint = new Color();

    for (let dz = -this.radius; dz <= this.radius; dz++) {
      for (let dx = -this.radius; dx <= this.radius; dx++) {
        const chunkX = centreX + dx;
        const chunkZ = centreZ + dz;
        const rng = new Rng(hash2(chunkX, chunkZ) ^ this.seed);
        const originX = chunkX * this.chunkSize;
        const originZ = chunkZ * this.chunkSize;
        const distance = Math.hypot(dx, dz) * this.chunkSize;

        // Sample the chunk's biome at its centre to bias density.
        const centreBiome = this.field.biomeAt(originX + this.chunkSize * 0.5, originZ + this.chunkSize * 0.5);

        // ---- trees ----
        const treeChance = (centreBiome.biome.treeDensity ?? 0.5) * this.treeScale;
        const treeCount = Math.round(treeChance * lerp(26, 8, clamp01(distance / (this.radius * this.chunkSize))));
        for (let t = 0; t < treeCount; t++) {
          const px = originX + rng.float() * this.chunkSize;
          const pz = originZ + rng.float() * this.chunkSize;
          if (this.field.isWater(px, pz)) continue;
          const slope = this.field.slopeAt(px, pz);
          if (slope > 0.62) continue;
          const height = this.field.heightAt(px, pz);
          if (height > 330) continue;
          const speciesIds = BIOME_TREES[centreBiome.biome.id] || ['broadleaf'];
          const speciesId = rng.pick(speciesIds);
          const tree = this.treeLayers[speciesId];
          if (!tree) continue;
          const useLod = distance > this.chunkSize * 2.5 ? 1 : 0;
          const layer = useLod && tree.lod[0] ? tree.lod[0].trunk : tree.trunk;
          const canopyLayer = useLod && tree.lod[0] ? tree.lod[0].canopy : tree.canopy;
          if (!layer || layer.count >= layer.maxInstances) continue;
          if (!canopyLayer || canopyLayer.count >= canopyLayer.maxInstances) continue;

          const s = rng.range(0.7, 1.35);
          position.set(px, height - 0.35, pz);
          euler.set(rng.range(-0.05, 0.05), rng.angle(), rng.range(-0.05, 0.05));
          quaternion.setFromEuler(euler);
          scale.set(s, s * rng.range(0.9, 1.15), s);
          matrix.compose(position, quaternion, scale);
          layer.mesh.setMatrixAt(layer.count, matrix);
          canopyLayer.mesh.setMatrixAt(canopyLayer.count, matrix);
          const hueShift = rng.range(-0.04, 0.04);
          tint.setHSL(0.28 + hueShift, rng.range(0.35, 0.6), rng.range(0.42, 0.6));
          layer.mesh.setColorAt(layer.count, tint);
          canopyLayer.mesh.setColorAt(canopyLayer.count, tint);
          layer.count++;
          canopyLayer.count++;
        }

        // ---- undergrowth ----
        const scatter = (layerKey, perChunk, options) => {
          const layer = this.layers[layerKey];
          if (!layer) return;
          const count = Math.round(perChunk * this.densityScale * options.densityScale);
          for (let i = 0; i < count; i++) {
            const px = originX + rng.float() * this.chunkSize;
            const pz = originZ + rng.float() * this.chunkSize;
            const height = this.field.heightAt(px, pz);
            if (!options.accept({ x: px, z: pz, height, slope: this.field.slopeAt(px, pz), biome: centreBiome.biome })) continue;
            if (layer.count >= layer.maxInstances) continue;
            const s = options.scale(rng);
            position.set(px, height - 0.08, pz);
            euler.set(0, rng.angle(), 0);
            quaternion.setFromEuler(euler);
            scale.set(s, s * rng.range(0.85, 1.25), s);
            matrix.compose(position, quaternion, scale);
            layer.mesh.setMatrixAt(layer.count, matrix);
            options.tint(rng, tint);
            layer.mesh.setColorAt(layer.count, tint);
            layer.count++;
          }
        };

        // grass: dense, everywhere flat-ish and green
        scatter('grass', 900, {
          densityScale: centreBiome.biome.grassDensity ?? 1,
          accept: ({ height, slope }) => height > 1.2 && slope < 0.55,
          scale: (r) => r.range(0.7, 1.6),
          tint: (r, c) => c.setHSL(0.26 + r.range(-0.03, 0.03), r.range(0.35, 0.7), r.range(0.32, 0.55)),
        });
        // flowers
        scatter('flowers', 90, {
          densityScale: (centreBiome.biome.grassDensity ?? 1) * 0.8,
          accept: ({ height, slope }) => height > 2 && slope < 0.4,
          scale: (r) => r.range(0.8, 1.9),
          tint: (r, c) => c.setHSL(r.pick([0.09, 0.13, 0.75, 0.62]), r.range(0.5, 0.9), r.range(0.55, 0.75)),
        });
        // bushes on slopes and forest floors
        scatter('bushes', 26, {
          densityScale: 0.4 + (centreBiome.biome.treeDensity ?? 0.5),
          accept: ({ height, slope }) => height > 2.5 && slope < 0.7,
          scale: (r) => r.range(0.6, 1.5),
          tint: (r, c) => c.setHSL(0.3 + r.range(-0.05, 0.05), r.range(0.3, 0.6), r.range(0.3, 0.5)),
        });
        // mushrooms love dark, damp, forested ground
        scatter('mushrooms', 34, {
          densityScale: centreBiome.biome.id === 'forest' || centreBiome.biome.id === 'jungle' ? 1.2 : 0.35,
          accept: ({ height, slope, biome }) => height > 2 && slope < 0.5 && biome.id !== 'alpine',
          scale: (r) => r.range(0.6, 1.8),
          tint: (r, c) => c.setHSL(r.range(0.35, 0.5), r.range(0.3, 0.7), r.range(0.5, 0.7)),
        });
        // reeds hug the shoreline
        scatter('reeds', 40, {
          densityScale: 1,
          accept: ({ height, slope }) => height > 0.4 && height < 3.2 && slope < 0.35,
          scale: (r) => r.range(0.7, 1.5),
          tint: (r, c) => c.setHSL(0.22 + r.range(-0.04, 0.04), r.range(0.4, 0.7), r.range(0.35, 0.55)),
        });
        // crystals on dry, high, sunny flats
        scatter('crystals', 20, {
          densityScale: centreBiome.biome.id === 'crystal' ? 1.6 : 0.35,
          accept: ({ height, slope, biome }) => slope < 0.5 && (biome.id === 'crystal' || height > 140),
          scale: (r) => r.range(0.5, 1.8),
          tint: (r, c) => c.setHSL(r.range(0.48, 0.58), r.range(0.4, 0.8), r.range(0.6, 0.85)),
        });

        this.populatedChunks.set(`${chunkX},${chunkZ}`, originX);
      }
    }

    // Commit: flag attribute uploads and set instance counts.
    let total = 0;
    for (const layer of Object.values(this.layers)) {
      if (!layer) continue;
      layer.mesh.count = layer.count;
      layer.mesh.instanceMatrix.needsUpdate = true;
      if (layer.mesh.instanceColor) layer.mesh.instanceColor.needsUpdate = true;
      layer.mesh.computeBoundingSphere?.();
      total += layer.count;
    }
    for (const tree of Object.values(this.treeLayers)) {
      for (const layer of [tree.trunk, tree.canopy, ...tree.lod.flatMap((l) => [l.trunk, l.canopy])]) {
        if (!layer) continue;
        layer.mesh.count = layer.count;
        layer.mesh.instanceMatrix.needsUpdate = true;
        if (layer.mesh.instanceColor) layer.mesh.instanceColor.needsUpdate = true;
        total += layer.count;
      }
    }
    this.totalInstances = total;
    void playerPosition;
    void layerCursors;
    return total;
  }

  /** Plants within `radius` of a point — used by the discovery system. */
  queryNearbyVegetation(position, radius = 6) {
    const hits = [];
    const chunkX = Math.floor(position.x / this.chunkSize);
    const chunkZ = Math.floor(position.z / this.chunkSize);
    if (!this.populatedChunks.has(`${chunkX},${chunkZ}`)) return hits;
    // Cheap: report the biome and its dominant species instead of every plant.
    const info = this.field.biomeAt(position.x, position.z);
    hits.push({ biome: info.biome, density: info.biome.grassDensity });
    void radius;
    return hits;
  }

  dispose() {
    for (const layer of [...Object.values(this.layers), ...Object.values(this.treeLayers).flatMap((t) => [t.trunk, t.canopy, ...t.lod.flatMap((l) => [l.trunk, l.canopy])])]) {
      if (!layer) continue;
      this.group.remove(layer.mesh);
      layer.geometry.dispose();
      layer.material.dispose();
      layer.mesh.dispose?.();
    }
    this.scene.remove(this.group);
  }
}
