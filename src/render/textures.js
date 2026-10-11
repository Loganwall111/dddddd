/**
 * THE MULTIVERSE — render/textures.js
 * ==================================================================
 * PROCEDURAL TEXTURE FOUNDRY. The game loads no image files. Bark, cliff,
 * grass, moss, sand, snow, crystal, metal, carpet, circuit, coral, flesh,
 * cloud noise, particle sprites, planet skins and the colour-grading LUT are
 * all *painted at runtime* onto canvases (and, for volumetric clouds, into a
 * 3D texture) from seeded noise.
 *
 * Every generator is deterministic: the same seed always paints the same
 * alien bark. Everything is capped to the current quality preset so a laptop
 * can still load in a couple of seconds.
 */
import {
  CanvasTexture,
  Data3DTexture,
  LinearFilter,
  LinearMipmapLinearFilter,
  RGBAFormat,
  RepeatWrapping,
  SRGBColorSpace,
  UnsignedByteType,
} from 'three';
import { NoiseStack } from '../core/noise.js';
import { clamp, clamp01, lerp } from '../core/math.js';
import { hash2, hash2f, mulberry32 } from '../core/rand.js';

/* ------------------------------------------------------------------ *
 * Low-level painting helpers
 * ------------------------------------------------------------------ */

export function makeCanvas(size) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  return canvas;
}

/**
 * Fill a canvas pixel-by-pixel. `fn(x, y, u, v)` returns [r,g,b,a] in 0..255
 * (a optional, defaulting to 255).
 */
export function paint(canvas, fn) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const { width, height } = canvas;
  const image = ctx.createImageData(width, height);
  const data = image.data;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const rgba = fn(x, y, x / width, y / height);
      data[i] = rgba[0];
      data[i + 1] = rgba[1];
      data[i + 2] = rgba[2];
      data[i + 3] = rgba.length > 3 ? rgba[3] : 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
}

/** Sample an ImageData channel with wrap-around, for blur/gradient passes. */
function sample(data, width, height, x, y, channel = 0) {
  const xx = ((x % width) + width) % width;
  const yy = ((y % height) + height) % height;
  return data[(yy * width + xx) * 4 + channel];
}

/** Small separable box blur — softens procedural noise into natural shapes. */
export function blurCanvas(canvas, radius = 1, passes = 1) {
  if (radius <= 0) return canvas;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const { width, height } = canvas;
  let image = ctx.getImageData(0, 0, width, height);
  for (let p = 0; p < passes; p++) {
    const src = image.data;
    const tmp = new Uint8ClampedArray(src.length);
    // horizontal
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let r = 0;
        let g = 0;
        let b = 0;
        let a = 0;
        let n = 0;
        for (let d = -radius; d <= radius; d++) {
          const sx = x + d;
          r += sample(src, width, height, sx, y, 0);
          g += sample(src, width, height, sx, y, 1);
          b += sample(src, width, height, sx, y, 2);
          a += sample(src, width, height, sx, y, 3);
          n++;
        }
        const i = (y * width + x) * 4;
        tmp[i] = r / n;
        tmp[i + 1] = g / n;
        tmp[i + 2] = b / n;
        tmp[i + 3] = a / n;
      }
    }
    // vertical
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let r = 0;
        let g = 0;
        let b = 0;
        let a = 0;
        let n = 0;
        for (let d = -radius; d <= radius; d++) {
          const sy = y + d;
          const i = ((((sy % height) + height) % height) * width + x) * 4;
          r += tmp[i];
          g += tmp[i + 1];
          b += tmp[i + 2];
          a += tmp[i + 3];
          n++;
        }
        const i = (y * width + x) * 4;
        src[i] = r / n;
        src[i + 1] = g / n;
        src[i + 2] = b / n;
        src[i + 3] = a / n;
      }
    }
    image = new ImageData(src, width, height);
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
}

/**
 * Convert a greyscale height canvas into a tangent-space normal map using
 * Sobel gradients. This is how every surface in the game gets relief.
 */
export function heightToNormal(canvas, strength = 2.2, { wrap = true } = {}) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const { width, height } = canvas;
  const src = ctx.getImageData(0, 0, width, height).data;
  const out = new ImageData(width, height);
  const at = (x, y) => {
    if (!wrap) {
      x = clamp(x, 0, width - 1);
      y = clamp(y, 0, height - 1);
    }
    const xx = ((x % width) + width) % width;
    const yy = ((y % height) + height) % height;
    const i = (yy * width + xx) * 4;
    return (src[i] * 0.299 + src[i + 1] * 0.587 + src[i + 2] * 0.114) / 255;
  };
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const tl = at(x - 1, y - 1);
      const t = at(x, y - 1);
      const tr = at(x + 1, y - 1);
      const l = at(x - 1, y);
      const r = at(x + 1, y);
      const bl = at(x - 1, y + 1);
      const b = at(x, y + 1);
      const br = at(x + 1, y + 1);
      const dx = tl + 2 * l + bl - (tr + 2 * r + br);
      const dy = tl + 2 * t + tr - (bl + 2 * b + br);
      let nx = dx * strength;
      let ny = dy * strength;
      let nz = 255;
      const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
      nx = (nx / len) * 127 + 128;
      ny = (ny / len) * 127 + 128;
      nz = (nz / len) * 127 + 128;
      const i = (y * width + x) * 4;
      out.data[i] = nx;
      out.data[i + 1] = ny;
      out.data[i + 2] = nz;
      out.data[i + 3] = 255;
    }
  }
  const target = makeCanvas(width);
  target.width = width;
  target.height = height;
  target.getContext('2d', { willReadFrequently: true }).putImageData(out, 0, 0);
  return target;
}

