#version 330
#extension GL_ARB_separate_shader_objects : require

// 0.20 Enter the Sift rift shader (clean slate).
//   RIFT_WALL  inner walls: vertex colour, fogged. Perfectly still (no pulse, no sweep).
//   RIFT_GLOW  rims, halos, sparkles, lightning, night curtains: additive vertex colour, no flicker.
//   (default)  the WINDOW: the destination's sky, blocky clouds and horizon, sampled by world-space view
//              direction, so it is sharp, un-warped and identical across every window quad.

#include <minecraft:fog.glsl>
#include <minecraft:globals.glsl>
#include <minecraft:dynamictransforms.glsl>

layout(location = 0) in vec4 riftData;
layout(location = 1) in vec3 worldRay;
layout(location = 2) in float sphericalVertexDistance;
layout(location = 3) in float cylindricalVertexDistance;

layout(location = 0) out vec4 fragColor;
// Shader-pack masks (0.18.2). Without a pack only attachment 0 exists and GL discards these. Under an Iris
// pack (rift pipelines are deliberately unassigned, so Iris draws them with THIS shader) they land in
// colortex1 (lightmap) and colortex2 (normal, a = 0 = not world geometry), so the Dungeons II composite
// never re-shades the self-lit rift.
layout(location = 1) out vec4 packLight;
layout(location = 2) out vec4 packNormal;

float fogFade() {
    return 1.0 - smoothstep(FogRenderDistanceStart, FogRenderDistanceEnd, sphericalVertexDistance);
}

#if !defined(RIFT_WALL) && !defined(RIFT_GLOW)
const float PI = 3.14159265;

float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
}

float vnoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),
               mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x), f.y);
}

float fbm(vec2 p) {
    float s = 0.0, a = 0.5;
    for (int i = 0; i < 3; i++) { s += a * vnoise(p); p = p * 2.03 + vec2(17.1, 9.2); a *= 0.5; }
    return s;
}

// Blocky horizon: height of the skyline in the view direction's yaw, in columns (Minecraft terrain).
float ridge(float yaw, float seed, float cols, float lo, float hi) {
    float c = floor((yaw + PI) / (2.0 * PI) * cols);
    float n = hash21(vec2(c, seed)) * 0.45 + hash21(vec2(floor(c / 4.0), seed + 7.0)) * 0.55;
    return lo + (hi - lo) * n;
}

// Minecraft-style blocky clouds on a plane above the viewer, drifting slowly (sharp, perspective-true).
float clouds(vec3 dir, float t, float scale, float cover, float seed) {
    float k = 1.0 / (max(dir.y, -0.1) + 0.16);
    vec2 cell = floor(dir.xz * k * scale + vec2(t * 0.04, t * 0.015) + seed);
    float n = vnoise(cell * 0.33) * 0.65 + vnoise(cell * 0.9 + 11.0) * 0.35;
    return step(cover, n);
}

// 0 Overworld: coral sky over an orange horizon, blocky cream clouds, hazy coral hills.
vec3 viewOverworld(vec3 dir, float yaw, float t) {
    float el = dir.y;
    vec3 c = mix(vec3(1.00, 0.70, 0.36), vec3(0.95, 0.40, 0.32), smoothstep(-0.05, 0.55, el));
    c = mix(c, vec3(1.00, 0.88, 0.58), exp(-abs(el - 0.02) * 14.0) * 0.5);
    c = mix(c, vec3(1.00, 0.76, 0.55), clouds(dir, t, 1.6, 0.52, 3.0) * 0.7);    // far peach layer
    c = mix(c, vec3(1.00, 0.94, 0.74), clouds(dir, t * 1.4, 2.4, 0.58, 0.0) * 0.95);
    if (el < ridge(yaw, 3.0, 90.0, -0.03, 0.09)) c = mix(c, vec3(0.88, 0.40, 0.32), 0.6);
    if (el < ridge(yaw, 9.0, 40.0, -0.12, 0.02)) c = vec3(0.74, 0.30, 0.26);
    return c;
}

// 5 The Overworld seen from the Sift: golden sky, pale gold clouds, olive treeline.
vec3 viewGold(vec3 dir, float yaw, float t) {
    float el = dir.y;
    vec3 c = mix(vec3(1.00, 0.94, 0.58), vec3(0.93, 0.80, 0.25), smoothstep(-0.05, 0.5, el));
    c = mix(c, vec3(1.00, 0.98, 0.80), clouds(dir, t, 2.0, 0.55, 5.0) * 0.9);
    if (el < ridge(yaw, 4.0, 120.0, -0.02, 0.12)) c = mix(c, vec3(0.70, 0.62, 0.22), 0.7);
    if (el < ridge(yaw, 8.0, 50.0, -0.10, 0.04)) c = vec3(0.48, 0.43, 0.13);
    return c;
}

