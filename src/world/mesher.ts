// Chunk mesh builder. Produces a single merged mesh per chunk with per-face
// texture coordinates sampled from the block atlas. Uses greedy-ish quads: we
// group contiguous solid faces in rows where texture matches to reduce triangle
// count, but we keep implementation simple enough to be fast on worker/main.

import { Mesh, VertexData, Scene, StandardMaterial, Texture, Color3, Vector4, MeshBuilder } from "@babylonjs/core";
import { BLOCKS, BlockId, BlockDef, getFaceTex } from "../blocks/blocks";
import { ChunkData, CHUNK_SIZE, CHUNK_HEIGHT, chunkIndex, getBlock } from "./chunk";
import { tileUV } from "../blocks/textureGen";
import { WorldManager } from "./worldManager";

// Face directions: 0:+X 1:-X 2:+Y 3:-Y 4:+Z 5:-Z
// For each face we give the tangent basis vectors, outward normal, and which texture face to use.
interface FaceInfo {
  // given local coords (x,y,z) of the block, these produce the 4 corner positions
  corners: (x:number,y:number,z:number) => [number,number,number][];
  normal: [number,number,number];
  faceKind: "top"|"bottom"|"side";
}

const FACES: FaceInfo[] = [
  { // +X (east)
    corners: (x,y,z) => [[x+1,y,z],[x+1,y,z+1],[x+1,y+1,z+1],[x+1,y+1,z]],
    normal: [1,0,0], faceKind: "side",
  },
  { // -X (west)
    corners: (x,y,z) => [[x,y,z+1],[x,y,z],[x,y+1,z],[x,y+1,z+1]],
    normal: [-1,0,0], faceKind: "side",
  },
  { // +Y (top)
    corners: (x,y,z) => [[x,y+1,z],[x,y+1,z+1],[x+1,y+1,z+1],[x+1,y+1,z]],
    normal: [0,1,0], faceKind: "top",
  },
  { // -Y (bottom)
    corners: (x,y,z) => [[x,y,z+1],[x,y,z],[x+1,y,z],[x+1,y,z+1]],
    normal: [0,-1,0], faceKind: "bottom",
  },
  { // +Z (south)
    corners: (x,y,z) => [[x+1,y,z+1],[x,y,z+1],[x,y+1,z+1],[x+1,y+1,z+1]],
    normal: [0,0,1], faceKind: "side",
  },
  { // -Z (north)
    corners: (x,y,z) => [[x,y,z],[x+1,y,z],[x+1,y+1,z],[x,y+1,z]],
    normal: [0,0,-1], faceKind: "side",
  },
];

export interface BuiltMesh {
  positions: number[];
  normals: number[];
  indices: number[];
  uvs: number[];
  colors: number[];
  // Water mesh (transparent)
  waterPositions: number[];
  waterNormals: number[];
  waterIndices: number[];
  waterUVs: number[];
  waterColors: number[];
}

export function buildChunkMesh(chunk: ChunkData, world: WorldManager): BuiltMesh {
  const out: BuiltMesh = {
    positions: [], normals: [], indices: [], uvs: [], colors: [],
    waterPositions: [], waterNormals: [], waterIndices: [], waterUVs: [], waterColors: [],
  };

  for (let f = 0; f < 6; f++) {
    const face = FACES[f];
    // Build axis/axis-order slices for greedy merging
    // We'll iterate along the axis perpendicular to the face and merge quads along the two tangents.
    // For simplicity, start with a naive per-face quad generator. Performance is acceptable for render distance 8-12.
    if (Math.abs(face.normal[0]) === 1) {
      // X faces: slices in y,z.
      for (let y = 0; y < CHUNK_HEIGHT; y++) {
        for (let z = 0; z < CHUNK_SIZE; z++) {
          for (let x = 0; x < CHUNK_SIZE; x++) {
            const b = getBlock(chunk, x, y, z);
            if (b === BlockId.Air) continue;
            const def = BLOCKS[b];
            if (!def) continue;
            const nx = x + face.normal[0];
            // neighbor block (may be cross-chunk)
            const neighbor = world.getBlockWorld(chunk.cx*CHUNK_SIZE+nx, y, chunk.cz*CHUNK_SIZE+z, chunk.dim);
            const nDef = neighbor ? BLOCKS[neighbor] : undefined;
            const faceThis = shouldRenderFace(def, b);
            const faceNeighbor = neighbor === BlockId.Air || !nDef || (def.transparent && neighbor !== b && !nDef.opaque) || (def.opaque && nDef.transparent);
            if (!faceThis || !faceNeighbor) continue;
            addQuad(out, def, b, face, x, y, z, chunk);
          }
        }
      }
    } else if (Math.abs(face.normal[1]) === 1) {
      for (let x = 0; x < CHUNK_SIZE; x++) {
        for (let z = 0; z < CHUNK_SIZE; z++) {
          for (let y = 0; y < CHUNK_HEIGHT; y++) {
            const b = getBlock(chunk, x, y, z);
            if (b === BlockId.Air) continue;
            const def = BLOCKS[b];
            if (!def) continue;
            const ny = y + face.normal[1];
            const neighbor = world.getBlockWorld(chunk.cx*CHUNK_SIZE+x, ny, chunk.cz*CHUNK_SIZE+z, chunk.dim);
            const nDef = neighbor ? BLOCKS[neighbor] : undefined;
            const faceThis = shouldRenderFace(def, b);
            const faceNeighbor = neighbor === BlockId.Air || !nDef || (def.transparent && neighbor !== b && !nDef.opaque) || (def.opaque && nDef.transparent);
            if (!faceThis || !faceNeighbor) continue;
            addQuad(out, def, b, face, x, y, z, chunk);
          }
        }
      }
    } else {
      for (let x = 0; x < CHUNK_SIZE; x++) {
        for (let y = 0; y < CHUNK_HEIGHT; y++) {
          for (let z = 0; z < CHUNK_SIZE; z++) {
            const b = getBlock(chunk, x, y, z);
            if (b === BlockId.Air) continue;
            const def = BLOCKS[b];
            if (!def) continue;
            const nz = z + face.normal[2];
            const neighbor = world.getBlockWorld(chunk.cx*CHUNK_SIZE+x, y, chunk.cz*CHUNK_SIZE+nz, chunk.dim);
            const nDef = neighbor ? BLOCKS[neighbor] : undefined;
            const faceThis = shouldRenderFace(def, b);
            const faceNeighbor = neighbor === BlockId.Air || !nDef || (def.transparent && neighbor !== b && !nDef.opaque) || (def.opaque && nDef.transparent);
            if (!faceThis || !faceNeighbor) continue;
            addQuad(out, def, b, face, x, y, z, chunk);
          }
        }
      }
    }
  }
  return out;
}