/* ------------------------------------------------------------------ *
 * Biome surface generators
 * ------------------------------------------------------------------ */

const BIOME_PAINTERS = {
  /** Open meadow grass: vertical strands with clumped colour. */
  grass(nz, seed) {
    const scale = 26;
    return (x, y, u, v) => {
      const clump = nz.fbm(u * 4.2, v * 4.2, { octaves: 4, frequency: 1 });
      const strand = nz.perlin.noise2((u * scale + clump * 2.4) * 2.2, v * scale * 0.35);
      const blade = clamp01(0.5 + strand * 0.9);
      const shade = clamp01(0.42 + clump * 0.35 + blade * 0.3);
      const dry = clamp01(nz.perlin.noise2(u * 2.1 + 40, v * 2.1 - 17) * 0.5 + 0.5);
      const r = lerp(46, 116, shade) * lerp(0.85, 1.25, dry);
      const g = lerp(94, 168, shade) * lerp(0.9, 1.1, dry);
      const b = lerp(38, 78, shade) * lerp(0.75, 1.1, dry);
      return [r, g, b];
    };
  },
  /** Wet moss: dark, soft, packed cells. */
  moss(nz) {
    return (x, y, u, v) => {
      const cell = nz.worley(u * 34, v * 34, 3);
      const soft = nz.fbm(u * 12, v * 12, { octaves: 3 });
      const t = clamp01(cell.f1 * 1.4 + soft * 0.25);
      return [lerp(24, 62, t), lerp(58, 118, t), lerp(26, 54, t)];
    };
  },
  /** Layered cliff rock: strata + fractures. */
  rock(nz) {
    return (x, y, u, v) => {
      const strata = Math.sin(v * 26 + nz.fbm(u * 3, v * 3, { octaves: 3 }) * 5.5);
      const grains = nz.fbm(u * 42, v * 42, { octaves: 3, frequency: 1 });
      const crack = clamp01(1 - Math.abs(nz.ridged(u * 9, v * 9, { octaves: 4 }) - 0.62) * 7);
      const base = clamp01(0.5 + strata * 0.12 + grains * 0.22 - crack * 0.5);
      const warm = nz.perlin.noise2(u * 1.7, v * 1.7) * 0.5 + 0.5;
      return [
        lerp(68, 148, base) * lerp(0.86, 1.14, warm),
        lerp(62, 138, base) * lerp(0.9, 1.08, warm),
        lerp(58, 128, base) * lerp(0.94, 1.26, warm),
      ];
    };
  },
  /** Dry sand with wind ripples. */
  sand(nz) {
    return (x, y, u, v) => {
      const ripple = Math.sin((u * 44 + nz.fbm(u * 3, v * 3, { octaves: 2 }) * 9) * Math.PI);
      const grains = nz.fbm(u * 60, v * 60, { octaves: 2 });
      const t = clamp01(0.6 + ripple * 0.1 + grains * 0.18);
      return [lerp(158, 226, t), lerp(138, 208, t), lerp(102, 164, t)];
    };
  },
  /** Snow: fine grain, blue shadows, sparkle. */
  snow(nz) {
    return (x, y, u, v) => {
      const grain = nz.fbm(u * 32, v * 32, { octaves: 4 });
      const sparkle = nz.worley(u * 90, v * 90, 11).f1 > 0.86 ? 0.35 : 0;
      const t = clamp01(0.82 + grain * 0.14 + sparkle);
      return [lerp(214, 255, t), lerp(224, 255, t), lerp(240, 255, t)];
    };
  },
  /** Tilled alien soil with cracks. */
  soil(nz) {
    return (x, y, u, v) => {
      const clod = nz.fbm(u * 18, v * 18, { octaves: 4 });
      const crack = clamp01(1 - Math.abs(nz.ridged(u * 7, v * 7, { octaves: 3 }) - 0.5) * 6);
      const t = clamp01(0.45 + clod * 0.4 - crack * 0.35);
      return [lerp(46, 108, t), lerp(34, 78, t), lerp(26, 58, t)];
    };
  },
  /** Bark: deep vertical fissures, moss in the grooves. */
  bark(nz) {
    return (x, y, u, v) => {
      const fissure = clamp01(1 - Math.abs(nz.ridged(u * 16, v * 3.4, { octaves: 4 }) - 0.55) * 5.5);
      const grain = nz.fbm(u * 46, v * 12, { octaves: 3 });
      const t = clamp01(0.4 + grain * 0.3 - fissure * 0.45);
      const moss = nz.fbm(u * 6 + 22, v * 6 - 8, { octaves: 3 }) * 0.5 + 0.5;
      return [lerp(54, 122, t) * lerp(1, 0.82, moss), lerp(42, 96, t) * lerp(1, 1.12, moss), lerp(32, 72, t)];
    };
  },
  /** Large alien leaf surface: veins and pores. */
  leaf(nz) {
    return (x, y, u, v) => {
      const cx = u - 0.5;
      const vein = clamp01(1 - Math.abs(cx) * 14) + clamp01(1 - Math.abs(Math.sin(v * 6) * 0.5 + cx * 2));
      const pores = nz.worley(u * 26, v * 26, 5).f1 < 0.22 ? -0.14 : 0;
      const t = clamp01(0.55 + vein * 0.35 + pores + nz.fbm(u * 10, v * 10, { octaves: 3 }) * 0.18);
      return [lerp(28, 96, t), lerp(78, 172, t), lerp(52, 92, t)];
    };
  },
  /** Crystal: faceted, refracting, with internal glow. */
  crystal(nz) {
    return (x, y, u, v) => {
      const facet = nz.worley(u * 8, v * 8, 21);
      const edge = clamp01(1 - Math.abs(facet.f2 - facet.f1) * 5);
      const glow = clamp01(0.4 + nz.fbm(u * 4, v * 4, { octaves: 3 }) * 0.4);
      const t = clamp01(0.35 + glow * 0.5 + edge * 0.35);
      return [lerp(96, 224, t), lerp(150, 240, t), lerp(200, 255, t)];
    };
  },
  /** Machine alloy: brushed panels, rivets, micro-scratches. */
  metal(nz) {
    return (x, y, u, v) => {
      const panel = Math.min(
        Math.abs(((u * 4) % 1) - 0.5),
        Math.abs(((v * 4) % 1) - 0.5)
      );
      const seam = panel < 0.012 ? -0.35 : 0;
      const brush = nz.perlin.noise2(u * 180, v * 3) * 0.06;
      const scratch = Math.abs(nz.perlin.noise2(u * 60, v * 60)) > 0.86 ? 0.12 : 0;
      const t = clamp01(0.55 + brush + seam + scratch);
      return [lerp(118, 208, t), lerp(126, 214, t), lerp(140, 226, t)];
    };
  },
  /** Damp backrooms carpet: monochrome, sickly, with traffic wear. */
  carpet(nz) {
    return (x, y, u, v) => {
      const fibre = nz.fbm(u * 90, v * 90, { octaves: 3 });
      const stain = clamp01(nz.fbm(u * 3.4, v * 3.4, { octaves: 3 }) * 0.5 + 0.5);
      const wear = clamp01(0.6 + nz.perlin.noise2(u * 5, v * 5) * 0.3);
      const t = clamp01(0.42 + fibre * 0.22 + stain * 0.3);
      return [lerp(148, 196, t) * wear, lerp(140, 184, t) * wear, lerp(96, 128, t) * wear];
    };
  },
  /** Poured concrete with form-work lines. */
  concrete(nz) {
    return (x, y, u, v) => {
      const pores = nz.fbm(u * 44, v * 44, { octaves: 4 });
      const form = Math.abs(((u * 2) % 1) - 0.5) < 0.008 ? -0.1 : 0;
      const t = clamp01(0.58 + pores * 0.24 + form);
      return [lerp(120, 196, t), lerp(122, 198, t), lerp(116, 190, t)];
    };
  },
  /** LODEMUS instrumentation: dark glass with faint circuitry. */
  circuit(nz) {
    return (x, y, u, v) => {
      const grid = nz.worley(u * 14, v * 14, 31);
      const trace = clamp01(1 - Math.abs(grid.f2 - grid.f1) * 9);
      const pulse = clamp01(nz.fbm(u * 3, v * 3, { octaves: 3 }) * 0.5 + 0.5);
      const t = clamp01(0.18 + trace * 0.5);
      return [lerp(10, 70, t), lerp(26, 150, t) * (0.6 + pulse * 0.6), lerp(40, 190, t)];
    };
  },
  /** Living tissue for the Great One's back. */
  flesh(nz) {
    return (x, y, u, v) => {
      const vein = clamp01(1 - Math.abs(nz.ridged(u * 6, v * 6, { octaves: 4 }) - 0.5) * 5);
      const pore = nz.worley(u * 40, v * 40, 13).f1;
      const t = clamp01(0.5 + pore * 0.3 - vein * 0.28);
      return [lerp(112, 206, t), lerp(84, 158, t), lerp(88, 146, t)];
    };
  },
  /** Cold-water coral / abyssal growth. */
  coral(nz) {
    return (x, y, u, v) => {
      const branch = clamp01(1 - Math.abs(nz.worley(u * 12, v * 12, 17).f2 - 0.12) * 6);
      const speck = nz.fbm(u * 55, v * 55, { octaves: 2 });
      const t = clamp01(0.4 + branch * 0.4 + speck * 0.2);
      return [lerp(52, 196, t), lerp(80, 168, t), lerp(120, 232, t)];
    };
  },
  /** Fractal-cathedral marble with impossible veins. */
  marble(nz) {
    return (x, y, u, v) => {
      const turbulence = nz.turbulence3(u * 5, v * 5, 0.4, 4);
      const vein = clamp01(Math.sin((u * 6 + turbulence * 6) * Math.PI) * 0.5 + 0.5);
      const t = clamp01(0.72 + vein * 0.2 + turbulence * 0.12);
      return [lerp(180, 250, t), lerp(172, 236, t), lerp(196, 255, t)];
    };
  },
};