// 1 Nether: crimson sky, rolling dark smoke, a blocky fortress skyline, rising embers, lava glow below.
vec3 viewNether(vec3 dir, float yaw, float t) {
    float el = dir.y;
    vec3 c = mix(vec3(1.00, 0.38, 0.12), vec3(0.45, 0.05, 0.05), smoothstep(-0.05, 0.6, el));
    float smoke = fbm(vec2(yaw * 2.5, el * 5.0 - t * 0.12));
    c = mix(c, vec3(0.22, 0.03, 0.04), smoothstep(0.5, 0.75, smoke) * 0.6);
    if (el < ridge(yaw, 2.0, 70.0, -0.04, 0.20)) c = vec3(0.20, 0.03, 0.04);
    c += vec3(1.0, 0.45, 0.12) * smoothstep(-0.02, -0.25, el) * 0.6;
    vec2 e = floor(vec2(yaw * 30.0, el * 30.0 - t * 1.5));
    c += vec3(1.0, 0.72, 0.3) * step(0.975, hash21(e));
    return c;
}

// 2 End: deep blue starlit sky with a violet nebula and dark island silhouettes rimmed in purple.
vec3 viewEnd(vec3 dir, float yaw, float t) {
    float el = dir.y;
    vec3 c = mix(vec3(0.30, 0.28, 0.62), vec3(0.04, 0.05, 0.16), smoothstep(-0.05, 0.6, el));
    float neb = fbm(vec2(yaw * 1.5 + t * 0.01, el * 3.0));
    c += vec3(0.55, 0.20, 0.60) * smoothstep(0.55, 0.8, neb) * 0.5;
    vec2 g = vec2(yaw * 60.0, el * 60.0);
    float h = hash21(floor(g));
    c += vec3(0.9, 0.9, 1.0) * step(0.965, h) * smoothstep(0.45, 0.0, length(fract(g) - 0.5));
    float r = ridge(yaw, 6.0, 60.0, -0.06, 0.10);
    if (el < r) c = mix(vec3(0.14, 0.12, 0.32), vec3(0.55, 0.35, 0.85), smoothstep(r - 0.012, r, el) * 0.8);
    return c;
}

// 3 Sift: cyan/turquoise/pastel-green sky dome, pink/magenta & soft-yellow luminous shapes,
// wavy dark charcoal "soul face" bands, volumetric god rays, and horizon pillars.
vec3 viewSift(vec3 dir, float yaw, float t) {
    float el = dir.y;
    vec3 c = mix(vec3(0.50, 0.88, 0.86), vec3(0.84, 0.97, 0.95), smoothstep(-0.05, 0.6, el));
    // Pastel green, cyan, pink/magenta, and soft yellow atmospheric currents
    float flowWave = 0.5 + 0.5 * sin(yaw * 3.0 + el * 4.5 - t * 0.14);
    float magWave = 0.5 + 0.5 * cos(yaw * 2.0 - el * 3.5 + t * 0.11);
    c = mix(c, vec3(0.55, 0.96, 0.78), flowWave * 0.28 * smoothstep(0.0, 0.55, el));
    c = mix(c, vec3(0.96, 0.52, 0.84), magWave * 0.24 * smoothstep(0.05, 0.65, el));
    vec2 pg = vec2(yaw * 5.0 + t * 0.01, el * 7.0);
    float panel = smoothstep(0.55, 0.7, vnoise(floor(pg) * 0.7 + 3.0)) * smoothstep(0.02, 0.15, el);
    c = mix(c, vec3(0.98, 0.80, 0.90), panel * 0.45);
    // Low-frequency wavy dark charcoal "soul face" bands across the upper dome
    float bandCenter = 0.28 + 0.09 * sin(yaw * 2.0 + t * 0.12) + 0.05 * cos(yaw * 3.0 - t * 0.09);
    float bandThick = 0.055 * (0.65 + 0.35 * sin(yaw * 2.0 - 0.7));
    float soulBand = smoothstep(bandThick, 0.0, abs(el - bandCenter)) * smoothstep(0.05, 0.20, el);
    c = mix(c, vec3(0.06, 0.08, 0.14), soulBand * 0.52);
    // Soft accumulated volumetric god-ray light shafts
    float ray = 0.5 + 0.5 * sin(yaw * 14.0 + sin(yaw * 3.0 - t * 0.15) * 1.6);
    float shaft = pow(ray, 4.0) * smoothstep(-0.02, 0.45, el) * smoothstep(0.85, 0.18, el);
    c += mix(vec3(0.35, 0.95, 0.92), vec3(0.98, 0.58, 0.88), magWave) * shaft * 0.22;
    for (int i = 2; i >= 0; i--) {
        float cols = 36.0 + 24.0 * float(i);
        float cid = floor((yaw + PI) / (2.0 * PI) * cols);
        float f = fract((yaw + PI) / (2.0 * PI) * cols);
        float hgt = 0.02 + (0.10 + 0.06 * float(2 - i)) * hash21(vec2(cid, float(i)));
        float on = step(0.45, hash21(vec2(cid, 3.0 + float(i)))) * step(abs(f - 0.5), 0.3) * step(el, hgt);
        vec3 pillar = mix(vec3(0.85, 0.42, 0.44), vec3(0.40, 0.72, 0.70), float(i) * 0.5);
        c = mix(c, mix(pillar, c, 0.15 * float(2 - i)), on);
    }
    if (el < -0.08) c = mix(c, vec3(0.55, 0.80, 0.72), 0.6);
    return c;
}

