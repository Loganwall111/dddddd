/* Texture cache over the repo's PNG assets (served from /sift/textures). */
import * as THREE from "three";

const cache = new Map<string, THREE.Texture>();
const loader = new THREE.TextureLoader();

export function tex(name: string): THREE.Texture {
  const key = name;
  let t = cache.get(key);
  if (!t) {
    t = loader.load(`/sift/textures/block/${name}.png`);
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.NearestFilter;
    t.generateMipmaps = false;
    t.colorSpace = THREE.SRGBColorSpace;
    cache.set(key, t);
  }
  return t;
}

export function entityTex(name: string): THREE.Texture {
  const key = "entity:" + name;
  let t = cache.get(key);
  if (!t) {
    t = loader.load(`/sift/textures/entity/${name}.png`);
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.NearestFilter;
    t.generateMipmaps = false;
    t.colorSpace = THREE.SRGBColorSpace;
    cache.set(key, t);
  }
  return t;
}

export function itemTex(name: string): THREE.Texture {
  const key = "item:" + name;
  let t = cache.get(key);
  if (!t) {
    t = loader.load(`/sift/textures/item/${name}.png`);
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.NearestFilter;
    t.generateMipmaps = false;
    t.colorSpace = THREE.SRGBColorSpace;
    cache.set(key, t);
  }
  return t;
}

/* Animated textures (ichor, rift membranes) — offsets advanced per frame. */
const animated = new Set<THREE.Texture>();
export function markAnimated(t: THREE.Texture) {
  animated.add(t);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
}
export function tickTextures(dt: number, speed = 0.02) {
  animated.forEach((t) => {
    t.offset.x += dt * speed;
    t.offset.y += dt * speed * 0.6;
  });
}
