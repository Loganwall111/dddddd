/**
 * THE MULTIVERSE — render/shaders.js
 * ==================================================================
 * THE SHADER ATLAS. Rather than replacing three.js' lighting model, most
 * effects here are *injections* into MeshStandardMaterial (via onBeforeCompile)
 * so they keep shadows, fog, tone mapping and PBR for free:
 *
 *   terrain  — 4-way biome splatting with macro variation and detail normals
 *   foliage  — instanced wind, per-instance tint, distance fade
 *   ghost    — fresnel translucency used for the ascended state
 *
 * The rest are purpose-built ShaderMaterials for things three cannot do:
 * water/spray, portals, the black hole's accretion disk, the raymarched
 * fractal cathedral, nebula backdrops and particle systems.
 *
 * GLSL written for WebGL2 / GLSL ES 3.0 (three.js #version 300 es path).
 */
import { Color, DoubleSide, ShaderMaterial, Vector2, Vector3, Vector4, AdditiveBlending, NormalBlending } from 'three';

/* ------------------------------------------------------------------ *
 * Shared GLSL
 * ------------------------------------------------------------------ */

export const GLSL_COMMON = /* glsl */ `
float mv_hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}
float mv_hash2(vec2 p) {
  return fract(sin(dot(p, vec2(269.5, 183.3))) * 43758.5453123);
}
float mv_noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = mv_hash(i);
  float b = mv_hash(i + vec2(1.0, 0.0));
  float c = mv_hash(i + vec2(0.0, 1.0));
  float d = mv_hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
float mv_fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 5; i++) {
    v += a * mv_noise(p);
    p *= 2.03;
    a *= 0.5;
  }
  return v;
}
float mv_hash3(vec3 p) {
  return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453123);
}
float mv_noise3(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float n000 = mv_hash3(i);
  float n100 = mv_hash3(i + vec3(1.0, 0.0, 0.0));
  float n010 = mv_hash3(i + vec3(0.0, 1.0, 0.0));
  float n110 = mv_hash3(i + vec3(1.0, 1.0, 0.0));
  float n001 = mv_hash3(i + vec3(0.0, 0.0, 1.0));
  float n101 = mv_hash3(i + vec3(1.0, 0.0, 1.0));
  float n011 = mv_hash3(i + vec3(0.0, 1.0, 1.0));
  float n111 = mv_hash3(i + vec3(1.0, 1.0, 1.0));
  return mix(
    mix(mix(n000, n100, f.x), mix(n010, n110, f.x), f.y),
    mix(mix(n001, n101, f.x), mix(n011, n111, f.x), f.y),
    f.z
  );
}
float mv_fbm3(vec3 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    v += a * mv_noise3(p);
    p *= 2.06;
    a *= 0.5;
  }
  return v;
}
// Rotated-tangent frame so normal maps work on any surface orientation.
mat3 mv_tbn(vec3 n, vec3 p, vec2 uv) {
  vec3 dp1 = dFdx(p);
  vec3 dp2 = dFdy(p);
  vec2 duv1 = dFdx(uv);
  vec2 duv2 = dFdy(uv);
  vec3 dp2perp = cross(dp2, n);
  vec3 dp1perp = cross(n, dp1);
  vec3 T = dp2perp * duv1.x + dp1perp * duv2.x;
  vec3 B = dp2perp * duv1.y + dp1perp * duv2.y;
  float invmax = inversesqrt(max(dot(T, T), dot(B, B)));
  return mat3(T * invmax, B * invmax, n);
}
`;

/* ------------------------------------------------------------------ *
 * TERRAIN — 4-way biome splatting inside MeshStandardMaterial
 * ------------------------------------------------------------------ */

/**
 * The valley's ground shader.
 *
 * Geometry carries `aWeights` (vec4 = grass/rock/sand/snow weight) and
 * `color` (macro colour variation). The patch blends four full PBR surface
 * sets (albedo + normal + roughness) and adds:
 *   • macro noise so tiling never reads as a grid
 *   • slope-aware triplanar relief on steeps
 *   • distance-based detail fade (kills shimmer at range)
 *   • wetness darkening near water and in the rain
 */
export function patchTerrainMaterial(material, surfaces, options = {}) {
  const uniforms = {
    uTime: { value: 0 },
    uMacroScale: { value: options.macroScale ?? 0.0035 },
    uDetailFade: { value: options.detailFade ?? 220 },
    uWetness: { value: 0 },
    uSnowLine: { value: options.snowLine ?? 0.55 },
    uRepeat: { value: new Vector4(options.repeat0 ?? 60, options.repeat1 ?? 34, options.repeat2 ?? 48, options.repeat3 ?? 40) },
    uSlopeBlend: { value: options.slopeBlend ?? 0.55 },
  };
  const textureUniforms = {
    uMap1: { value: surfaces[1].map },
    uMap2: { value: surfaces[2].map },
    uMap3: { value: surfaces[3].map },
    uNormal1: { value: surfaces[1].normalMap },
    uRough1: { value: surfaces[1].roughnessMap },
  };

  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms, textureUniforms);

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        /* glsl */ `
        #include <common>
        attribute vec4 aWeights;
        varying vec4 vWeights;
        varying vec3 vWorldPosition;
        varying vec3 vTerrainNormal;
        `
      )
      .replace(
        '#include <begin_vertex>',
        /* glsl */ `
        #include <begin_vertex>
        vWeights = aWeights;
        #ifdef USE_INSTANCING
          vWorldPosition = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
          vTerrainNormal = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);
        #else
          vWorldPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;
          vTerrainNormal = normalize(mat3(modelMatrix) * normal);
        #endif
        `
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        /* glsl */ `
        #include <common>
        ${GLSL_COMMON}
        uniform float uTime;
        uniform float uMacroScale;
        uniform float uDetailFade;
        uniform float uWetness;
        uniform float uSlopeBlend;
        uniform vec4 uRepeat;
        uniform sampler2D uMap1;
        uniform sampler2D uMap2;
        uniform sampler2D uMap3;
        uniform sampler2D uNormal1;
        uniform sampler2D uRough1;
        varying vec4 vWeights;
        varying vec3 vWorldPosition;
        varying vec3 vTerrainNormal;
        float mv_macro(vec3 p) {
          float m = mv_fbm(p.xz * uMacroScale);
          m = mix(m, mv_fbm(p.xz * uMacroScale * 4.7 + 13.0), 0.35);
          return m;
        }
        `
      )
      .replace(
        '#include <map_fragment>',
        /* glsl */ `
        vec4 w = vWeights;
        w = max(w, vec4(0.0));
        float wSum = max(0.0001, w.x + w.y + w.z + w.w);
        w /= wSum;

        vec2 uv0 = vMapUv * uRepeat.x;
        vec4 albedo0 = texture2D(map, uv0);
        vec4 albedo1 = texture2D(uMap1, vMapUv * uRepeat.y);
        vec4 albedo2 = texture2D(uMap2, vMapUv * uRepeat.z);
        vec4 albedo3 = texture2D(uMap3, vMapUv * uRepeat.w);

        // macro variation breaks the tiling grid at every scale
        float macro = mv_macro(vWorldPosition);
        float macro2 = mv_fbm(vWorldPosition.xz * uMacroScale * 11.0);
        albedo0.rgb *= 0.86 + macro * 0.36;
        albedo1.rgb *= 0.82 + macro * 0.4;
        albedo2.rgb *= 0.9 + macro2 * 0.2;
        albedo3.rgb *= 0.94 + macro2 * 0.12;

        vec4 blended = albedo0 * w.x + albedo1 * w.y + albedo2 * w.z + albedo3 * w.w;

        // wetness darkens and saturates the ground
        float wet = clamp(uWetness * (0.55 + 0.45 * macro), 0.0, 1.0);
        blended.rgb = mix(blended.rgb, blended.rgb * vec3(0.52, 0.56, 0.62), wet);

        diffuseColor *= blended;
        `
      )
      .replace(
        '#include <roughnessmap_fragment>',
        /* glsl */ `
        float roughnessFactor = roughness;
        vec4 r0 = texture2D(roughnessMap, vMapUv * uRepeat.x);
        vec4 r1 = texture2D(uRough1, vMapUv * uRepeat.y);
        float rBlend = mix(r0.g, r1.g, w.y);
        roughnessFactor *= mix(1.0, rBlend, 0.85);
        roughnessFactor = mix(roughnessFactor, roughnessFactor * 0.45, wet);
        `
      )
      .replace(
        '#include <normal_fragment_maps>',
        /* glsl */ `
        mat3 terrainTbn = mv_tbn(normal, -vViewPosition, vMapUv);
        vec3 n0 = texture2D(normalMap, uv0).xyz * 2.0 - 1.0;
        vec3 n1 = texture2D(uNormal1, vMapUv * uRepeat.y).xyz * 2.0 - 1.0;
        vec3 nBlend = normalize(mix(n0, n1, w.y * 0.85));
        float detailFade = 1.0 - clamp(length(vViewPosition) / uDetailFade, 0.0, 1.0);
        nBlend.xy *= normalScale * mix(0.35, 1.0, detailFade);
        normal = normalize(terrainTbn * nBlend);
        `
      );
  };
  material.customProgramCacheKey = () => 'mv-terrain-splat';
  return uniforms;
}

