/* Exporters: GLB, OBJ, scene JSON, PNG snapshot, and a Fabric-style
   Minecraft resource/data pack zip built from the placed scene.            */
import * as THREE from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { blockById, type Placed } from "./core";
import { tex } from "./textures";

function download(blob: Blob, name: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

/* Build a plain THREE.Group of box meshes from placed items (for export). */
export function buildExportGroup(items: Placed[]): THREE.Group {
  const g = new THREE.Group();
  const box = new THREE.BoxGeometry(1, 1, 1);
  items.forEach((it) => {
    if (it.kind !== "block" && it.kind !== "prop") return;
    const def = blockById(it.id);
    const mats: THREE.Material[] = [];
    const mk = (name?: string) => {
      if (!name) return new THREE.MeshStandardMaterial({ color: "#888888" });
      const t = tex(name);
      const m = new THREE.MeshStandardMaterial({ map: t, roughness: 0.9 });
      if (def?.emissive) {
        m.emissive = new THREE.Color(def.glowColor || "#fff");
        m.emissiveMap = t;
        m.emissiveIntensity = def.emissive;
      }
      return m;
    };
    if (def?.model === "cross") {
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mk(def.all));
      (mesh.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
      const m2 = mesh.clone(); m2.rotation.y = Math.PI / 2;
      const grp = new THREE.Group(); grp.add(mesh, m2);
      applyXf(grp, it); g.add(grp); return;
    }
    const side = mk(def?.side || def?.all);
    const top = mk(def?.top || def?.side || def?.all);
    const bottom = mk(def?.bottom || def?.side || def?.all);
    mats.push(side, side, top, bottom, side, side);
    const mesh = new THREE.Mesh(box, mats);
    applyXf(mesh, it);
    g.add(mesh);
  });
  return g;
}
function applyXf(o: THREE.Object3D, it: Placed) {
  o.position.set(...it.pos);
  o.rotation.set(...it.rot);
  o.scale.set(...it.scale);
}

export function exportGLB(items: Placed[], name = "sift-scene.glb") {
  const g = buildExportGroup(items);
  const ex = new GLTFExporter();
  ex.parse(g, (res) => {
    const blob = res instanceof ArrayBuffer ? new Blob([res], { type: "model/gltf-binary" }) : new Blob([JSON.stringify(res)], { type: "model/gltf+json" });
    download(blob, name);
  }, (e) => console.error(e), { binary: true });
}

export function exportOBJ(items: Placed[], name = "sift-scene.obj") {
  let out = "# Sift Forge OBJ export\n";
  let vo = 1;
  const corners = [
    [-0.5, -0.5, -0.5], [0.5, -0.5, -0.5], [0.5, 0.5, -0.5], [-0.5, 0.5, -0.5],
    [-0.5, -0.5, 0.5], [0.5, -0.5, 0.5], [0.5, 0.5, 0.5], [-0.5, 0.5, 0.5],
  ];
  const faces = [[1, 2, 3, 4], [5, 8, 7, 6], [1, 5, 6, 2], [2, 6, 7, 3], [3, 7, 8, 4], [4, 8, 5, 1]];
  items.forEach((it) => {
    if (it.kind !== "block") return;
    out += `o ${it.id}_${it.uid}\n`;
    const e = new THREE.Euler(...it.rot);
    const q = new THREE.Quaternion().setFromEuler(e);
    const v = new THREE.Vector3();
    corners.forEach((c) => {
      v.set(c[0], c[1], c[2]).multiply(new THREE.Vector3(...it.scale)).applyQuaternion(q).add(new THREE.Vector3(...it.pos));
      out += `v ${v.x.toFixed(4)} ${v.y.toFixed(4)} ${v.z.toFixed(4)}\n`;
    });
    faces.forEach((f) => { out += `f ${f.map((i) => i + vo - 1).join(" ")}\n`; });
    vo += 8;
  });
  download(new Blob([out], { type: "text/plain" }), name);
}

export function exportSceneJSON(items: Placed[], name = "sift-scene.json") {
  download(new Blob([JSON.stringify({ engine: "sift-forge", version: 1, items }, null, 2)], { type: "application/json" }), name);
}

/* ── minimal ZIP writer (store) ── */
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(data: Uint8Array) {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
export function makeZip(files: { name: string; data: Uint8Array }[]): Blob {
  const enc = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  const u16 = (n: number) => new Uint8Array([n & 255, (n >> 8) & 255]);
  const u32 = (n: number) => new Uint8Array([n & 255, (n >> 8) & 255, (n >> 16) & 255, (n >>> 24) & 255]);
  files.forEach((f) => {
    const nameB = enc.encode(f.name);
    const crc = crc32(f.data);
    const head = [u32(0x04034b50), u16(20), u16(0), u16(0), u16(0), u16(0), u32(crc), u32(f.data.length), u32(f.data.length), u16(nameB.length), u16(0)];
    const headB = concat(head);
    chunks.push(headB, nameB, f.data);
    central.push(concat([u32(0x02014b50), u16(20), u16(20), u16(0), u16(0), u16(0), u16(0), u32(crc), u32(f.data.length), u32(f.data.length), u16(nameB.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset)]), nameB);
    offset += headB.length + nameB.length + f.data.length;
  });
  const centralB = concat(central);
  const end = concat([u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length), u32(centralB.length), u32(offset), u16(0)]);
  return new Blob([...chunks, centralB, end] as BlobPart[], { type: "application/zip" });
}
function concat(arrs: Uint8Array[]) {
  const len = arrs.reduce((a, b) => a + b.length, 0);
  const out = new Uint8Array(len);
  let o = 0;
  arrs.forEach((a) => { out.set(a, o); o += a.length; });
  return out;
}

const enc = () => new TextEncoder();

/* Minecraft pack: resource assets + data + fabric.mod.json for the blocks/mobs used */
export async function exportMinecraftPack(items: Placed[], packName = "sift-forge-scene") {
  const files: { name: string; data: Uint8Array }[] = [];
  const usedBlocks = [...new Set(items.filter((i) => i.kind === "block").map((i) => i.id))];
  const usedMobs = [...new Set(items.filter((i) => i.kind === "mob").map((i) => i.id))];

  files.push({ name: "pack.mcmeta", data: enc().encode(JSON.stringify({ pack: { pack_format: 46, description: `Exported from Sift Forge — ${packName}` } }, null, 2)) });
  files.push({
    name: "fabric.mod.json",
    data: enc().encode(JSON.stringify({
      schemaVersion: 1, id: packName.toLowerCase().replace(/[^a-z0-9-]+/g, "_"), version: "1.0.0",
      name: packName, description: "Scene exported from the Sift Forge editor (original Sift dimension assets).",
      license: "CC-BY-4.0", environment: "*", depends: { fabricloader: ">=0.16.0", minecraft: ">=1.21.4" },
    }, null, 2)),
  });

  for (const id of usedBlocks) {
    const def = blockById(id);
    if (!def) continue;
    files.push({
      name: `assets/entersift/blockstates/${id}.json`,
      data: enc().encode(JSON.stringify({ variants: { "": { model: `entersift:block/${id}` } } }, null, 2)),
    });
    files.push({
      name: `assets/entersift/models/block/${id}.json`,
      data: enc().encode(JSON.stringify(
        def.model === "cross"
          ? { parent: "minecraft:block/cross", textures: { cross: `entersift:block/${def.all}` } }
          : { parent: "minecraft:block/cube_all", textures: { all: `entersift:block/${def.all}` } },
        null, 2)),
    });
    try {
      const res = await fetch(`/sift/textures/block/${def.all}.png`);
      if (res.ok) files.push({ name: `assets/entersift/textures/block/${def.all}.png`, data: new Uint8Array(await res.arrayBuffer()) });
    } catch { /* texture optional */ }
  }
  /* summon commands for mobs & rifts, runnable in-game */
  const mc = items.map((it) => {
    const [x, y, z] = it.pos.map((v) => v.toFixed(1));
    if (it.kind === "mob") return `summon minecraft:armor_stand ${x} ${y} ${z} {CustomName:'"${it.id}"',NoGravity:1b,Marker:1b}`;
    if (it.kind === "rift") return `summon minecraft:area_effect_cloud ${x} ${y} ${z} {CustomName:'"rift:${it.id}"',Duration:2147483647}`;
    return `# block ${it.id} @ ${x} ${y} ${z}`;
  }).join("\n");
  files.push({ name: `data/entersift/function/scene.mcfunction`, data: enc().encode(`# ${packName} — placed scene\n${mc}\n`) });
  files.push({ name: "README.txt", data: enc().encode(
`SIFT FORGE — MINECRAFT EXPORT
Scene: ${packName}
Blocks used: ${usedBlocks.length}  Mobs referenced: ${usedMobs.length}

Contents:
- assets/entersift/**  blockstates, models and PNG textures (original Sift assets)
- data/entersift/function/scene.mcfunction  summon/setblock script of your scene
- fabric.mod.json  mod manifest (Fabric loader, Minecraft 1.21.4+ / 26.x)

Drop this zip's folders into a Fabric mod workspace or resource pack folder.
`) });

  download(makeZip(files), `${packName}.zip`);
}

export function exportPNG(canvas: HTMLCanvasElement, name = "sift-snapshot.png") {
  canvas.toBlob((b) => b && download(b, name), "image/png");
}