function shouldRenderFace(def: BlockDef, b: BlockId): boolean {
  // Water/lava handled separately; still render faces but in separate buffer
  return true;
}

function addQuad(out: BuiltMesh, def: BlockDef, b: BlockId, face: FaceInfo, x:number,y:number,z:number, chunk: ChunkData) {
  const corners = face.corners(x, y, z);
  const tileIdx = getFaceTex(def, face.faceKind);
  const [tu0,tv0,tu1,tv1] = tileUV(tileIdx);
  const isWater = b === BlockId.Water;
  // Water uses a dedicated single-tile repeating texture so we can animate waves.
  const [u0,v0,u1,v1] = isWater ? [0,0,1,1] : [tu0,tv0,tu1,tv1];
  const isLava = b === BlockId.Lava;
  const isTransparent = def.transparent;

  const target = isWater ? out : out;
  const positions = isWater ? out.waterPositions : out.positions;
  const normals = isWater ? out.waterNormals : out.normals;
  const indices = isWater ? out.waterIndices : out.indices;
  const uvs = isWater ? out.waterUVs : out.uvs;
  const colors = isWater ? out.waterColors : out.colors;

  const baseIdx = positions.length / 3;
  // apply tint for grass top, water etc.
  let r=1,g=1,b2=1;
  if (b === BlockId.Grass && face.faceKind !== "top") {
    // side: keep grass tint on top half? texture already colored.
  }
  if (def.color) { r=def.color[0]; g=def.color[1]; b2=def.color[2]; }
  if (b === BlockId.Grass && face.faceKind === "top") { r=0.55; g=0.85; b2=0.45; }
  if (b === BlockId.Leaves) { r=0.55; g=0.95; b2=0.5; }

  // ambient occlusion: bake simple per-vertex shading based on face direction
  let shade = 1.0;
  if (face.faceKind === "top") shade = 1.0;
  else if (face.faceKind === "bottom") shade = 0.55;
  else if (face.normal[0] !== 0) shade = 0.78;
  else shade = 0.9;
  // inside chunk corner AO (very rough: add nDotL from sun)
  r *= shade; g *= shade; b2 *= shade;

  // emissive boost
  if (def.emissive > 0) {
    const e = 0.5 + def.emissive * 0.7;
    r = Math.min(1, r*e + def.emissive*0.2);
    g = Math.min(1, g*e + def.emissive*0.15);
    b2 = Math.min(1, b2*e);
  }

  // 4 vertices
  const order = [0,1,2,0,2,3]; // two triangles
  for (const c of corners) {
    positions.push(c[0], c[1], c[2]);
    normals.push(face.normal[0], face.normal[1], face.normal[2]);
    colors.push(r, g, b2, 1);
  }
  // UVs
  uvs.push(u0, v1,  u1, v1,  u1, v0,  u0, v0);
  for (const i of order) indices.push(baseIdx + i);
  void target;
}

export function applyBuiltMesh(scene: Scene, mesh: Mesh, built: BuiltMesh, material: StandardMaterial) {
  const vd = new VertexData();
  vd.positions = built.positions;
  vd.normals = built.normals;
  vd.indices = built.indices;
  vd.uvs = built.uvs;
  vd.colors = built.colors;
  vd.applyToMesh(mesh, true);
  mesh.material = material;
  mesh.isVisible = built.positions.length > 0;
  mesh.refreshBoundingInfo();
}
export function applyWaterMesh(scene: Scene, mesh: Mesh, built: BuiltMesh, material: StandardMaterial) {
  const vd = new VertexData();
  vd.positions = built.waterPositions;
  vd.normals = built.waterNormals;
  vd.indices = built.waterIndices;
  vd.uvs = built.waterUVs;
  vd.colors = built.waterColors;
  vd.applyToMesh(mesh, true);
  mesh.material = material;
  mesh.isVisible = built.waterPositions.length > 0;
  mesh.refreshBoundingInfo();
}