/* ------------------------------------------------------------------ *
 * FOLIAGE — instanced wind + tint inside MeshStandardMaterial
 * ------------------------------------------------------------------ */

/**
 * Bend instanced foliage with pseudo-turbulent wind. The blade geometry
 * stores `aHeight` (0 at the root, 1 at the tip) and `aPhase` (per-blade
 * offset) so a whole meadow never moves in lockstep.
 */
export function patchFoliageMaterial(material, options = {}) {
  const uniforms = {
    uTime: { value: 0 },
    uWindDir: { value: new Vector2(options.windX ?? 1, options.windZ ?? 0.35).normalize() },
    uWindStrength: { value: options.windStrength ?? 0.35 },
    uGustStrength: { value: 0.6 },
    uFadeDistance: { value: options.fadeDistance ?? 240 },
    uSway: { value: options.sway ?? 1 },
  };
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        /* glsl */ `
        #include <common>
        attribute float aHeight;
        attribute float aPhase;
        uniform float uTime;
        uniform vec2 uWindDir;
        uniform float uWindStrength;
        uniform float uGustStrength;
        uniform float uFadeDistance;
        uniform float uSway;
        varying float vFade;
        varying float vTip;
        `
      )
      .replace(
        '#include <begin_vertex>',
        /* glsl */ `
        #include <begin_vertex>
        vTip = aHeight;
        #ifdef USE_INSTANCING
          vec3 instanceOrigin = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
        #else
          vec3 instanceOrigin = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
        #endif
        float gustPhase = dot(instanceOrigin.xz, uWindDir) * 0.028;
        float gust = sin(uTime * 0.9 - gustPhase) * 0.5 + 0.5;
        float flutter = sin(uTime * 3.1 + aPhase * 6.283 + instanceOrigin.x * 0.6) * 0.35;
        float bend = (uWindStrength + uGustStrength * gust * gust) * pow(aHeight, 1.35) * uSway;
        transformed.x += uWindDir.x * bend + flutter * aHeight * 0.12;
        transformed.z += uWindDir.y * bend + flutter * aHeight * 0.09;
        transformed.y -= abs(bend) * 0.28 * aHeight;
        `
      )
      .replace(
        '#include <fog_vertex>',
        /* glsl */ `
        #ifdef USE_FOG
          vFogDepth = -mvPosition.z;
        #endif
        float fadeDist = length(mvPosition.xyz);
        vFade = 1.0 - smoothstep(uFadeDistance * 0.72, uFadeDistance, fadeDist);
        `
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        /* glsl */ `
        #include <common>
        varying float vFade;
        varying float vTip;
        `
      )
      .replace(
        '#include <clipping_planes_fragment>',
        /* glsl */ `
        #include <clipping_planes_fragment>
        if (vFade <= 0.001) discard;
        diffuseColor.a *= vFade;
        // tips catch the light a little harder than the roots
        diffuseColor.rgb *= 0.88 + vTip * 0.24;
        `
      );
  };
  material.customProgramCacheKey = () => 'mv-foliage-wind';
  return uniforms;
}

/* ------------------------------------------------------------------ *
 * GHOST — the ascended state
 * ------------------------------------------------------------------ */

export function patchGhostMaterial(material, options = {}) {
  const uniforms = {
    uGhostTime: { value: 0 },
    uGhostStrength: { value: options.strength ?? 1 },
    uGhostColor: { value: new Color(options.color ?? 0xbfe6ff) },
  };
  material.transparent = true;
  material.depthWrite = false;
  material.side = DoubleSide;
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        /* glsl */ `
        #include <common>
        uniform float uGhostTime;
        uniform float uGhostStrength;
        uniform vec3 uGhostColor;
        `
      )
      .replace(
        '#include <dithering_fragment>',
        /* glsl */ `
        #include <dithering_fragment>
        float rim = 1.0 - abs(dot(normalize(vNormal), normalize(vViewPosition)));
        float pulse = 0.82 + 0.18 * sin(uGhostTime * 2.2 + vViewPosition.y * 0.35);
        gl_FragColor.rgb = mix(gl_FragColor.rgb, uGhostColor, 0.35 * uGhostStrength * pulse);
        gl_FragColor.a *= clamp(0.24 + rim * 0.9, 0.0, 1.0) * pulse * uGhostStrength;
        `
      );
  };
  material.customProgramCacheKey = () => 'mv-ghost';
  return uniforms;
}

/* ------------------------------------------------------------------ *
 * WATER — lakes and oceans (flat-mirror reflections + refraction)
 * ------------------------------------------------------------------ */

/**
 * Water surface built on three's own Water addon conventions: a planar
 * reflection render target (`mirrorSampler`) sampled with distortion, a sun
 * specular lobe, fresnel-blended depth colour and shoreline foam.
 *
 * Two scrolling normal maps at different scales give the sense of moving
 * water without ever repeating visibly.
 */
