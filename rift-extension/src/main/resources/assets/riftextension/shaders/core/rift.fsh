#version 330
#extension GL_ARB_separate_shader_objects : require

// Rift Extension — rift fragment shader. FULLY SHADER-DRIVEN.
//   RIFT_WALL  inner walls with depth gradient + subtle frost.
//   RIFT_GLOW  rims, halos, sparkles, lightning: additive with bloom.
//   (default)  FROSTED WINDOW: rich procedural destination sky visible through
//              etched glass with noise distortion, depth parallax, and frost shimmer.

#include <minecraft:fog.glsl>
#include <minecraft:globals.glsl>
#include <minecraft:dynamictransforms.glsl>

layout(location = 0) in vec4 riftData;
layout(location = 1) in vec3 worldRay;
layout(location = 2) in float sphericalVertexDistance;
layout(location = 3) in float cylindricalVertexDistance;

layout(location = 0) out vec4 fragColor;
layout(location = 1) out vec4 packLight;
layout(location = 2) out vec4 packNormal;

float fogFade() {
    return 1.0 - smoothstep(FogRenderDistanceStart, FogRenderDistanceEnd, sphericalVertexDistance);
}

#if !defined(RIFT_WALL) && !defined(RIFT_GLOW)
const float PI = 3.14159265;

// ------------------------------------------------------------------ noise

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
    for (int i = 0; i < 5; i++) { s += a * vnoise(p); p = p * 2.03 + vec2(17.1, 9.2); a *= 0.5; }
    return s;
}

float voronoi(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    float d = 1.0;
    for (int x = -1; x <= 1; x++) for (int y = -1; y <= 1; y++) {
        vec2 g = vec2(float(x), float(y));
        vec2 o = vec2(hash21(i + g), hash21(i + g + vec2(7.3, 13.1)));
        vec2 r = g + o - f;
        d = min(d, dot(r, r));
    }
    return sqrt(d);
}

// ------------------------------------------------------------------ frost distortion

vec2 frostDistortion(vec2 uv, float t) {
    vec2 swirl = vec2(
        fbm(uv * 3.0 + vec2(t * 0.03, t * 0.02)) - 0.5,
        fbm(uv * 3.0 + vec2(t * 0.025, -t * 0.015) + 17.0) - 0.5
    ) * 0.03;
    float v = voronoi(uv * 6.0 + t * 0.01);
    vec2 crystal = vec2(dFdx(v), dFdy(v)) * 0.015;
    float breath = 0.7 + 0.3 * sin(t * 0.15);
    return (swirl + crystal) * breath;
}

float frostIntensity(vec2 uv, float t) {
    float base = 0.55;
    float clouds = fbm(uv * 4.0 + t * 0.02) * 0.3;
    float v = voronoi(uv * 5.0 + t * 0.01);
    float vein = smoothstep(0.0, 0.12, v) * 0.25;
    vec2 edge = abs(uv - 0.5) * 2.0;
    float edgeFrost = smoothstep(0.5, 1.0, max(edge.x, edge.y)) * 0.2;
    float centre = exp(-dot(uv - 0.5, uv - 0.5) * 6.0) * 0.12;
    return clamp(base + clouds - vein + edgeFrost - centre, 0.2, 0.85);
}

// ------------------------------------------------------------------ RICH procedural destination views

float ridge(float yaw, float seed, float cols, float lo, float hi) {
    float c = floor((yaw + PI) / (2.0 * PI) * cols);
    float n = hash21(vec2(c, seed)) * 0.45 + hash21(vec2(floor(c / 4.0), seed + 7.0)) * 0.55;
    return lo + (hi - lo) * n;
}

float clouds(vec3 dir, float t, float scale, float cover, float seed) {
    float k = 1.0 / (max(dir.y, -0.1) + 0.16);
    vec2 cell = floor(dir.xz * k * scale + vec2(t * 0.04, t * 0.015) + seed);
    float n = vnoise(cell * 0.33) * 0.65 + vnoise(cell * 0.9 + 11.0) * 0.35;
    return step(cover, n);
}