// 4 Ritual portal: bright cyan mosaic.
vec3 viewPortal(vec3 dir, float yaw, float t) {
    vec2 g = floor(vec2(yaw * 24.0, dir.y * 24.0));
    float n = hash21(g) * 0.5 + vnoise(g * 0.25 + t * 0.2) * 0.5;
    return mix(vec3(0.20, 0.70, 0.85), vec3(0.75, 1.00, 1.00), n);
}

vec3 destination(int view, vec3 dir, float t) {
    float yaw = atan(dir.x, dir.z);
    if (view == 0) return viewOverworld(dir, yaw, t);
    if (view == 1) return viewNether(dir, yaw, t);
    if (view == 2) return viewEnd(dir, yaw, t);
    if (view == 3) return viewSift(dir, yaw, t);
    if (view == 5) return viewGold(dir, yaw, t);
    return viewPortal(dir, yaw, t);
}
#endif

void main() {
#if defined(RIFT_GLOW)
    packLight = vec4(0.0);                  // additive: zeros leave the pack buffers untouched
    packNormal = vec4(0.0);
    fragColor = vec4(riftData.rgb, riftData.a * fogFade()) * ColorModulator;
#elif defined(RIFT_WALL)
    packLight = vec4(1.0, 1.0, 0.0, 1.0);
    packNormal = vec4(0.5, 0.5, 1.0, 0.0);
    fragColor = apply_fog(vec4(riftData.rgb, 1.0) * ColorModulator, sphericalVertexDistance, cylindricalVertexDistance,
        FogEnvironmentalStart, FogEnvironmentalEnd, FogRenderDistanceStart, FogRenderDistanceEnd, FogColor);
#else
    packLight = vec4(1.0, 1.0, 0.0, 1.0);
    packNormal = vec4(0.5, 0.5, 1.0, 0.0);
    float t = GameTime * 1200.0;            // seconds
    int code = int(riftData.b * 16.0);
    int view = code - (code / 8) * 8;
    bool night = code >= 8;
    vec3 dir = normalize(worldRay);
    vec3 col = destination(view, dir, t);
    // Layer 5 & 6: Colored interior energy & vertically-dominant inner luminance spine
    vec2 d = riftData.rg - 0.5;
    float core = exp(-dot(d, d) * 10.0);
    float vertSpine = exp(-d.x * d.x * 22.0 - d.y * d.y * 4.2);
    float energyWave = 0.5 + 0.5 * sin(riftData.g * 8.0 - t * 0.65 + sin(riftData.r * 6.0 + t * 0.4));
    vec3 siftEnergy = mix(vec3(0.25, 0.95, 0.96), vec3(0.95, 0.46, 0.86), energyWave);
    col = mix(col, siftEnergy, (view == 3 ? 0.24 : 0.10) * smoothstep(0.48, 0.05, length(d)));
    float coreK = view == 5 ? 0.95 : (view == 3 ? (night ? 0.82 : 0.42) : (view == 0 ? 0.4 : (view == 4 ? 0.35 : 0.25)));
    col = mix(col, view == 3 ? vec3(0.96, 0.98, 1.0) : vec3(1.0, 0.98, 0.93), max(core, vertSpine * 0.75) * coreK);
    // The Sift at night / THRIVE glows magenta-cyan-white with stronger volumetric luminance
    if (view == 3 && night) {
        vec3 thriveTint = mix(vec3(0.96, 0.48, 0.84), vec3(0.65, 0.98, 1.0), riftData.g);
        col = mix(col, thriveTint, 0.52);
    }
    // Phase C (White Ignition) -> Phase D (Color Reveal) & Phase F (Closing collapse)
    float reveal = clamp(riftData.a, 0.0, 1.0);
    col = mix(vec3(0.97, 0.99, 1.00), col, smoothstep(0.05, 0.95, reveal));
    fragColor = apply_fog(vec4(min(col, vec3(1.0)), 1.0) * ColorModulator, sphericalVertexDistance, cylindricalVertexDistance,
        FogEnvironmentalStart, FogEnvironmentalEnd, FogRenderDistanceStart, FogRenderDistanceEnd, FogColor);
#endif
}
