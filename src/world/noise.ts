// Deterministic hash-based noise functions used for terrain generation.
// We implement value-noise + fBm (fractional Brownian motion) ourselves so we
// don't require external noise packages, and so results are stable across sessions.

export function hash2(x: number, y: number, seed: number): number {
  let h = seed | 0;
  h = Math.imul(h ^ x, 2654435761);
  h = Math.imul(h ^ y, 1597334677);
  h ^= h >>> 13;
  h = Math.imul(h, 1540483477);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967295;
}
export function hash3(x: number, y: number, z: number, seed: number): number {
  return hash2(hash2(x, y, seed) * 1e4 | 0, z, seed ^ 0x9e3779b9);
}
function smooth(t: number) { return t * t * (3 - 2 * t); }

export function valueNoise2D(x: number, y: number, seed: number): number {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const a = hash2(xi, yi, seed);
  const b = hash2(xi+1, yi, seed);
  const c = hash2(xi, yi+1, seed);
  const d = hash2(xi+1, yi+1, seed);
  const u = smooth(xf), v = smooth(yf);
  return (a*(1-u) + b*u)*(1-v) + (c*(1-u) + d*u)*v;
}
export function fbm2D(x: number, y: number, seed: number, octaves = 4, lac = 2, gain = 0.5): number {
  let amp = 1, freq = 1, sum = 0, norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * valueNoise2D(x*freq, y*freq, seed + i*131);
    norm += amp;
    amp *= gain;
    freq *= lac;
  }
  return sum / norm; // 0..1
}

// 3D value noise (for 3D cave carving)
export function valueNoise3D(x: number, y: number, z: number, seed: number): number {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = x - xi, yf = y - yi, zf = z - zi;
  const u = smooth(xf), v = smooth(yf), w = smooth(zf);
  const c000 = hash3(xi, yi, zi, seed);
  const c100 = hash3(xi+1, yi, zi, seed);
  const c010 = hash3(xi, yi+1, zi, seed);
  const c110 = hash3(xi+1, yi+1, zi, seed);
  const c001 = hash3(xi, yi, zi+1, seed);
  const c101 = hash3(xi+1, yi, zi+1, seed);
  const c011 = hash3(xi, yi+1, zi+1, seed);
  const c111 = hash3(xi+1, yi+1, zi+1, seed);
  const x00 = c000*(1-u)+c100*u;
  const x10 = c010*(1-u)+c110*u;
  const x01 = c001*(1-u)+c101*u;
  const x11 = c011*(1-u)+c111*u;
  const y0 = x00*(1-v)+x10*v;
  const y1 = x01*(1-v)+x11*v;
  return y0*(1-w)+y1*w;
}
export function fbm3D(x: number, y: number, z: number, seed: number, octaves = 3): number {
  let amp = 1, freq = 1, sum = 0, norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * valueNoise3D(x*freq, y*freq, z*freq, seed + i*97);
    norm += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return sum / norm;
}