export function createWaterMaterial(textures, options = {}) {
  const uniforms = {
    uTime: { value: 0 },
    uNormalMap: { value: textures.normalMap },
    uNormalScale: { value: new Vector2(options.normalScale ?? 0.55, options.normalScale ?? 0.55) },
    uDeepColor: { value: new Color(options.deepColor ?? 0x06283d) },
    uShallowColor: { value: new Color(options.shallowColor ?? 0x2e8fa6) },
    uFoamColor: { value: new Color(options.foamColor ?? 0xdff3ff) },
    uSunColor: { value: new Color(options.sunColor ?? 0xfff0d0) },
    uSunDirection: { value: new Vector3(0.4, 0.8, 0.2).normalize() },
    uSunPower: { value: options.sunPower ?? 220 },
    uDistortionScale: { value: options.distortionScale ?? 0.032 },
    uDistortionSpeed: { value: options.distortionSpeed ?? 0.45 },
    uMirrorSampler: { value: options.mirrorSampler ?? null },
    uTextureMatrix: { value: options.textureMatrix ?? null },
    uOpacity: { value: options.opacity ?? 1 },
    uFogColor: { value: new Color(0xbfd6e6) },
    uFogDensity: { value: 0.0018 },
    uFoamMask: { value: options.foamMask ?? null },
    uWaveHeight: { value: options.waveHeight ?? 0.35 },
    uFresnelBias: { value: options.fresnelBias ?? 0.08 },
    uFresnelPower: { value: options.fresnelPower ?? 3.2 },
    uReflectionStrength: { value: options.reflectionStrength ?? 1 },
    uShoreline: { value: options.shoreline ?? 0.0 },
    uUnderwater: { value: 0 },
  };

  const material = new ShaderMaterial({
    uniforms,
    transparent: true,
    side: DoubleSide,
    fog: false,
    vertexShader: /* glsl */ `
      uniform float uTime;
      uniform sampler2D uNormalMap;
      uniform vec2 uNormalScale;
      uniform float uWaveHeight;
      uniform mat4 uTextureMatrix;
      varying vec2 vUv;
      varying vec3 vWorldPosition;
      varying vec4 vMirrorCoord;
      varying vec3 vViewPosition;
      #include <fog_pars_vertex>

      void main() {
        vUv = uv;
        vec3 displaced = position;
        // Gentle vertex waves so the surface silhouette is never razor flat.
        float w1 = sin(position.x * 0.06 + uTime * 0.7) * cos(position.z * 0.05 - uTime * 0.5);
        float w2 = sin(position.x * 0.021 - uTime * 0.31 + position.z * 0.017) * 0.6;
        displaced.y += (w1 + w2) * uWaveHeight;
        vec4 worldPosition = modelMatrix * vec4(displaced, 1.0);
        vWorldPosition = worldPosition.xyz;
        vMirrorCoord = uTextureMatrix * worldPosition;
        vec4 mvPosition = viewMatrix * worldPosition;
        vViewPosition = -mvPosition.xyz;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }
    `,
    fragmentShader: /* glsl */ `
      precision highp float;
      uniform float uTime;
      uniform sampler2D uNormalMap;
      uniform sampler2D uMirrorSampler;
      uniform sampler2D uFoamMask;
      uniform vec2 uNormalScale;
      uniform vec3 uDeepColor;
      uniform vec3 uShallowColor;
      uniform vec3 uFoamColor;
      uniform vec3 uSunColor;
      uniform vec3 uSunDirection;
      uniform float uSunPower;
      uniform float uDistortionScale;
      uniform float uDistortionSpeed;
      uniform float uOpacity;
      uniform float uFresnelBias;
      uniform float uFresnelPower;
      uniform float uReflectionStrength;
      uniform float uShoreline;
      uniform float uUnderwater;
      uniform vec3 uFogColor;
      uniform float uFogDensity;
      varying vec2 vUv;
      varying vec3 vWorldPosition;
      varying vec4 vMirrorCoord;
      varying vec3 vViewPosition;
      #include <fog_pars_fragment>
      ${GLSL_COMMON}

      vec3 sampleWaterNormal(vec2 uv, float t) {
        vec3 n1 = texture2D(uNormalMap, uv * 0.18 + vec2(t * 0.013, t * 0.009)).xyz * 2.0 - 1.0;
        vec3 n2 = texture2D(uNormalMap, uv * 0.41 - vec2(t * 0.021, -t * 0.016)).xyz * 2.0 - 1.0;
        vec3 n3 = texture2D(uNormalMap, uv * 1.13 + vec2(-t * 0.05, t * 0.037)).xyz * 2.0 - 1.0;
        vec3 n = normalize(n1 * 0.55 + n2 * 0.32 + n3 * 0.22);
        n.xy *= uNormalScale;
        return normalize(n);
      }

      void main() {
        float t = uTime;
        // Two distortion passes, as in real geo-water: a slow swell plus fast chop.
        vec3 viewDir = normalize(vViewPosition);
        vec3 normalW = sampleWaterNormal(vWorldPosition.xz * 0.02, t * uDistortionSpeed);
        vec3 normalW2 = sampleWaterNormal(vWorldPosition.xz * 0.055 + 4.0, t * uDistortionSpeed * 1.7);

        vec2 distortion = (normalW.xy * 0.7 + normalW2.xy * 0.3) * uDistortionScale;
        vec2 mirrorUv = vMirrorCoord.xy / max(0.0001, vMirrorCoord.w);
        vec3 reflection = texture2D(uMirrorSampler, mirrorUv + distortion).rgb;

        // Fresnel: nearly transparent looking straight down, mirror-like at grazing angles.
        vec3 N = normalize(mix(vec3(0.0, 1.0, 0.0), normalW, 0.85));
        float fresnel = uFresnelBias + pow(1.0 - max(dot(viewDir, N), 0.0), uFresnelPower);

        float depthFactor = clamp(1.0 - vWorldPosition.y * 0.06 + 0.35, 0.0, 1.0);
        vec3 waterBody = mix(uShallowColor, uDeepColor, depthFactor);

        // Sun specular — the sparkle that makes water read as water.
        vec3 sunDir = normalize(uSunDirection);
        vec3 halfVec = normalize(sunDir + viewDir);
        float spec = pow(max(dot(N, halfVec), 0.0), uSunPower);
        vec3 sparkle = uSunColor * spec * 2.6;

        vec3 color = mix(waterBody, reflection * uReflectionStrength, clamp(fresnel, 0.0, 1.0));
        color += sparkle;

        // Shoreline foam where the surface meets terrain (uShoreline is
        // supplied per-frame from the depth/shore mask).
        float foamNoise = texture2D(uFoamMask, vWorldPosition.xz * 0.012 + vec2(t * 0.01, -t * 0.008)).r;
        float foam = smoothstep(0.55, 0.95, uShoreline + foamNoise * 0.28 - 0.12);
        color = mix(color, uFoamColor, clamp(foam, 0.0, 0.75));

        // Underwater: fade to the deep colour and kill reflections.
        color = mix(color, uDeepColor * 0.6, uUnderwater);

        float dist = length(vViewPosition);
        float fogFactor = 1.0 - exp(-uFogDensity * dist);
        color = mix(color, uFogColor, clamp(fogFactor, 0.0, 1.0) * (1.0 - uUnderwater * 0.4));

        gl_FragColor = vec4(color, uOpacity);
        #include <colorspace_fragment>
        #include <fog_fragment>
      }
    `,
  });
  material.customProgramCacheKey = () => 'mv-water';
  return material;
}

/* ------------------------------------------------------------------ *
 * WATERFALLS — vertical sheets of falling water
 * ------------------------------------------------------------------ */

/**
 * A cliff waterfall: scrolling multi-layer water with velocity-stretched
 * noise, additive spray at the impact line and a soft mist skirt. Rendered
 * as a slightly curved sheet hanging off the cliff face.
 */
