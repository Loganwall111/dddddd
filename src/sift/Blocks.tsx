/* Renders repo blocks as voxel meshes: textured cubes, cross flora, liquids. */
import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { blockById, type BlockDef } from "./core";
import { tex, markAnimated } from "./textures";

const MAT_CACHE = new Map<string, THREE.Material[]>();
function cubeMats(def: BlockDef, emissiveMul = 1): THREE.Material[] {
  const key = `${def.id}#${emissiveMul}`;
  const hit = MAT_CACHE.get(key);
  if (hit) return hit;
  const mk = (name: string) => {
    const t = tex(name);
    const m = new THREE.MeshStandardMaterial({ map: t, roughness: 0.9, metalness: 0 });
    if (def.emissive) {
      m.emissive = new THREE.Color(def.glowColor || "#ffffff");
      m.emissiveMap = t;
      m.emissiveIntensity = def.emissive * emissiveMul;
    }
    return m;
  };
  const side = mk(def.side || def.all!);
  const top = def.top ? mk(def.top) : side;
  const bottom = def.bottom ? mk(def.bottom) : side;
  const out = [side, side, top, bottom, side, side];
  MAT_CACHE.set(key, out);
  return out;
}

export function BlockMesh({ id, emissiveMul = 1, animate = true, transparent = false }: {
  id: string; emissiveMul?: number; animate?: boolean; transparent?: boolean;
}) {
  const def = blockById(id);
  const ref = useRef<THREE.Group>(null);

  const geom = useMemo(() => new THREE.BoxGeometry(1, 1, 1), []);
  const crossGeom = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const p1 = new THREE.PlaneGeometry(1, 1);
    const p2 = new THREE.PlaneGeometry(1, 1);
    p2.rotateY(Math.PI / 2);
    const m1 = new THREE.Matrix4().makeRotationY(Math.PI / 4);
    p1.applyMatrix4(m1);
    p2.applyMatrix4(m1);
    const merged = mergeGeoms([p1, p2]);
    return merged;
  }, []);

  const mats = useMemo(() => {
    if (!def) return [new THREE.MeshStandardMaterial({ color: "#f0f" })];
    if (def.model === "cross") {
      const t = tex(def.all!);
      const m = new THREE.MeshStandardMaterial({
        map: t, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.9,
      });
      if (def.emissive) {
        m.emissive = new THREE.Color(def.glowColor || "#fff");
        m.emissiveMap = t;
        m.emissiveIntensity = def.emissive;
      }
      return [m];
    }
    if (def.model === "liquid") {
      const t = tex(def.all!);
      if (animate) markAnimated(t);
      const m = new THREE.MeshStandardMaterial({
        map: t, transparent: true, opacity: 0.85, roughness: 0.25, metalness: 0.1,
        emissive: new THREE.Color("#7a4fd0"), emissiveMap: t, emissiveIntensity: 0.35,
      });
      return [m, m, m, m, m, m];
    }
    return cubeMats(def, emissiveMul);
  }, [def, emissiveMul, animate]);

  useFrame((_, dt) => {
    if (def?.model === "liquid" && animate && ref.current) {
      mats.forEach((m: any) => m.map && (m.map.offset.x += dt * 0.04));
    }
  });

  if (!def) return null;
  if (def.model === "cross") {
    return (
      <group ref={ref}>
        <mesh geometry={crossGeom} material={mats[0]} />
      </group>
    );
  }
  return (
    <group ref={ref}>
      <mesh geometry={geom} material={mats} />
    </group>
  );
}

function mergeGeoms(geoms: THREE.BufferGeometry[]) {
  let vCount = 0, iCount = 0;
  geoms.forEach((g) => {
    vCount += g.attributes.position.count;
    iCount += g.index ? g.index.count : 0;
  });
  const pos = new Float32Array(vCount * 3);
  const uv = new Float32Array(vCount * 2);
  const idx = new Uint32Array(iCount);
  let vo = 0, io = 0, voBase = 0;
  geoms.forEach((g) => {
    (g.attributes.position.array as Float32Array).forEach((v, i) => (pos[vo * 3 + i] = v));
    (g.attributes.uv.array as Float32Array).forEach((v, i) => (uv[vo * 2 + i] = v));
    vo += g.attributes.position.count;
    if (g.index) {
      for (let i = 0; i < g.index.count; i++) idx[io + i] = g.index.array[i] + voBase;
      io += g.index.count;
    }
    voBase = vo;
  });
  const out = new THREE.BufferGeometry();
  out.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  out.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  return out;
}

/* Simple flat-tint cube used by scene presets / terrain (fast, no textures) */
export function TintCube({ color, emissive = 0, glow, size = 1 }: {
  color: string; emissive?: number; glow?: string; size?: number;
}) {
  return (
    <mesh castShadow receiveShadow>
      <boxGeometry args={[size, size, size]} />
      <meshStandardMaterial
        color={color}
        emissive={glow || "#000000"}
        emissiveIntensity={emissive}
        roughness={0.9}
      />
    </mesh>
  );
}
