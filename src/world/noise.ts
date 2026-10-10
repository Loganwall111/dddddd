export function seedNumber(text: string): number {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
  return hash >>> 0;
}
export function hash3(x: number, y: number, z: number, seed: number): number {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 1442695041) ^ seed;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
const smooth = (t: number) => t * t * (3 - 2 * t);
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
export function noise2(x: number, z: number, seed: number): number {
  const ix = Math.floor(x), iz = Math.floor(z), fx = smooth(x - ix), fz = smooth(z - iz);
  return mix(mix(hash3(ix, 0, iz, seed), hash3(ix + 1, 0, iz, seed), fx), mix(hash3(ix, 0, iz + 1, seed), hash3(ix + 1, 0, iz + 1, seed), fx), fz);
}
export function noise3(x: number, y: number, z: number, seed: number): number {
  const iy = Math.floor(y), fy = smooth(y - iy);
  return mix(noise2(x, z, seed ^ Math.imul(iy, 19349663)), noise2(x, z, seed ^ Math.imul(iy + 1, 19349663)), fy);
}
export function fbm(x: number, z: number, seed: number, octaves = 4): number {
  let result = 0, amplitude = .5, norm = 0;
  for (let i = 0; i < octaves; i++) {
    result += noise2(x, z, seed + i * 7349) * amplitude;
    norm += amplitude; amplitude *= .5; x *= 2.03; z *= 2.03;
  }
  return result / norm;
}