/** Paint one biome surface + its normal map + a roughness map. */
export function makeSurfaceTextures(kind, { size = 512, seed = 11, normalStrength = 2.4, roughBase = 0.85, roughVariance = 0.15 } = {}) {
  const nz = new NoiseStack(seed);
  const painter = BIOME_PAINTERS[kind] || BIOME_PAINTERS.rock;
  const albedoCanvas = paint(makeCanvas(size), (x, y, u, v) => {
    const [r, g, b] = painter(nz, seed)(x, y, u, v);
    return [clamp(r, 0, 255), clamp(g, 0, 255), clamp(b, 0, 255)];
  });
  blurCanvas(albedoCanvas, 0, 1);
  const heightCanvas = paint(makeCanvas(size), (x, y, u, v) => {
    const [r, g, b] = painter(nz, seed)(x, y, u, v);
    const l = (r * 0.299 + g * 0.587 + b * 0.114) / 255;
    return [l * 255, l * 255, l * 255];
  });
  blurCanvas(heightCanvas, 1, 1);
  const normalCanvas = heightToNormal(heightCanvas, normalStrength);
  const roughCanvas = paint(makeCanvas(size), (x, y, u, v) => {
    const grains = nz.fbm(u * 24, v * 24, { octaves: 3 }) * 0.5 + 0.5;
    const value = clamp01(roughBase + (grains - 0.5) * roughVariance * 2);
    return [value * 255, value * 255, value * 255];
  });

  return {
    map: toTexture(albedoCanvas, { srgb: true }),
    normalMap: toTexture(normalCanvas, { srgb: false }),
    roughnessMap: toTexture(roughCanvas, { srgb: false }),
    heightCanvas,
    albedoCanvas,
  };
}