// 0 Overworld: rich sunset with multiple cloud layers, terrain detail
vec3 viewOverworld(vec3 dir, float yaw, float t) {
    float el = dir.y;
    vec3 c = mix(vec3(1.00, 0.70, 0.36), vec3(0.95, 0.40, 0.32), smoothstep(-0.05, 0.55, el));
    c = mix(c, vec3(1.00, 0.88, 0.58), exp(-abs(el - 0.02) * 14.0) * 0.5);
    c = mix(c, vec3(1.00, 0.76, 0.55), clouds(dir, t, 1.6, 0.52, 3.0) * 0.7);
    c = mix(c, vec3(1.00, 0.94, 0.74), clouds(dir, t * 1.4, 2.4, 0.58, 0.0) * 0.95);
    c = mix(c, vec3(1.00, 0.82, 0.60), clouds(dir, t * 0.8, 0.8, 0.45, 7.0) * 0.5);
    if (el < ridge(yaw, 3.0, 90.0, -0.03, 0.09)) c = mix(c, vec3(0.88, 0.40, 0.32), 0.6);
    if (el < ridge(yaw, 9.0, 40.0, -0.12, 0.02)) c = vec3(0.74, 0.30, 0.26);
    // Sun glow
    float sun = exp(-abs(el - 0.05) * 30.0) * 0.3;
    c += vec3(1.0, 0.9, 0.6) * sun;
    return c;
}

// 5 Gold (Overworld from Sift)
vec3 viewGold(vec3 dir, float yaw, float t) {
    float el = dir.y;
    vec3 c = mix(vec3(1.00, 0.94, 0.58), vec3(0.93, 0.80, 0.25), smoothstep(-0.05, 0.5, el));
    c = mix(c, vec3(1.00, 0.98, 0.80), clouds(dir, t, 2.0, 0.55, 5.0) * 0.9);
    c = mix(c, vec3(1.00, 0.95, 0.70), clouds(dir, t * 1.2, 1.2, 0.50, 12.0) * 0.6);
    if (el < ridge(yaw, 4.0, 120.0, -0.02, 0.12)) c = mix(c, vec3(0.70, 0.62, 0.22), 0.7);
    if (el < ridge(yaw, 8.0, 50.0, -0.10, 0.04)) c = vec3(0.48, 0.43, 0.13);
    return c;
}

// 1 Nether: crimson sky, rolling smoke, fortress, embers, lava glow
vec3 viewNether(vec3 dir, float yaw, float t) {
    float el = dir.y;
    vec3 c = mix(vec3(1.00, 0.38, 0.12), vec3(0.45, 0.05, 0.05), smoothstep(-0.05, 0.6, el));
    float smoke = fbm(vec2(yaw * 2.5, el * 5.0 - t * 0.12));
    c = mix(c, vec3(0.22, 0.03, 0.04), smoothstep(0.5, 0.75, smoke) * 0.6);
    if (el < ridge(yaw, 2.0, 70.0, -0.04, 0.20)) c = vec3(0.20, 0.03, 0.04);
    c += vec3(1.0, 0.45, 0.12) * smoothstep(-0.02, -0.25, el) * 0.6;
    vec2 e = floor(vec2(yaw * 30.0, el * 30.0 - t * 1.5));
    c += vec3(1.0, 0.72, 0.3) * step(0.975, hash21(e));
    // Extra smoke layers
    float smoke2 = fbm(vec2(yaw * 4.0 + 5.0, el * 3.0 - t * 0.08));
    c = mix(c, vec3(0.30, 0.05, 0.06), smoothstep(0.55, 0.8, smoke2) * 0.35);
    return c;
}

// 2 End: deep blue starlit, violet nebula, island silhouettes, purple rim
vec3 viewEnd(vec3 dir, float yaw, float t) {
    float el = dir.y;
    vec3 c = mix(vec3(0.30, 0.28, 0.62), vec3(0.04, 0.05, 0.16), smoothstep(-0.05, 0.6, el));
    float neb = fbm(vec2(yaw * 1.5 + t * 0.01, el * 3.0));
    c += vec3(0.55, 0.20, 0.60) * smoothstep(0.55, 0.8, neb) * 0.5;
    float neb2 = fbm(vec2(yaw * 2.5 + 3.0, el * 4.0 + t * 0.008));
    c += vec3(0.30, 0.15, 0.50) * smoothstep(0.6, 0.85, neb2) * 0.3;
    vec2 g = vec2(yaw * 60.0, el * 60.0);
    float h = hash21(floor(g));
    c += vec3(0.9, 0.9, 1.0) * step(0.965, h) * smoothstep(0.45, 0.0, length(fract(g) - 0.5));
    float r = ridge(yaw, 6.0, 60.0, -0.06, 0.10);
    if (el < r) c = mix(vec3(0.14, 0.12, 0.32), vec3(0.55, 0.35, 0.85), smoothstep(r - 0.012, r, el) * 0.8);
    return c;
}

// 3 Sift: pale mint sky, pink panels, rows of pink and teal pillars
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

// 4 Portal: cyan mosaic
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

// ------------------------------------------------------------------ frosted window with depth