export function createWaterfallMaterial(options = {}) {
  const uniforms = {
    uTime: { value: 0 },
    uSpeed: { value: options.speed ?? 0.85 },
    uColor: { value: new Color(options.color ?? 0xdff0ff) },
    uDeepColor: { value: new Color(options.deepColor ?? 0x8fc2e0) },
    uMistColor: { value: new Color(options.mistColor ?? 0xffffff) },
    uHeight: { value: options.height ?? 120 },
    uWidth: { value: options.width ?? 24 },
    uOpacity: { value: options.opacity ?? 0.92 },
    uFoam: { value: options.foam ?? 1 },
    uFlowMap: { value: options.flowMap ?? null },
    uUnderwater: { value: 0 },
  };
  const material = new ShaderMaterial({
    uniforms,
    transparent: true,
    side: DoubleSide,
    depthWrite: false,
    fog: false,
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      varying vec3 vWorldPosition;
      varying vec3 vViewPosition;
      uniform float uTime;
      uniform float uSpeed;
      #include <fog_pars_vertex>
      void main() {
        vUv = uv;
        vec3 displaced = position;
        // The sheet bulges in the middle and tapers at the lip.
        float bulge = sin(uv.y * 3.14159) * 0.35;
        displaced.z += bulge * 2.0;
        displaced.x += sin(uv.y * 6.0 + uTime * 1.4) * 0.22;
        vec4 worldPosition = modelMatrix * vec4(displaced, 1.0);
        vWorldPosition = worldPosition.xyz;
        vec4 mvPosition = viewMatrix * worldPosition;
        vViewPosition = -mvPosition.xyz;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }
    `,
    fragmentShader: /* glsl */ `
      precision highp float;
      uniform float uTime;
      uniform float uSpeed;
      uniform vec3 uColor;
      uniform vec3 uDeepColor;
      uniform vec3 uMistColor;
      uniform float uHeight;
      uniform float uOpacity;
      uniform float uFoam;
      uniform float uUnderwater;
      uniform sampler2D uFlowMap;
      varying vec2 vUv;
      varying vec3 vWorldPosition;
      varying vec3 vViewPosition;
      ${GLSL_COMMON}

      void main() {
        float t = uTime * uSpeed;
        // Vertical scrolling water with three frequencies of detail.
        vec2 flowUv = vec2(vUv.x * 3.0, vUv.y * 9.0 - t * 2.6);
        float streaks = mv_fbm(flowUv * vec2(1.2, 0.55));
        float threads = mv_fbm(flowUv * vec2(4.0, 1.4) + vec2(0.0, -t * 1.4));
        float gush = mv_noise(vec2(vUv.x * 22.0, vUv.y * 6.0 - t * 5.0));

        float density = streaks * 0.55 + threads * 0.32 + gush * 0.22;
        density = smoothstep(0.18, 0.92, density);

        // Thin the sheet as it falls and aerate it near the bottom.
        float aerate = smoothstep(0.55, 0.05, vUv.y);
        vec3 color = mix(uDeepColor, uColor, clamp(vUv.y * 0.8 + 0.35, 0.0, 1.0));
        color = mix(color, uMistColor, aerate * 0.55);
        color += mv_noise(vec2(vUv.x * 60.0, vUv.y * 30.0 - t * 9.0)) * 0.12;

        float lipFoam = smoothstep(0.02, 0.14, 1.0 - vUv.y) * uFoam;
        float alpha = clamp(density * 0.85 + aerate * 0.35 + lipFoam * 0.6, 0.0, 1.0) * uOpacity;

        // Soft edge fade so the sheet never shows a hard silhouette against sky.
        float edge = smoothstep(0.0, 0.08, vUv.x) * smoothstep(1.0, 0.92, vUv.x);
        alpha *= mix(0.75, 1.0, edge);

        vec3 viewDir = normalize(vViewPosition);
        float rim = pow(1.0 - abs(viewDir.y), 2.0);
        color += rim * 0.12;

        alpha *= mix(1.0, 0.7, uUnderwater);
        gl_FragColor = vec4(color, alpha);
        #include <colorspace_fragment>
      }
    `,
  });
  material.customProgramCacheKey = () => 'mv-waterfall';
  return material;
}

/* ------------------------------------------------------------------ *
 * PORTALS — doorways between realities
 * ------------------------------------------------------------------ */

export function createPortalMaterial(options = {}) {
  const uniforms = {
    uTime: { value: 0 },
    uColorA: { value: new Color(options.colorA ?? 0x6ff0ff) },
    uColorB: { value: new Color(options.colorB ?? 0xb96cff) },
    uColorC: { value: new Color(options.colorC ?? 0xffe6a8) },
    uOpenness: { value: 0 },
    uRadius: { value: options.radius ?? 1 },
    uSwirl: { value: options.swirl ?? 1 },
    uNoiseScale: { value: options.noiseScale ?? 3.4 },
    uStarfield: { value: options.starfield ?? 0 },
    uOpacity: { value: options.opacity ?? 1 },
  };
  const material = new ShaderMaterial({
    uniforms,
    transparent: true,
    side: DoubleSide,
    depthWrite: false,
    blending: AdditiveBlending,
    fog: false,
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      varying vec3 vPosition;
      varying vec3 vViewPosition;
      void main() {
        vUv = uv;
        vPosition = position;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        vViewPosition = -mvPosition.xyz;
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: /* glsl */ `
      precision highp float;
      uniform float uTime;
      uniform vec3 uColorA;
      uniform vec3 uColorB;
      uniform vec3 uColorC;
      uniform float uOpenness;
      uniform float uSwirl;
      uniform float uNoiseScale;
      uniform float uStarfield;
      uniform float uOpacity;
      varying vec2 vUv;
      varying vec3 vPosition;
      varying vec3 vViewPosition;
      ${GLSL_COMMON}

      void main() {
        vec2 centered = vUv * 2.0 - 1.0;
        float r = length(centered);
        if (r > 1.0) discard;
        float angle = atan(centered.y, centered.x);

        // Swirl: sample polar noise so the energy rotates inward.
        float swirlAngle = angle + (1.0 - r) * 4.5 * uSwirl - uTime * 0.6;
        vec2 polar = vec2(cos(swirlAngle), sin(swirlAngle)) * (0.35 + r * 0.9);
        float e1 = mv_fbm(polar * uNoiseScale + vec2(uTime * 0.25, -uTime * 0.18));
        float e2 = mv_fbm(polar * uNoiseScale * 2.7 - vec2(uTime * 0.4, uTime * 0.22));
        float plasma = e1 * 0.62 + e2 * 0.38;

        // A vertical lens flare through the middle of the doorway.
        float core = smoothstep(0.85, 0.0, r);
        float iris = smoothstep(1.0, 0.72, r);

        vec3 color = mix(uColorA, uColorB, plasma);
        color = mix(color, uColorC, core * 0.75);
        color *= 0.6 + core * 1.5;

        if (uStarfield > 0.01) {
          float star = step(0.995, mv_hash(polar * 42.0 + floor(uTime * 2.0)));
          color += vec3(star) * uStarfield;
        }

        float alpha = (iris * (0.35 + plasma * 0.75) + core * 0.6) * uOpenness * uOpacity;
        gl_FragColor = vec4(color, clamp(alpha, 0.0, 1.0));
        #include <colorspace_fragment>
      }
    `,
  });
  material.customProgramCacheKey = () => 'mv-portal';
  return material;
}

/* ------------------------------------------------------------------ *
 * BLACK HOLE — accretion disk + photon ring
 * ------------------------------------------------------------------ */

export function createBlackHoleMaterial(options = {}) {
  const uniforms = {
    uTime: { value: 0 },
    uDiskColorHot: { value: new Color(options.hot ?? 0xfff2c4) },
    uDiskColorCool: { value: new Color(options.cool ?? 0xff6a1e) },
    uRingColor: { value: new Color(options.ring ?? 0xbfd8ff) },
    uSpin: { value: options.spin ?? 1 },
    uIntensity: { value: options.intensity ?? 1 },
    uHorizon: { value: options.horizon ?? 1 },
  };
  const material = new ShaderMaterial({
    uniforms,
    transparent: true,
    side: DoubleSide,
    depthWrite: false,
    fog: false,
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      varying vec3 vViewPosition;
      varying vec3 vNormalW;
      void main() {
        vUv = uv;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        vViewPosition = -mvPosition.xyz;
        vNormalW = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: /* glsl */ `
      precision highp float;
      uniform float uTime;
      uniform vec3 uDiskColorHot;
      uniform vec3 uDiskColorCool;
      uniform vec3 uRingColor;
      uniform float uSpin;
      uniform float uIntensity;
      uniform float uHorizon;
      varying vec2 vUv;
      varying vec3 vViewPosition;
      varying vec3 vNormalW;
      ${GLSL_COMMON}

      void main() {
        vec2 centered = vUv * 2.0 - 1.0;
        float r = length(centered);
        float angle = atan(centered.y, centered.x);

        // The event horizon: absolute black with a razor-thin photon ring.
        float horizonRadius = 0.42 * uHorizon;
        float horizon = smoothstep(horizonRadius, horizonRadius - 0.02, r);
        float photonRing = exp(-pow((r - horizonRadius * 1.06) * 46.0, 2.0));
        float ring2 = exp(-pow((r - horizonRadius * 1.32) * 26.0, 2.0)) * 0.35;

        // Accretion disk: differential rotation, hot inside, cool outside.
        float diskMask = smoothstep(1.0, 0.85, r) * smoothstep(horizonRadius * 1.02, horizonRadius * 1.4, r);
        float rot = angle + uTime * uSpin * (1.9 / max(0.22, r));
        vec2 diskUv = vec2(cos(rot), sin(rot)) * r * 7.0;
        float lanes = mv_fbm(diskUv * vec2(1.0, 3.2) + vec2(uTime * 0.1, 0.0));
        float turbulence = mv_fbm(diskUv * 2.6 - vec2(0.0, uTime * 0.16));
        float heat = clamp(1.0 - (r - horizonRadius) * 1.4, 0.0, 1.0);
        vec3 diskColor = mix(uDiskColorCool, uDiskColorHot, heat * (0.55 + lanes * 0.6));
        diskColor *= 0.35 + lanes * 0.9 + turbulence * 0.5;

        // Doppler brightening on the approaching side.
        float doppler = 0.6 + 0.8 * smoothstep(-1.0, 1.0, -centered.x);
        diskColor *= mix(1.0, doppler, 0.7);

        vec3 color = diskColor * diskMask * uIntensity;
        color += uRingColor * (photonRing * 1.6 + ring2) * uIntensity;
        color *= (1.0 - horizon * 0.98);

        float alpha = clamp(diskMask * 0.92 + photonRing + ring2 + horizon * 0.96, 0.0, 1.0);
        gl_FragColor = vec4(color, alpha);
        #include <colorspace_fragment>
      }
    `,
  });
  material.customProgramCacheKey = () => 'mv-blackhole';
  return material;
}

/* ------------------------------------------------------------------ *
 * FRACTAL CATHEDRAL — raymarched distance-estimated geometry
 * ------------------------------------------------------------------ */

/**
 * The fractal realm's architecture is not a mesh: it is a distance field,
 * rendered by sphere-tracing through a "mandelbox"-style fold. Three octaves
 * of scale symmetry give a cathedral that repeats infinitely in every
 * direction and never repeats exactly.
 */
export function createFractalMaterial(options = {}) {
  const uniforms = {
    uTime: { value: 0 },
    uCameraLocal: { value: new Vector3() },
    uColorA: { value: new Color(options.colorA ?? 0xff56c8) },
    uColorB: { value: new Color(options.colorB ?? 0x6f4bff) },
    uColorC: { value: new Color(options.colorC ?? 0x2a0b3f) },
    uScale: { value: options.scale ?? 1.9 },
    uSteps: { value: options.steps ?? 56 },
    uGlow: { value: options.glow ?? 1 },
    uIterations: { value: options.iterations ?? 5 },
  };
  const material = new ShaderMaterial({
    uniforms,
    transparent: true,
    side: DoubleSide,
    depthWrite: false,
    fog: false,
    vertexShader: /* glsl */ `
      varying vec3 vLocalPosition;
      varying vec3 vWorldPosition;
      varying vec3 vViewPosition;
      void main() {
        vLocalPosition = position;
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPosition.xyz;
        vec4 mvPosition = viewMatrix * worldPosition;
        vViewPosition = -mvPosition.xyz;
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: /* glsl */ `
      precision highp float;
      uniform float uTime;
      uniform vec3 uCameraLocal;
      uniform vec3 uColorA;
      uniform vec3 uColorB;
      uniform vec3 uColorC;
      uniform float uScale;
      uniform float uGlow;
      uniform int uIterations;
      varying vec3 vLocalPosition;
      varying vec3 vWorldPosition;
      varying vec3 vViewPosition;
      ${GLSL_COMMON}

      // Mandelbox-flavoured fold: box fold then sphere fold, repeated.
      float mv_fold(vec3 p) {
        vec3 z = p;
        float scale = uScale;
        float minRadius2 = 0.35;
        float fixedRadius2 = 1.0;
        float dr = 1.0;
        float bailout = 6.0;
        float distance = 0.0;
        for (int i = 0; i < 6; i++) {
          if (i >= uIterations) break;
          z = clamp(z, -1.0, 1.0) * 2.0 - z;
          float r2 = dot(z, z);
          if (r2 < minRadius2) {
            float t = fixedRadius2 / minRadius2;
            z *= t;
            dr *= t;
          } else if (r2 < fixedRadius2) {
            float t = fixedRadius2 / r2;
            z *= t;
            dr *= t;
          }
          z = z * scale + p;
          dr = dr * abs(scale) + 1.0;
          distance = length(z) / abs(dr);
          if (dot(z, z) > bailout * bailout) break;
        }
        return max(distance, 0.0008);
      }

      float mv_map(vec3 p) {
        p = p * 0.75 + vec3(0.0, sin(uTime * 0.05) * 0.05, 0.0);
        float d = mv_fold(p);
        // Carve the cathedral: subtract vertical shafts, add floor slabs.
        float shafts = 0.5 - abs(fract(p.x * 0.5) - 0.5) * 0.4;
        float slabs = 0.5 - abs(fract(p.y * 0.25) - 0.5) * 0.35;
        d = max(d, -max(shafts, slabs) * 0.25);
        return d;
      }

      vec3 mv_normal(vec3 p) {
        vec2 e = vec2(0.0015, 0.0);
        return normalize(vec3(
          mv_map(p + e.xyy) - mv_map(p - e.xyy),
          mv_map(p + e.yxy) - mv_map(p - e.yxy),
          mv_map(p + e.yyx) - mv_map(p - e.yyx)
        ));
      }

      void main() {
        vec3 rayOrigin = uCameraLocal;
        vec3 rayDir = normalize(vLocalPosition - rayOrigin);
        float t = 0.05;
        float traveled = 0.0;
        float hit = 0.0;
        float glow = 0.0;
        for (int i = 0; i < 96; i++) {
          if (i >= int(uSteps)) break;
          vec3 p = rayOrigin + rayDir * t;
          float d = mv_map(p);
          glow += 0.008 / (0.02 + d * d * 6.0);
          if (d < 0.0018 * t) {
            hit = 1.0;
            break;
          }
          t += d * 0.92;
          traveled = t;
          if (t > 90.0) break;
        }

        vec3 hitPos = rayOrigin + rayDir * t;
        vec3 n = hit > 0.5 ? mv_normal(hitPos) : vec3(0.0, 1.0, 0.0);
        float ao = clamp(1.0 - float(0) * 0.0, 0.0, 1.0);
        // Multi-scale colour banding reads as architecture at every zoom.
        float band = fract(length(hitPos) * 0.35 + uTime * 0.02);
        vec3 base = mix(uColorC, mix(uColorB, uColorA, band), clamp(dot(n, vec3(0.0, 1.0, 0.0)) * 0.5 + 0.6, 0.0, 1.0));
        base *= 0.55 + 0.65 * max(dot(n, normalize(vec3(0.4, 0.85, 0.3))), 0.0);
        base *= ao;

        vec3 color = mix(vec3(0.02, 0.01, 0.05), base, hit);
        color += uColorA * glow * 0.5 * uGlow;
        float alpha = clamp(hit * 0.96 + glow * 0.12, 0.0, 1.0);
        gl_FragColor = vec4(color, alpha);
        #include <colorspace_fragment>
      }
    `,
  });
  material.customProgramCacheKey = () => 'mv-fractal';
  return material;
}

/* ------------------------------------------------------------------ *
 * SKY — nebula backdrop and raymarched clouds
 * ------------------------------------------------------------------ */

export function createNebulaMaterial(textures, options = {}) {
  const uniforms = {
    uTime: { value: 0 },
    uNebula: { value: textures.nebula ?? null },
    uTint: { value: new Color(options.tint ?? 0x8f7bff) },
    uIntensity: { value: options.intensity ?? 1 },
    uRotation: { value: options.rotation ?? 0 },
  };
  const material = new ShaderMaterial({
    uniforms,
    side: DoubleSide,
    depthWrite: false,
    fog: false,
    vertexShader: /* glsl */ `
      varying vec3 vDirection;
      void main() {
        vDirection = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      precision highp float;
      uniform float uTime;
      uniform sampler2D uNebula;
      uniform vec3 uTint;
      uniform float uIntensity;
      uniform float uRotation;
      varying vec3 vDirection;
      ${GLSL_COMMON}

      void main() {
        vec3 dir = normalize(vDirection);
        float c = cos(uRotation);
        float s = sin(uRotation);
        vec2 spherical = vec2(atan(dir.z, dir.x) / 6.2831853 + 0.5, asin(clamp(dir.y, -1.0, 1.0)) / 3.1415926 + 0.5);
        vec2 rotated = vec2(spherical.x * c - spherical.y * s, spherical.x * s + spherical.y * c);

        vec3 nebula = texture2D(uNebula, rotated * vec2(1.6, 0.9)).rgb;
        nebula *= uTint;

        // The galactic band: a dense strip of dust across the sky.
        float band = exp(-pow((dir.y + 0.12 * sin(dir.x * 2.0)) * 5.4, 2.0));
        float dust = texture2D(uNebula, rotated * vec2(4.0, 2.2) + vec2(uTime * 0.0008, 0.0)).r;
        vec3 galactic = mix(vec3(0.32, 0.36, 0.5), vec3(0.85, 0.82, 0.95), dust) * band * 0.55;

        vec3 color = (nebula * 0.35 + galactic) * uIntensity;
        gl_FragColor = vec4(color, 1.0);
        #include <colorspace_fragment>
      }
    `,
  });
  material.customProgramCacheKey = () => 'mv-nebula';
  return material;
}

/**
 * Volumetric clouds: a hemispherical shell raymarched against a 3D noise
 * texture, with a real light march for self-shadowing (the powder effect)
 * and two "sun" directions because this world has two suns.
 */
export function createCloudMaterial(textures, options = {}) {
  const uniforms = {
    uTime: { value: 0 },
    uNoise: { value: textures.cloudNoise ?? null },
    uCoverage: { value: options.coverage ?? 0.46 },
    uDensity: { value: options.density ?? 0.85 },
    uSunDir: { value: new Vector3(0.35, 0.55, -0.6).normalize() },
    uSunColor: { value: new Color(options.sunColor ?? 0xfff0d0) },
    uSun2Dir: { value: new Vector3(-0.5, 0.35, 0.7).normalize() },
    uSun2Color: { value: new Color(options.sun2Color ?? 0xffc0a0) },
    uSkyColor: { value: new Color(options.skyColor ?? 0x9dc4e8) },
    uHorizonColor: { value: new Color(options.horizonColor ?? 0xd8e6f2) },
    uGroundColor: { value: new Color(options.groundColor ?? 0x63705f) },
    uWind: { value: new Vector3(0.006, 0.0004, 0.0035) },
    uSteps: { value: options.steps ?? 40 },
    uLightSteps: { value: options.lightSteps ?? 4 },
    uShellHeight: { value: options.shellHeight ?? 1.6 },
    uIntensity: { value: options.intensity ?? 1 },
    uHeightFalloff: { value: options.heightFalloff ?? 3.4 },
  };

  const defines = { CLOUD_STEPS: Math.max(4, Math.round(uniforms.uSteps.value)), LIGHT_STEPS: Math.max(1, Math.round(uniforms.uLightSteps.value)) };

  const material = new ShaderMaterial({
    uniforms,
    defines,
    side: DoubleSide,
    transparent: true,
    depthWrite: false,
    fog: false,
    vertexShader: /* glsl */ `
      varying vec3 vLocalPosition;
      varying vec3 vWorldPosition;
      void main() {
        vLocalPosition = position;
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPosition.xyz;
        gl_Position = projectionMatrix * viewMatrix * worldPosition;
      }
    `,
    fragmentShader: /* glsl */ `
      precision highp float;
      uniform float uTime;
      uniform sampler3D uNoise;
      uniform float uCoverage;
      uniform float uDensity;
      uniform vec3 uSunDir;
      uniform vec3 uSunColor;
      uniform vec3 uSun2Dir;
      uniform vec3 uSun2Color;
      uniform vec3 uSkyColor;
      uniform vec3 uHorizonColor;
      uniform vec3 uGroundColor;
      uniform vec3 uWind;
      uniform float uShellHeight;
      uniform float uIntensity;
      uniform float uHeightFalloff;
      varying vec3 vLocalPosition;
      varying vec3 vWorldPosition;
      ${GLSL_COMMON}

      // Sample the 3D noise in three dimensions plus a scrolling offset.
      float cloudDensity(vec3 p, float level) {
        vec3 uvw = p * 0.5 + 0.5 + uWind * uTime;
        vec4 base = texture(uNoise, uvw);
        float density = base.r;
        float detail = base.g;
        // Vertical profile: clouds live in a slab with soft edges.
        float profile = smoothstep(0.0, 0.35, level) * smoothstep(1.0, 0.55, level);
        density = density - (1.0 - uCoverage) - (1.0 - profile) * uHeightFalloff * 0.35;
        density = max(density, 0.0) * uDensity;
        density += max(detail - 0.55, 0.0) * 0.35 * uDensity * smoothstep(0.1, 0.4, level);
        return clamp(density, 0.0, 1.0);
      }

      float lightMarch(vec3 p, float level, vec3 sunDir) {
        float shadow = 0.0;
        float stepSize = 0.045;
        for (int i = 0; i < LIGHT_STEPS; i++) {
          vec3 sp = p + sunDir * stepSize * float(i + 1);
          shadow += cloudDensity(sp, level);
        }
        return exp(-shadow * 1.6);
      }

      void main() {
        vec3 rayOrigin = cameraPosition;
        vec3 rayDir = normalize(vWorldPosition - cameraPosition);

        // The cloud deck is a fixed world-space slab so that flying above it
        // looks exactly as it should: a sea of cloud below the aircraft.
        float baseY = uShellHeight * 620.0;
        float topY = baseY + uShellHeight * 620.0;
        float denom = rayDir.y;
        if (abs(denom) < 0.00002) denom = 0.00002 * sign(denom == 0.0 ? 1.0 : denom);
        float t0 = (baseY - rayOrigin.y) / denom;
        float t1 = (topY - rayOrigin.y) / denom;
        float tStart = max(0.0, min(t0, t1));
        float tEnd = max(t0, t1);
        if (tEnd <= 0.0 || tStart > 26000.0) {
          gl_FragColor = vec4(0.0, 0.0, 0.0, 0.0);
          return;
        }
        tEnd = min(tEnd, tStart + 26000.0);

        float span = max(0.0, tEnd - tStart);
        float dt = span / float(CLOUD_STEPS);
        float transmittance = 1.0;
        vec3 scattered = vec3(0.0);
        float band = max(1.0, topY - baseY);

        for (int i = 0; i < CLOUD_STEPS; i++) {
          float t = tStart + dt * (float(i) + 0.5);
          vec3 p = rayOrigin + rayDir * t;
          float level = clamp((p.y - baseY) / band, 0.0, 1.0);
          float density = cloudDensity(p, level);
          if (density > 0.001) {
            float lightMain = lightMarch(p, level, normalize(uSunDir));
            float lightSecond = lightMarch(p, level, normalize(uSun2Dir));
            float powder = 1.0 - exp(-density * 3.0);
            vec3 lit = uSunColor * lightMain * 1.25 + uSun2Color * lightSecond * 0.65;
            vec3 ambient = mix(uSkyColor, uHorizonColor, 0.4) * 0.55 + uGroundColor * 0.18;
            vec3 sampleColor = (lit * powder + ambient) * uIntensity;
            float extinction = exp(-density * dt * 0.42);
            float alpha = 1.0 - extinction;
            scattered += sampleColor * alpha * transmittance;
            transmittance *= 1.0 - alpha;
            if (transmittance < 0.01) break;
          }
        }

        float alpha = clamp(1.0 - transmittance, 0.0, 1.0);
        gl_FragColor = vec4(scattered, alpha);
        #include <colorspace_fragment>
      }
    `,
  });
  material.customProgramCacheKey = () => 'mv-clouds';
  return material;
}

/* ------------------------------------------------------------------ *
 * PARTICLES / SPRITES
 * ------------------------------------------------------------------ */

export function createSpriteMaterial(texture, options = {}) {
  const uniforms = {
    uTime: { value: 0 },
    uMap: { value: texture },
    uColor: { value: new Color(options.color ?? 0xffffff) },
    uOpacity: { value: options.opacity ?? 1 },
    uSoftness: { value: options.softness ?? 1 },
    uEmissive: { value: options.emissive ?? 1 },
    // These three must exist before the first compile. A GLSL uniform with no
    // value is zero, and gl_PointSize = 0 makes every particle invisible —
    // rain, mist, embers, stars, breath.
    uPixelRatio: { value: options.pixelRatio ?? 1 },
    uFogDensity: { value: options.fogDensity ?? 0.0018 },
    uFogColor: { value: new Color(options.fogColor ?? 0xbfd6e6) },
  };
  const material = new ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    blending: options.additive === false ? NormalBlending : AdditiveBlending,
    vertexShader: /* glsl */ `
      attribute float aSize;
      attribute float aOpacity;
      attribute vec3 aColor;
      varying float vOpacity;
      varying vec3 vColor;
      varying float vFog;
      uniform float uTime;
      uniform float uPixelRatio;
      #include <fog_pars_vertex>
      void main() {
        vColor = aColor;
        vOpacity = aOpacity;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        gl_PointSize = aSize * uPixelRatio * (300.0 / max(1.0, -mvPosition.z));
        vFog = -mvPosition.z;
        #include <fog_vertex>
      }
    `,
    fragmentShader: /* glsl */ `
      precision highp float;
      uniform sampler2D uMap;
      uniform vec3 uColor;
      uniform float uOpacity;
      uniform float uSoftness;
      uniform float uEmissive;
      uniform float uFogDensity;
      uniform vec3 uFogColor;
      varying float vOpacity;
      varying vec3 vColor;
      varying float vFog;
      #include <fog_pars_fragment>
      void main() {
        vec4 tex = texture2D(uMap, gl_PointCoord);
        if (tex.a < 0.01) discard;
        float alpha = tex.a * vOpacity * uOpacity;
        alpha = pow(alpha, uSoftness);
        vec3 color = tex.rgb * uColor * vColor * (1.0 + uEmissive);
        float fogFactor = 1.0 - exp(-uFogDensity * vFog);
        color = mix(color, uFogColor, clamp(fogFactor, 0.0, 1.0));
        gl_FragColor = vec4(color, alpha);
      }
    `,
  });
  material.customProgramCacheKey = () => 'mv-sprite';
  return material;
}