/** Wrap a canvas as a THREE texture with sane defaults. */
export function toTexture(canvas, { srgb = false, repeat = 1, wrap = RepeatWrapping, anisotropy = 4, generateMipmaps = true } = {}) {
  const texture = new CanvasTexture(canvas);
  texture.wrapS = wrap;
  texture.wrapT = wrap;
  texture.colorSpace = srgb ? SRGBColorSpace : texture.colorSpace;
  texture.anisotropy = anisotropy;
  texture.generateMipmaps = generateMipmaps;
  texture.minFilter = generateMipmaps ? LinearMipmapLinearFilter : LinearFilter;
  texture.magFilter = LinearFilter;
  if (repeat !== 1) texture.repeat.set(repeat, repeat);
  texture.needsUpdate = true;
  return texture;
}

/* ------------------------------------------------------------------ *
 * Water normal maps
 * ------------------------------------------------------------------ */

/**
 * Animated-looking water normal map: several octaves of waves with a
 * directional swell. Sample it twice with different speeds/offsets in the
 * water shader to get convincing flowing reflections.
 */
export function makeWaterNormal(size = 512, { seed = 5, strength = 1.6, swell = 0.35 } = {}) {
  const nz = new NoiseStack(seed);
  const height = paint(makeCanvas(size), (x, y, u, v) => {
    let h = 0;
    let amp = 1;
    let norm = 0;
    // A directional swell plus crossing choppy detail.
    h += Math.sin((u * 6 + v * 1.5) * Math.PI * 2) * swell;
    norm += swell;
    let freq = 3;
    for (let o = 0; o < 5; o++) {
      h += nz.perlin.noise2(u * freq * 2.4, v * freq * 1.9) * amp;
      norm += amp;
      amp *= 0.55;
      freq *= 2.1;
    }
    const value = clamp01((h / norm) * 0.5 + 0.5);
    return [value * 255, value * 255, value * 255];
  });
  blurCanvas(height, 1, 1);
  const normalCanvas = heightToNormal(height, strength);
  return {
    normalMap: toTexture(normalCanvas, { srgb: false }),
    canvas: normalCanvas,
  };
}