vec3 frostedWindow(vec3 baseDir, vec2 uv, int view, bool night, float t) {
    vec2 frost = frostDistortion(uv, t);
    float frostK = frostIntensity(uv, t);

    // Distorted direction through frosted glass
    vec3 distorted = normalize(baseDir + vec3(frost.x, frost.y, 0.0));

    // Multi-tap blur (5 samples through frost)
    vec3 col = destination(view, distorted, t) * 0.4;
    float blurR = 0.015 + frostK * 0.02;
    for (int i = 0; i < 4; i++) {
        float angle = float(i) * PI * 0.5 + t * 0.1;
        vec2 off = vec2(cos(angle), sin(angle)) * blurR;
        vec2 tapFrost = frostDistortion(uv + off * 0.5, t + float(i) * 0.3);
        vec3 tapDir = normalize(baseDir + vec3(off.x + tapFrost.x * 0.5, off.y + tapFrost.y * 0.5, 0.0));
        col += destination(view, tapDir, t) * 0.15;
    }

    // Depth parallax: shift the view slightly based on distance from center
    vec2 parallax = (uv - 0.5) * 0.08;
    vec3 deepDir = normalize(baseDir + vec3(parallax.x, parallax.y, 0.0));
    col += destination(view, deepDir, t) * 0.1;  // subtle depth layer

    // Frost tint
    col = mix(col, vec3(0.92, 0.95, 1.0), frostK * 0.25);

    // Ice sparkle
    float sparkle = pow(voronoi(uv * 18.0 + t * 0.05), 4.0) * frostK;
    col += vec3(1.0, 0.98, 0.95) * sparkle * 0.25;

    // Surface sheen
    float sheen = pow(max(0.0, dot(normalize(baseDir), vec3(0.3, 0.7, 0.5))), 12.0);
    col += vec3(1.0) * sheen * frostK * 0.1;

    return col;
}

#endif

void main() {
#if defined(RIFT_GLOW)
    packLight = vec4(0.0);
    packNormal = vec4(0.0);
    fragColor = vec4(riftData.rgb, riftData.a * fogFade()) * ColorModulator;
#elif defined(RIFT_WALL)
    // Shader-driven walls: depth gradient from edge to center
    packLight = vec4(1.0, 1.0, 0.0, 1.0);
    packNormal = vec4(0.5, 0.5, 1.0, 0.0);
    vec3 wallCol = riftData.rgb;
    // Add subtle depth gradient — edges brighter, centre darker (thick rift look)
    vec2 wd = riftData.rg - 0.5;
    float wDist = length(wd);
    wallCol *= 0.85 + 0.15 * wDist;  // brighter at edges
    // Subtle frost shimmer on walls
    float wFrost = vnoise(riftData.rg * 8.0 + GameTime * 600.0) * 0.05;
    wallCol += vec3(wFrost);
    fragColor = apply_fog(vec4(wallCol, 1.0) * ColorModulator, sphericalVertexDistance, cylindricalVertexDistance,
        FogEnvironmentalStart, FogEnvironmentalEnd, FogRenderDistanceStart, FogRenderDistanceEnd, FogColor);
#else
    // --- FROSTED INTERDIMENSIONAL WINDOW ---
    packLight = vec4(1.0, 1.0, 0.0, 1.0);
    packNormal = vec4(0.5, 0.5, 1.0, 0.0);
    float t = GameTime * 1200.0;
    int code = int(riftData.b * 16.0);
    int view = code - (code / 8) * 8;
    bool night = code >= 8;
    vec3 dir = normalize(worldRay);
    vec2 uv = riftData.rg;

    // Frosted window with rich procedural destination
    vec3 col = frostedWindow(dir, uv, view, night, t);

    // Centre glow — light pouring through the rift
    vec2 d = uv - 0.5;
    float core = exp(-dot(d, d) * 10.0);
    float coreK = view == 5 ? 0.95 : (view == 3 ? (night ? 0.8 : 0.3) : (view == 0 ? 0.4 : (view == 4 ? 0.35 : 0.2)));
    col = mix(col, view == 3 ? vec3(1.0, 0.92, 0.96) : vec3(1.0, 0.98, 0.93), core * coreK);

    // Night glow for Sift
    if (view == 3 && night) col = mix(col, mix(vec3(1.0, 0.70, 0.82), vec3(1.0, 0.96, 0.98), uv.y), 0.55);

    // Edge vignette — darkens the edges for the "fading into nothing" look
    float vignette = 1.0 - smoothstep(0.35, 0.55, max(abs(uv.x - 0.5), abs(uv.y - 0.5)) * 2.0);
    col *= 0.4 + 0.6 * vignette;

    fragColor = apply_fog(vec4(min(col, vec3(1.0)), 1.0) * ColorModulator, sphericalVertexDistance, cylindricalVertexDistance,
        FogEnvironmentalStart, FogEnvironmentalEnd, FogRenderDistanceStart, FogRenderDistanceEnd, FogColor);
#endif
}