/* ------------------------------------------------------------------ *
 * DEFERRED-ISH SCREEN EFFECTS used by the post chain
 * ------------------------------------------------------------------ */

/**
 * Gravitational lensing around a screen-space point. The singularity realm
 * bends the frame around its event horizon; the same pass gives wormholes
 * their "pull" without a second scene render.
 */
export const GRAVITY_LENS_SHADER = {
  uniforms: {
    tDiffuse: { value: null },
    uCenter: { value: new Vector2(0.5, 0.5) },
    uRadius: { value: 0.25 },
    uStrength: { value: 0.35 },
    uSpin: { value: 0.0 },
    uTime: { value: 0 },
    uChromatic: { value: 0.0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    precision highp float;
    uniform sampler2D tDiffuse;
    uniform vec2 uCenter;
    uniform float uRadius;
    uniform float uStrength;
    uniform float uSpin;
    uniform float uTime;
    uniform float uChromatic;
    varying vec2 vUv;
    void main() {
      vec2 delta = vUv - uCenter;
      delta.x *= 1.0;
      float dist = length(delta);
      float influence = 1.0 - smoothstep(0.0, uRadius, dist);
      float pull = influence * influence * uStrength;
      vec2 dir = dist > 0.0001 ? delta / dist : vec2(0.0);
      float swirl = influence * uSpin * 0.35;
      mat2 rot = mat2(cos(swirl), -sin(swirl), sin(swirl), cos(swirl));
      vec2 warped = uCenter + rot * dir * (dist - pull * 0.35);
      vec2 chroma = dir * pull * uChromatic;
      vec3 color;
      color.r = texture2D(tDiffuse, warped + chroma * 0.6).r;
      color.g = texture2D(tDiffuse, warped).g;
      color.b = texture2D(tDiffuse, warped - chroma * 0.6).b;
      gl_FragColor = vec4(color, 1.0);
    }
  `,
};

/**
 * Film grade: LUT lookup, realm tint, vignette, chromatic aberration at the
 * edges, animated grain and a subtle liquid-glass distortion used while the
 * machine is talking.
 */
export const GRADE_SHADER = {
  uniforms: {
    tDiffuse: { value: null },
    tLut: { value: null },
    uLutStrength: { value: 1.0 },
    uTint: { value: new Vector3(1, 1, 1) },
    uTintStrength: { value: 0.0 },
    uVignette: { value: 0.35 },
    uChromatic: { value: 0.0016 },
    uGrain: { value: 0.035 },
    uTime: { value: 0 },
    uDistortion: { value: 0.0 },
    uExposure: { value: 1.0 },
    uSaturation: { value: 1.06 },
    uContrast: { value: 1.04 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    precision highp float;
    uniform sampler2D tDiffuse;
    uniform sampler3D tLut;
    uniform float uLutStrength;
    uniform vec3 uTint;
    uniform float uTintStrength;
    uniform float uVignette;
    uniform float uChromatic;
    uniform float uGrain;
    uniform float uTime;
    uniform float uDistortion;
    uniform float uExposure;
    uniform float uSaturation;
    uniform float uContrast;
    varying vec2 vUv;

    float hash(vec2 p) {
      return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
    }

    void main() {
      vec2 uv = vUv;
      float dist = length(uv - 0.5);

      // Liquid-glass ripple while a reality is being authored around you.
      if (uDistortion > 0.0001) {
        uv += vec2(
          sin(uv.y * 34.0 + uTime * 2.1),
          cos(uv.x * 30.0 - uTime * 1.7)
        ) * uDistortion * 0.01 * (1.0 - dist);
      }

      vec2 offset = (uv - 0.5) * uChromatic * (0.35 + dist * 2.4);
      vec3 color;
      color.r = texture2D(tDiffuse, uv + offset).r;
      color.g = texture2D(tDiffuse, uv).g;
      color.b = texture2D(tDiffuse, uv - offset).b;

      color *= uExposure;

      // LUT grade (16^3 cube, bilinear-ish sampling on hardware)
      if (uLutStrength > 0.001) {
        vec3 graded = texture(tLut, clamp(color, 0.0, 1.0)).rgb;
        color = mix(color, graded, uLutStrength);
      }

      // Realm tint
      color = mix(color, color * uTint, uTintStrength);

      // Contrast + saturation
      color = (color - 0.5) * uContrast + 0.5;
      float lum = dot(color, vec3(0.2126, 0.7152, 0.0722));
      color = mix(vec3(lum), color, uSaturation);

      // Vignette
      color *= 1.0 - uVignette * pow(clamp(dist * 1.35, 0.0, 1.0), 2.2);

      // Grain, animated per frame
      float grain = hash(uv * vec2(1024.0, 768.0) + fract(uTime) * 91.7) - 0.5;
      color += grain * uGrain;

      gl_FragColor = vec4(color, 1.0);
    }
  `,
};

/** Scanline/glitch pass for the midnight realm, the backrooms and damage. */
export const GLITCH_SHADER = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uAmount: { value: 0.0 },
    uScanlines: { value: 0.0 },
    uRgbShift: { value: 0.0 },
    uBlockSize: { value: 8.0 },
  },
  vertexShader: GRAVITY_LENS_SHADER.vertexShader,
  fragmentShader: /* glsl */ `
    precision highp float;
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform float uAmount;
    uniform float uScanlines;
    uniform float uRgbShift;
    uniform float uBlockSize;
    varying vec2 vUv;

    float hash(vec2 p) { return fract(sin(dot(p, vec2(21.9898, 78.233))) * 43758.5453); }

    void main() {
      vec2 uv = vUv;
      float strength = uAmount;

      // Horizontal tear lines that ripple down the frame.
      float tear = step(0.995 - strength * 0.35, hash(vec2(floor(uv.y * 90.0), floor(uTime * 12.0))));
      uv.x += tear * strength * (hash(vec2(floor(uTime * 8.0), floor(uv.y * 90.0))) - 0.5) * 0.12;

      // Blocky displacement, quantised to "pixels" of a broken signal.
      vec2 block = floor(uv * (vec2(1.0) * 120.0 / max(1.0, uBlockSize))) / (120.0 / max(1.0, uBlockSize));
      float blockNoise = hash(block + floor(uTime * 9.0));
      uv.x += (blockNoise - 0.5) * strength * 0.05;

      float shift = (0.0015 + strength * 0.012) * uRgbShift;
      vec3 color;
      color.r = texture2D(tDiffuse, uv + vec2(shift, 0.0)).r;
      color.g = texture2D(tDiffuse, uv).g;
      color.b = texture2D(tDiffuse, uv - vec2(shift, 0.0)).b;

      float scan = 1.0 - uScanlines * 0.5 * (0.5 + 0.5 * sin(uv.y * 1400.0 + uTime * 12.0));
      color *= scan;

      // Occasional dropped-signal flash
      float flash = step(0.997, hash(vec2(floor(uTime * 3.0), 3.0))) * uScanlines;
      color = mix(color, vec3(0.8, 0.85, 1.0), flash * 0.25);

      gl_FragColor = vec4(color, 1.0);
    }
  `,
};

