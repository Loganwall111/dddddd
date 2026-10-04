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

// 3 Sift: pale mint sky, soft pink panels, rows of pink and teal pillars on the horizon.
vec3 viewSift(vec3 dir, float yaw, float t) {
    float el = dir.y;
    vec3 c = mix(vec3(0.62, 0.90, 0.86), vec3(0.88, 0.97, 0.95), smoothstep(-0.05, 0.6, el));
    vec2 pg = vec2(yaw * 5.0 + t * 0.01, el * 7.0);
    float panel = smoothstep(0.55, 0.7, vnoise(floor(pg) * 0.7 + 3.0)) * smoothstep(0.02, 0.15, el);
    c = mix(c, vec3(0.98, 0.80, 0.90), panel * 0.45);
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
    // 0.23: the window is PURE translucent pastel energy fog. The references show NO destination
    // dimension through the rift - the world behind shows through the alpha instead (pipeline blend).
    vec2 uv = riftData.rg;
    vec2 ripple = vec2(sin(uv.y * 14.0 + t * 1.0), cos(uv.x * 10.0 - t * 0.6)) * 0.02;
    vec2 wuv = uv + ripple;
    // Three drifting fbm sheets in the trailer palette (pale white / soft pink / pale peach / cream,
    // subtle cyan-teal highlights), slowly shifting, with small brightness fluctuations.
    float g1 = fbm(wuv * 3.1 + vec2(t * 0.05, -t * 0.03));
    float g2 = fbm(wuv * 5.7 - vec2(t * 0.04, t * 0.06) + 11.0);
    float g3 = fbm(wuv * 9.3 + vec2(-t * 0.02, t * 0.05) + 27.0);
    vec3 palA, palB, palC;
    if (view == 3 || view == 4) { palA = vec3(1.00, 0.72, 0.82); palB = vec3(1.00, 0.80, 0.52); palC = vec3(1.00, 0.95, 0.86); }
    else if (view == 5)         { palA = vec3(1.00, 0.86, 0.55); palB = vec3(1.00, 0.92, 0.68); palC = vec3(1.00, 0.98, 0.88); }
    else if (view == 1)         { palA = vec3(1.00, 0.50, 0.36); palB = vec3(1.00, 0.72, 0.44); palC = vec3(1.00, 0.90, 0.75); }
    else if (view == 2)         { palA = vec3(0.72, 0.66, 1.00); palB = vec3(0.88, 0.76, 1.00); palC = vec3(1.00, 0.95, 1.00); }
    else                        { palA = vec3(1.00, 0.72, 0.52); palB = vec3(1.00, 0.84, 0.62); palC = vec3(1.00, 0.96, 0.86); }
    if (night) { palA = mix(palA, vec3(1.0, 0.62, 0.78), 0.5); palB = mix(palB, vec3(1.0, 0.76, 0.62), 0.4); }
    // Tight noise windows keep distinct pink / gold-peach regions (wide windows averaged to mauve).
    vec3 energy = mix(palA, palB, smoothstep(0.40, 0.68, g1));
    energy = mix(energy, palC, smoothstep(0.50, 0.80, g2) * 0.45);   // cream only as highlights (0.8 washed out)
    energy *= 1.12;                                                 // luminous, like the ref interior
    vec2 d = riftData.rg - 0.5;
    float core = exp(-dot(d, d) * 6.0);
    energy = mix(energy, vec3(1.0, 0.99, 0.96), core * 0.35);          // bright heart, never a blowout
    energy += vec3(0.55, 0.95, 0.90) * smoothstep(0.62, 0.90, g3) * 0.10;  // faint teal veins
    energy *= 0.92 + 0.08 * sin(t * 0.9 + g1 * 6.0);                   // slow brightness fluctuation
    vec2 sg = wuv * 140.0 + vec2(t * 0.6, -t * 0.35);                  // white sparkles drifting inside
    float sp = hash21(floor(sg));
    energy += vec3(1.0) * step(0.988, sp) * (0.5 + 0.5 * sin(t * 3.0 + sp * 80.0)) * 0.5;
    // 0.23: no destination mix; luminance tuned down (1.12 blew out to white in day captures).
    vec3 col = min(energy, vec3(1.0));
    fragColor = apply_fog(vec4(col, 0.85) * ColorModulator, sphericalVertexDistance, cylindricalVertexDistance,
        FogEnvironmentalStart, FogEnvironmentalEnd, FogRenderDistanceStart, FogRenderDistanceEnd, FogColor);
#endif
}