/** Foam/spray sprite sheet is unnecessary: we use a soft caustic-free foam mask. */
export function makeFoamMask(size = 256, seed = 9) {
  const nz = new NoiseStack(seed);
  const canvas = paint(makeCanvas(size), (x, y, u, v) => {
    const f = nz.fbm(u * 14, v * 14, { octaves: 4 });
    const a = clamp01(0.5 + f * 1.4);
    return [255, 255, 255, a * 255];
  });
  blurCanvas(canvas, 1, 1);
  return toTexture(canvas, { srgb: false });
}

/* ------------------------------------------------------------------ *
 * Particle sprites (all soft, additive-friendly)
 * ------------------------------------------------------------------ */

export function makeSprite(kind = 'glow', size = 128, seed = 3) {
  const rng = mulberry32(seed);
  const canvas = makeCanvas(size);
  const ctx = canvas.getContext('2d');
  const half = size / 2;
  ctx.clearRect(0, 0, size, size);

  if (kind === 'glow' || kind === 'spark' || kind === 'ember' || kind === 'mote' || kind === 'star') {
    const gradient = ctx.createRadialGradient(half, half, 0, half, half, half);
    const power = kind === 'glow' ? 1 : 2.4;
    for (let i = 0; i <= 12; i++) {
      const t = i / 12;
      const alpha = Math.pow(1 - t, power);
      const r = 255;
      const g = kind === 'ember' ? lerp(120, 255, t) : lerp(180, 255, t);
      const b = kind === 'ember' ? lerp(30, 190, 1 - t) : lerp(150, 255, t);
      gradient.addColorStop(t, `rgba(${r | 0},${g | 0},${b | 0},${alpha.toFixed(3)})`);
    }
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
  } else if (kind === 'rain') {
    for (let i = 0; i < size * 2; i++) {
      const x = rng() * size;
      const y = rng() * size;
      const len = 6 + rng() * size * 0.35;
      ctx.strokeStyle = `rgba(200,225,255,${0.16 + rng() * 0.3})`;
      ctx.lineWidth = 0.6 + rng() * 1.2;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + len * 0.12, y + len);
      ctx.stroke();
    }
  } else if (kind === 'snow' || kind === 'dust') {
    for (let i = 0; i < 140; i++) {
      const x = rng() * size;
      const y = rng() * size;
      const r = 0.6 + rng() * (kind === 'snow' ? 2.4 : 1.6);
      const g = ctx.createRadialGradient(x, y, 0, x, y, r * 3);
      g.addColorStop(0, 'rgba(255,255,255,0.95)');
      g.addColorStop(0.4, 'rgba(255,255,255,0.35)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r * 3, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (kind === 'leaf' || kind === 'petal') {
    for (let i = 0; i < 8; i++) {
      const x = rng() * size;
      const y = rng() * size;
      const r = size * 0.06 + rng() * size * 0.08;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rng() * Math.PI * 2);
      const g = ctx.createLinearGradient(-r, 0, r, 0);
      g.addColorStop(0, 'rgba(120,180,90,0.9)');
      g.addColorStop(1, 'rgba(70,130,60,0.85)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(0, 0, r, r * 0.42, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  } else if (kind === 'bubble' || kind === 'ring') {
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = size * 0.06;
    ctx.beginPath();
    ctx.arc(half, half, half * 0.7, 0, Math.PI * 2);
    ctx.stroke();
    const g = ctx.createRadialGradient(half * 0.72, half * 0.7, 0, half, half, half);
    g.addColorStop(0, 'rgba(255,255,255,0.5)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  } else {
    // generic soft dot
    const g = ctx.createRadialGradient(half, half, 0, half, half, half);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  }
  return toTexture(canvas, { srgb: true });
}

/* ------------------------------------------------------------------ *
 * Lens dirt / flare sprites (used by the post chain)
 * ------------------------------------------------------------------ */

export function makeLensDirt(size = 512, seed = 42) {
  const rng = mulberry32(seed);
  const canvas = makeCanvas(size);
  const ctx = canvas.getContext('2d');
  // Sparse soft droplets on an otherwise clean lens — never a dark blob.
  for (let i = 0; i < 26; i++) {
    const x = rng() * size;
    const y = rng() * size;
    const r = size * (0.02 + rng() * 0.06);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(255,255,255,0.05)');
    g.addColorStop(0.7, 'rgba(255,255,255,0.035)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  }
  for (let i = 0; i < 60; i++) {
    const x = rng() * size;
    const y = rng() * size;
    const r = size * (0.004 + rng() * 0.012);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(255,255,255,0.09)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  return toTexture(canvas, { srgb: true });
}

export function makeFlareSprite(size = 256, { spikes = 6, seed = 7 } = {}) {
  const rng = mulberry32(seed);
  const canvas = makeCanvas(size);
  const ctx = canvas.getContext('2d');
  const half = size / 2;
  const g = ctx.createRadialGradient(half, half, 0, half, half, half);
  g.addColorStop(0, 'rgba(255,255,255,0.9)');
  g.addColorStop(0.25, 'rgba(255,240,210,0.35)');
  g.addColorStop(1, 'rgba(255,220,180,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = 'rgba(255,245,225,0.35)';
  for (let i = 0; i < spikes; i++) {
    const a = (i / spikes) * Math.PI * 2 + rng() * 0.4;
    ctx.lineWidth = 1 + rng() * 2;
    ctx.beginPath();
    ctx.moveTo(half, half);
    ctx.lineTo(half + Math.cos(a) * half * 0.98, half + Math.sin(a) * half * 0.98);
    ctx.stroke();
  }
  return toTexture(canvas, { srgb: true });
}

/* ------------------------------------------------------------------ *
 * Sky: stars, planets, moons
 * ------------------------------------------------------------------ */

export function makeStarSprite(size = 64) {
  const canvas = makeCanvas(size);
  const ctx = canvas.getContext('2d');
  const half = size / 2;
  const g = ctx.createRadialGradient(half, half, 0, half, half, half);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.18, 'rgba(255,250,240,0.55)');
  g.addColorStop(0.5, 'rgba(200,220,255,0.12)');
  g.addColorStop(1, 'rgba(180,200,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return toTexture(canvas, { srgb: true });
}

/** Banded gas giant / rocky world skin. */
export function makePlanetTexture(size = 512, { seed = 8, bands = true, palette = ['#c9a86a', '#8a6a44', '#e6d2a8'] } = {}) {
  const nz = new NoiseStack(seed);
  const canvas = paint(makeCanvas(size), (x, y, u, v) => {
    const warp = nz.fbm(u * 3, v * 8, { octaves: 4 }) * 0.12;
    const band = bands ? Math.sin((v + warp) * Math.PI * (6 + (seed % 5))) : 0;
    const turbulence = nz.fbm(u * 7, v * 7, { octaves: 5 });
    const storm = clamp01(nz.worley(u * 5, v * 5, seed).f2 - nz.worley(u * 5, v * 5, seed).f1 > 0.3 ? 1 : 0);
    const t = clamp01(0.5 + band * 0.22 + turbulence * 0.3 + storm * 0.1);
    const c0 = hexToRgb255(palette[0]);
    const c1 = hexToRgb255(palette[1]);
    const c2 = hexToRgb255(palette[2]);
    const a = t < 0.5 ? mix(c0, c1, t * 2) : mix(c1, c2, (t - 0.5) * 2);
    return a;
  });
  blurCanvas(canvas, 1, 1);
  return toTexture(canvas, { srgb: true });
}

function hexToRgb255(hex) {
  const value = parseInt(hex.replace('#', ''), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function mix(a, b, t) {
  return [
    lerp(a[0], b[0], t),
    lerp(a[1], b[1], t),
    lerp(a[2], b[2], t),
  ];
}

/** Rocky moon with craters (used for both moons of the valley). */
export function makeMoonTexture(size = 512, { seed = 12, base = [180, 176, 168] } = {}) {
  const nz = new NoiseStack(seed);
  const craters = [];
  const rng = mulberry32(seed);
  for (let i = 0; i < 90; i++) {
    craters.push({ x: rng(), y: rng(), r: 0.01 + rng() * 0.07, d: 0.35 + rng() * 0.5 });
  }
  const canvas = paint(makeCanvas(size), (x, y, u, v) => {
    let shade = 1;
    for (const c of craters) {
      const dx = (u - c.x) * 1.0;
      const dy = (v - c.y) * 1.0;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < c.r) {
        const t = d / c.r;
        shade *= lerp(1 - c.d * 0.55, 1 + c.d * 0.35, t > 0.75 ? 1 : t * 1.2);
      }
    }
    const grain = nz.fbm(u * 20, v * 20, { octaves: 5 }) * 0.14;
    const t = clamp01(shade + grain);
    return [base[0] * t, base[1] * t, base[2] * t];
  });
  blurCanvas(canvas, 1, 1);
  return toTexture(canvas, { srgb: true });
}

/** The nebula backdrop for space (used by the intro and night sky). */
export function makeNebulaTexture(size = 1024, { seed = 4 } = {}) {
  const nz = new NoiseStack(seed);
  const canvas = paint(makeCanvas(size), (x, y, u, v) => {
    const warp = nz.fbm(u * 2.2, v * 2.2, { octaves: 4 }) * 0.5;
    const t = clamp01(0.5 + warp);
    const dust = clamp01(nz.fbm(u * 6 + 11, v * 6 - 3, { octaves: 5 }) * 0.5 + 0.5);
    const core = clamp01(0.5 + nz.fbm(u * 1.2, v * 1.2, { octaves: 3 }) * 0.9);
    const r = 22 + core * 120 + dust * 40;
    const g = 12 + core * 42 + dust * 30;
    const b = 40 + core * 150 + dust * 60;
    const alpha = clamp01(t * 0.85 + core * 0.3);
    return [r, g, b, alpha * 255];
  });
  blurCanvas(canvas, 2, 2);
  return toTexture(canvas, { srgb: true, generateMipmaps: true });
}

/* ------------------------------------------------------------------ *
 * Volumetric cloud noise (3D texture) + curl field
 * ------------------------------------------------------------------ */

/**
 * Build the 3D texture the cloud shader raymarches.
 *  R = base density   G = detail (high frequency)   B = curl.x   A = curl.y
 * Size is quality-driven (32 → 64). 64³ is ~262k texels and takes ~0.3 s.
 */
export function makeCloudNoise3D(size = 48, seed = 1337) {
  const nz = new NoiseStack(seed);
  const data = new Uint8Array(size * size * size * 4);
  let i = 0;
  const inv = 1 / size;
  for (let z = 0; z < size; z++) {
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const u = x * inv;
        const v = y * inv;
        const w = z * inv;
        // Periodic sampling keeps the texture seamless when tiled by the shader.
        const base = nz.turbulence3(u * 4, v * 4, w * 4, 4);
        const detail = nz.turbulence3(u * 12, v * 12, w * 12, 3);
        const curlX = (nz.perlin.noise3(u * 6, v * 6 + 0.35, w * 6) - nz.perlin.noise3(u * 6, v * 6 - 0.35, w * 6)) * 0.5 + 0.5;
        const curlY = (nz.perlin.noise3(u * 6 + 0.35, v * 6, w * 6) - nz.perlin.noise3(u * 6 - 0.35, v * 6, w * 6)) * 0.5 + 0.5;
        data[i++] = clamp01(base) * 255;
        data[i++] = clamp01(detail) * 255;
        data[i++] = clamp01(curlX) * 255;
        data[i++] = clamp01(curlY) * 255;
      }
    }
  }
  const texture = new Data3DTexture(data, size, size, size);
  texture.format = RGBAFormat;
  texture.type = UnsignedByteType;
  texture.minFilter = LinearFilter;
  texture.magFilter = LinearFilter;
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.wrapR = RepeatWrapping;
  texture.unpackAlignment = 1;
  texture.needsUpdate = true;
  return texture;
}

/** Small 2D curl/detail texture for smoke, spray and portal swirls. */
export function makeFlowTexture(size = 256, { seed = 18 } = {}) {
  const nz = new NoiseStack(seed);
  const canvas = paint(makeCanvas(size), (x, y, u, v) => {
    const curl = { x: 0, y: 0 };
    nz.curl(u * 6, v * 6, 1, curl);
    const curl2v = {};
    const angled = clamp01(Math.atan2(curl.x, curl.y) / (Math.PI * 2) + 0.5);
    const mag = clamp01(Math.hypot(curl.x, curl.y) * 0.4);
    const detail = clamp01(nz.fbm(u * 10, v * 10, { octaves: 4 }) * 0.5 + 0.5);
    void curl2v;
    return [angled * 255, mag * 255, detail * 255, 255];
  });
  return toTexture(canvas, { srgb: false });
}

/* ------------------------------------------------------------------ *
 * Colour grading LUT
 * ------------------------------------------------------------------ */

/**
 * A 16³ colour-grading cube: filmic teal shadows, warm highlights, gentle
 * S-curve, and a slight desaturation of the extremes — the "AAA look".
 * The post-processing grade pass can also lerp this toward a realm tint.
 */
export function makeGradeLUT(size = 16) {
  const data = new Uint8Array(size * size * size * 4);
  const inv = 1 / (size - 1);
  const sCurve = (t) => t * t * (3 - 2 * t);
  let i = 0;
  for (let b = 0; b < size; b++) {
    for (let g = 0; g < size; g++) {
      for (let r = 0; r < size; r++) {
        const rr = r * inv;
        const gg = g * inv;
        const bb = b * inv;
        // lift shadows toward teal, push highlights toward warm
        const lum = rr * 0.2126 + gg * 0.7152 + bb * 0.0722;
        const shadow = clamp01(1 - lum * 2.2);
        const highlight = clamp01(lum * 1.6 - 0.35);
        let outR = sCurve(clamp01(rr)) + highlight * 0.05 - shadow * 0.02;
        let outG = sCurve(clamp01(gg)) + highlight * 0.015 + shadow * 0.012;
        let outB = sCurve(clamp01(bb)) - highlight * 0.03 + shadow * 0.05;
        // gentle contrast around mid grey
        outR = clamp01((outR - 0.5) * 1.06 + 0.5);
        outG = clamp01((outG - 0.5) * 1.05 + 0.5);
        outB = clamp01((outB - 0.5) * 1.07 + 0.5);
        data[i++] = outR * 255;
        data[i++] = outG * 255;
        data[i++] = outB * 255;
        data[i++] = 255;
      }
    }
  }
  const texture = new Data3DTexture(data, size, size, size);
  texture.format = RGBAFormat;
  texture.type = UnsignedByteType;
  texture.minFilter = LinearFilter;
  texture.magFilter = LinearFilter;
  texture.wrapS = texture.wrapT = texture.wrapR = RepeatWrapping;
  texture.unpackAlignment = 1;
  texture.needsUpdate = true;
  return texture;
}

/* ------------------------------------------------------------------ *
 * Texture library: everything a realm asks for, built once and shared
 * ------------------------------------------------------------------ */

export class TextureLibrary {
  constructor({ quality = {}, seed = 1337 } = {}) {
    this.seed = seed;
    this.size = quality.surfaceSize ?? 512;
    this.cache = new Map();
    this.planetTextures = [];
  }

  /** Get (or lazily build) a biome surface set: {map, normalMap, roughnessMap}. */
  surface(kind, opts = {}) {
    const key = `surface:${kind}:${JSON.stringify(opts)}`;
    if (this.cache.has(key)) return this.cache.get(key);
    const set = makeSurfaceTextures(kind, { size: this.size, seed: this.seed ^ hash2(kind.length, opts.seed || 0), ...opts });
    this.cache.set(key, set);
    return set;
  }

  waterNormal(opts = {}) {
    const key = `water:${JSON.stringify(opts)}`;
    if (this.cache.has(key)) return this.cache.get(key);
    const set = makeWaterNormal(Math.min(this.size, 512), opts);
    this.cache.set(key, set);
    return set;
  }

  sprite(kind, opts = {}) {
    const key = `sprite:${kind}:${JSON.stringify(opts)}`;
    if (this.cache.has(key)) return this.cache.get(key);
    const texture = makeSprite(kind, opts.size ?? 128, this.seed + (opts.seed ?? 0));
    this.cache.set(key, texture);
    return texture;
  }

  planet(index, opts = {}) {
    const key = `planet:${index}`;
    if (this.cache.has(key)) return this.cache.get(key);
    const texture = makePlanetTexture(256, { seed: this.seed + index * 17, ...opts });
    this.cache.set(key, texture);
    this.planetTextures.push(texture);
    return texture;
  }

  moons() {
    if (!this.cache.has('moons')) {
      this.cache.set('moons', [
        makeMoonTexture(256, { seed: this.seed + 3, base: [196, 190, 176] }),
        makeMoonTexture(256, { seed: this.seed + 9, base: [150, 160, 178] }),
      ]);
    }
    return this.cache.get('moons');
  }

  nebula() {
    if (!this.cache.has('nebula')) this.cache.set('nebula', makeNebulaTexture(512, { seed: this.seed + 7 }));
    return this.cache.get('nebula');
  }

  stars() {
    if (!this.cache.has('stars')) this.cache.set('stars', makeStarSprite(64));
    return this.cache.get('stars');
  }

  lensDirt() {
    if (!this.cache.has('lensDirt')) this.cache.set('lensDirt', makeLensDirt(512, this.seed + 5));
    return this.cache.get('lensDirt');
  }

  flare() {
    if (!this.cache.has('flare')) this.cache.set('flare', makeFlareSprite(256, { seed: this.seed + 13 }));
    return this.cache.get('flare');
  }

  flow() {
    if (!this.cache.has('flow')) this.cache.set('flow', makeFlowTexture(256, { seed: this.seed + 21 }));
    return this.cache.get('flow');
  }

  foam() {
    if (!this.cache.has('foam')) this.cache.set('foam', makeFoamMask(256, this.seed + 31));
    return this.cache.get('foam');
  }

  cloudNoise(size = 48) {
    const key = `cloudNoise:${size}`;
    if (!this.cache.has(key)) this.cache.set(key, makeCloudNoise3D(size, this.seed));
    return this.cache.get(key);
  }

  gradeLUT() {
    if (!this.cache.has('grade')) this.cache.set('grade', makeGradeLUT(16));
    return this.cache.get('grade');
  }

  dispose() {
    for (const value of this.cache.values()) {
      if (value?.dispose) value.dispose();
      else if (Array.isArray(value)) for (const v of value) v?.dispose?.();
      else if (value?.map?.dispose) {
        value.map.dispose();
        value.normalMap?.dispose();
        value.roughnessMap?.dispose();
      }
    }
    this.cache.clear();
  }

  get count() {
    return this.cache.size;
  }
}

export const SURFACE_KINDS = Object.keys(BIOME_PAINTERS);