/**
 * God rays (radial light shafts) from a screen-space sun position. Cheap,
 * stable, and the single biggest "wow" per millisecond in the whole chain.
 */
export const GODRAY_SHADER = {
  uniforms: {
    tDiffuse: { value: null },
    uSunPos: { value: new Vector2(0.5, 0.5) },
    uStrength: { value: 0.6 },
    uDecay: { value: 0.94 },
    uDensity: { value: 0.78 },
    uWeight: { value: 0.42 },
    uSamples: { value: 24 },
    uSunColor: { value: new Vector3(1.0, 0.92, 0.78) },
  },
  vertexShader: GRAVITY_LENS_SHADER.vertexShader,
  fragmentShader: /* glsl */ `
    precision highp float;
    uniform sampler2D tDiffuse;
    uniform vec2 uSunPos;
    uniform float uStrength;
    uniform float uDecay;
    uniform float uDensity;
    uniform float uWeight;
    uniform float uSamples;
    uniform vec3 uSunColor;
    varying vec2 vUv;

    void main() {
      vec3 base = texture2D(tDiffuse, vUv).rgb;
      vec2 delta = (vUv - uSunPos) * (1.0 / max(4.0, uSamples)) * uDensity;
      vec2 uv = vUv;
      float illumination = 1.0;
      vec3 shafts = vec3(0.0);
      for (int i = 0; i < 64; i++) {
        if (float(i) >= uSamples) break;
        uv -= delta;
        vec3 sampleColor = texture2D(tDiffuse, uv).rgb;
        // Only bright pixels contribute, so rays emerge from the sun and sky.
        float lum = max(0.0, dot(sampleColor, vec3(0.299, 0.587, 0.114)) - 0.72);
        shafts += sampleColor * lum * illumination * uWeight;
        illumination *= uDecay;
      }
      // Fade rays out with distance from the sun for a soft, physical falloff.
      float falloff = 1.0 - clamp(length(vUv - uSunPos) * 1.15, 0.0, 1.0);
      gl_FragColor = vec4(base + shafts * uStrength * falloff * uSunColor, 1.0);
    }
  `,
};

/** Depth-of-field: cheap 9-tap disk blur weighted by CoC from the depth pass. */
export const DOF_SHADER = {
  uniforms: {
    tDiffuse: { value: null },
    tDepth: { value: null },
    uFocus: { value: new Vector2(0.5, 0.5) },
    uFocusDistance: { value: 12.0 },
    uFocusRange: { value: 26.0 },
    uMaxBlur: { value: 0.012 },
    uNear: { value: 0.1 },
    uFar: { value: 5000.0 },
  },
  vertexShader: GRAVITY_LENS_SHADER.vertexShader,
  fragmentShader: /* glsl */ `
    precision highp float;
    uniform sampler2D tDiffuse;
    uniform sampler2D tDepth;
    uniform vec2 uFocus;
    uniform float uFocusDistance;
    uniform float uFocusRange;
    uniform float uMaxBlur;
    uniform float uNear;
    uniform float uFar;
    varying vec2 vUv;

    float linearDepth(float d) {
      float z = d * 2.0 - 1.0;
      return (2.0 * uNear * uFar) / (uFar + uNear - z * (uFar - uNear));
    }

    void main() {
      float depth = linearDepth(texture2D(tDepth, vUv).x);
      float coc = clamp(abs(depth - uFocusDistance) / uFocusRange, 0.0, 1.0);
      coc *= coc;
      float radius = coc * uMaxBlur;

      vec3 color = texture2D(tDiffuse, vUv).rgb;
      if (radius > 0.0005) {
        vec3 sum = color;
        float count = 1.0;
        // Golden-angle spiral: 12 taps reads as a smooth bokeh disk.
        for (int i = 0; i < 12; i++) {
          float t = (float(i) + 0.5) / 12.0;
          float a = float(i) * 2.399963;
          vec2 offset = vec2(cos(a), sin(a)) * sqrt(t) * radius;
          sum += texture2D(tDiffuse, vUv + offset).rgb;
          count += 1.0;
        }
        color = sum / count;
      }
      gl_FragColor = vec4(color, 1.0);
    }
  `,
};

/** Motion blur / temporal smear used at speed, in the void, and on impact. */
export const MOTION_SHADER = {
  uniforms: {
    tDiffuse: { value: null },
    tPrev: { value: null },
    uAmount: { value: 0.0 },
    uRadial: { value: 0.0 },
    uCenter: { value: new Vector2(0.5, 0.5) },
  },
  vertexShader: GRAVITY_LENS_SHADER.vertexShader,
  fragmentShader: /* glsl */ `
    precision highp float;
    uniform sampler2D tDiffuse;
    uniform sampler2D tPrev;
    uniform float uAmount;
    uniform float uRadial;
    uniform vec2 uCenter;
    varying vec2 vUv;
    void main() {
      vec2 uv = vUv;
      vec3 current = texture2D(tDiffuse, uv).rgb;
      vec3 previous = texture2D(tPrev, uv).rgb;
      // Radial smear pulls colour toward the edges at speed.
      vec3 smear = current;
      if (uRadial > 0.001) {
        vec2 dir = uv - uCenter;
        smear = texture2D(tDiffuse, uv - dir * uRadial * 0.06).rgb;
        smear = mix(smear, texture2D(tDiffuse, uv - dir * uRadial * 0.12).rgb, 0.5);
      }
      vec3 color = mix(current, mix(previous, smear, 0.5), clamp(uAmount, 0.0, 0.9));
      gl_FragColor = vec4(color, 1.0);
    }
  `,
};
