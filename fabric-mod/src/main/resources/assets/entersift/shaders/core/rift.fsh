#version 330
#extension GL_ARB_separate_shader_objects : require

// 0.24 Trailer-Exact Enter the Sift Rift & Portal Shader (Images 1-3, 5-8, 10, 13, 14, 19, 20, 24-28, 36-38).
//   RIFT_WALL  inner walls: vertex colour, fogged.
//   RIFT_GLOW  rims, halos, sparkles, lightning, side distortion veils, night curtains: additive vertex colour.
//   (default)  the WINDOW: wavy domain-warped destination vista sampled by world-space view direction.

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

// Blocky horizon: height of the skyline in the view direction's yaw, in columns.
float ridge(float yaw, float seed, float cols, float lo, float hi) {
    float c = floor((yaw + PI) / (2.0 * PI) * cols);
    float n = hash21(vec2(c, seed)) * 0.45 + hash21(vec2(floor(c / 4.0), seed + 7.0)) * 0.55;
    return lo + (hi - lo) * n;
}

// Minecraft-style blocky clouds on a plane above the viewer, drifting slowly.
float clouds(vec3 dir, float t, float scale, float cover, float seed) {
    float k = 1.0 / (max(dir.y, -0.1) + 0.16);
    vec2 cell = floor(dir.xz * k * scale + vec2(t * 0.04, t * 0.015) + seed);
    float n = vnoise(cell * 0.33) * 0.65 + vnoise(cell * 0.9 + 11.0) * 0.35;
    return step(cover, n);
}

// Crisp square pixel sparkles drifting upward inside the window (Images 1, 7, 8, 13, 19, 24, 25, 27, 36).
float pixelSparkles(float yaw, float el, float t, float density) {
    vec2 grid = vec2(yaw * 24.0, el * 26.0 - t * 1.4);
    vec2 cell = floor(grid);
    vec2 f = fract(grid);
    float h = hash21(cell);
    if (h < density) return 0.0;
    float ph = fract(h * 19.3 + t * (0.7 + fract(h * 7.1)));
    float twinkle = sin(ph * PI);
    vec2 d = abs(f - vec2(0.5));
    return step(max(d.x, d.y), 0.18) * twinkle;
}

// Smooth wavy domain warp on (yaw, el) so the interior vista ripples like a living portal tear.
vec2 wavyCoords(float yaw, float el, float t) {
    float wy = yaw + 0.022 * sin(el * 11.0 - t * 2.1 + yaw * 4.0);
    float we = el  + 0.018 * cos(yaw * 9.0 + t * 1.7 - el * 5.0);
    return vec2(wy, we);
}

// Flat-topped cream/yellow umbrella canopy trees on coral trunks (Images 27, 28, 36, 37).
vec3 canopyTreesAndMesas(vec3 col, float yaw, float el) {
    // Rose-coral stepped canyon mesas capped with bright mint-cyan turf
    float rMesa = ridge(yaw, 3.0, 56.0, -0.04, 0.13);
    if (el < rMesa) {
        vec3 mesa = mix(vec3(0.76, 0.22, 0.28), vec3(0.92, 0.38, 0.34), smoothstep(-0.15, rMesa, el));
        float mintCap = step(rMesa - 0.016, el);
        mesa = mix(mesa, vec3(0.32, 0.95, 0.78), mintCap * 0.78);
        col = mix(col, mesa, 0.84);
    }
    // Flat-topped umbrella canopy trees rising above the coral mesas (Images 27, 28, 36, 37)
    float treeCol = floor((yaw + PI) / (2.0 * PI) * 26.0);
    float tf = fract((yaw + PI) / (2.0 * PI) * 26.0);
    float th = hash21(vec2(treeCol, 19.0));
    if (th > 0.52) {
        float topY = 0.06 + 0.14 * fract(th * 7.3);
        float trunk = step(abs(tf - 0.5), 0.06) * step(-0.08, el) * step(el, topY);
        float cap = step(abs(tf - 0.5), 0.34) * step(topY, el) * step(el, topY + 0.032);
        col = mix(col, vec3(0.70, 0.18, 0.22), trunk * 0.90);
        col = mix(col, vec3(1.00, 0.94, 0.68), cap * 0.94);
    }
    return col;
}

// 0 Overworld / Sift vista: coral-vermilion & peach sky, golden-cream glow, blocky clouds, canopy trees.
vec3 viewOverworld(vec3 dir, float yaw, float t) {
    vec2 w = wavyCoords(yaw, dir.y, t);
    float el = w.y;
    vec3 c = mix(vec3(1.00, 0.74, 0.38), vec3(0.95, 0.36, 0.28), smoothstep(-0.06, 0.55, el));
    c = mix(c, vec3(1.00, 0.90, 0.60), exp(-abs(el - 0.02) * 12.0) * 0.58);
    c = mix(c, vec3(1.00, 0.78, 0.56), clouds(dir, t, 1.6, 0.52, 3.0) * 0.72);
    c = mix(c, vec3(1.00, 0.95, 0.76), clouds(dir, t * 1.4, 2.4, 0.58, 0.0) * 0.95);
    c = canopyTreesAndMesas(c, w.x, el);
    c = mix(c, vec3(1.0, 1.0, 1.0), pixelSparkles(w.x, el, t, 0.88));
    return c;
}

// 5 The Overworld seen from the Sift (Images 19, 20): blazing golden-yellow sky, olive spruce silhouettes, white-gold core.
vec3 viewGold(vec3 dir, float yaw, float t) {
    vec2 w = wavyCoords(yaw, dir.y, t);
    float el = w.y;
    vec3 c = mix(vec3(1.00, 0.94, 0.52), vec3(0.94, 0.78, 0.22), smoothstep(-0.05, 0.5, el));
    c = mix(c, vec3(1.00, 0.98, 0.82), clouds(dir, t, 2.0, 0.55, 5.0) * 0.9);
    if (el < ridge(w.x, 4.0, 120.0, -0.02, 0.12)) c = mix(c, vec3(0.66, 0.60, 0.20), 0.72);
    if (el < ridge(w.x, 8.0, 50.0, -0.10, 0.04)) c = vec3(0.46, 0.42, 0.12);
    c = mix(c, vec3(1.0, 1.0, 0.92), pixelSparkles(w.x, el, t, 0.86));
    return c;
}

// 1 Nether (Images 8, 13, 25): crimson-ruby sky, rolling dark smoke, Nether-brick fortress arches, rising embers.
vec3 viewNether(vec3 dir, float yaw, float t) {
    vec2 w = wavyCoords(yaw, dir.y, t);
    float el = w.y;
    vec3 c = mix(vec3(1.00, 0.38, 0.14), vec3(0.45, 0.05, 0.08), smoothstep(-0.05, 0.6, el));
    float smoke = fbm(vec2(w.x * 2.5, el * 5.0 - t * 0.15));
    c = mix(c, vec3(0.22, 0.03, 0.05), smoothstep(0.5, 0.75, smoke) * 0.62);
    if (el < ridge(w.x, 2.0, 70.0, -0.04, 0.20)) c = vec3(0.18, 0.03, 0.05);
    c += vec3(1.0, 0.45, 0.12) * smoothstep(-0.02, -0.25, el) * 0.6;
    c = mix(c, vec3(1.0, 0.90, 0.62), pixelSparkles(w.x, el, t * 1.3, 0.85));
    return c;
}

// 2 End / Deep-Cavern Rift (Images 7, 8, 24): twilight indigo-blue & violet cavern columns with white pixel sparkles.
vec3 viewEnd(vec3 dir, float yaw, float t) {
    vec2 w = wavyCoords(yaw, dir.y, t);
    float el = w.y;
    vec3 c = mix(vec3(0.28, 0.34, 0.68), vec3(0.08, 0.12, 0.32), smoothstep(-0.05, 0.6, el));
    float neb = fbm(vec2(w.x * 1.6 + t * 0.02, el * 3.2));
    c += vec3(0.52, 0.26, 0.64) * smoothstep(0.48, 0.78, neb) * 0.52;
    float r = ridge(w.x, 6.0, 60.0, -0.06, 0.14);
    if (el < r) c = mix(vec3(0.14, 0.18, 0.42), vec3(0.52, 0.68, 0.96), smoothstep(r - 0.015, r, el) * 0.82);
    c = mix(c, vec3(0.94, 0.97, 1.0), pixelSparkles(w.x, el, t, 0.86));
    return c;
}

// 3 Sift Rift in Overworld (Images 1, 2, 3, 26, 27, 28, 36, 37, 38):
// Warm coral-orange & peach sky, high turquoise-mint aurora ribbon, golden-yellow center glow,
// rose-coral canyon mesas with mint-cyan turf caps, flat-topped cream canopy trees, and white pixel sparkles.
vec3 viewSift(vec3 dir, float yaw, float t) {
    vec2 w = wavyCoords(yaw, dir.y, t);
    float el = w.y;
    // Warm coral-vermilion & peach-gold sky (Images 1, 27, 36, 37)
    vec3 c = mix(vec3(1.00, 0.76, 0.40), vec3(0.95, 0.34, 0.28), smoothstep(-0.05, 0.55, el));
    c = mix(c, vec3(1.00, 0.92, 0.66), exp(-abs(el - 0.01) * 11.0) * 0.62);
    // High turquoise-mint sky ribbon & soft pink panels peeking through upper sky (Images 2, 3, 27)
    vec2 pg = vec2(w.x * 5.0 + t * 0.02, el * 7.0);
    float panel = smoothstep(0.52, 0.72, vnoise(floor(pg) * 0.7 + 3.0)) * smoothstep(0.08, 0.32, el);
    c = mix(c, vec3(0.38, 0.92, 0.84), panel * 0.42);
    // Blocky golden-cream clouds
    c = mix(c, vec3(1.00, 0.95, 0.76), clouds(dir, t * 1.2, 2.2, 0.56, 2.0) * 0.82);
    // Rose-coral canyon mesas, mint-cyan turf caps & flat-topped cream canopy trees (Images 27, 28, 36, 37)
    c = canopyTreesAndMesas(c, w.x, el);
    // Crisp white square pixel sparkles drifting upward
    c = mix(c, vec3(1.0, 1.0, 1.0), pixelSparkles(w.x, el, t, 0.86));
    return c;
}

// 4 Ritual & Sift Ruin Portal (Images 5, 6, 10, 11, 31):
// Multi-layered 3D Cyan/Turquoise Tetris-Pixel Mosaic with glowing white-cyan stepped entry silhouette.
vec3 viewPortal(vec3 dir, float yaw, float t) {
    vec2 g1 = floor(vec2(yaw * 24.0, dir.y * 24.0));
    float h1 = hash21(g1);
    float pulse = 0.5 + 0.5 * sin(t * 1.8 + h1 * 6.2831);
    vec3 deepTeal   = vec3(0.06, 0.42, 0.58);
    vec3 midCyan    = vec3(0.14, 0.72, 0.88);
    vec3 brightCyan = vec3(0.32, 0.95, 1.00);
    vec3 iceWhite   = vec3(0.90, 1.00, 1.00);
    vec3 col = mix(deepTeal, midCyan, step(0.30, h1));
    col = mix(col, brightCyan, step(0.64, h1) * (0.65 + 0.35 * pulse));
    col = mix(col, iceWhite, step(0.86, h1) * pulse);
    // Finer inner mosaic layer for 3D pixel depth
    vec2 g2 = floor(vec2(yaw * 48.0 + sin(t * 0.6), dir.y * 48.0));
    float h2 = hash21(g2 + 17.0);
    if (h2 > 0.74) col = mix(col, h2 > 0.90 ? iceWhite : brightCyan, 0.65);
    return col;
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

// Multi-pass box-blur viewport blend + vibrantPinkDay / deepAmberNight grading.
#endif

void main() {
#if defined(RIFT_GLOW)
    packLight = vec4(0.0);
    packNormal = vec4(0.0);
    fragColor = vec4(riftData.rgb, riftData.a * fogFade()) * ColorModulator;
#elif defined(RIFT_WALL)
    packLight = vec4(1.0, 1.0, 0.0, 1.0);
    packNormal = vec4(0.5, 0.5, 1.0, 0.0);
    fragColor = apply_fog(vec4(riftData.rgb, riftData.a * 0.24) * ColorModulator, sphericalVertexDistance, cylindricalVertexDistance,
        FogEnvironmentalStart, FogEnvironmentalEnd, FogRenderDistanceStart, FogRenderDistanceEnd, FogColor);
#else
    packLight = vec4(1.0, 1.0, 0.0, 1.0);
    packNormal = vec4(0.5, 0.5, 1.0, 0.0);
    float t = GameTime * 1200.0;
    int code = int(riftData.b * 16.0);
    int view = code - (code / 8) * 8;
    bool night = code >= 8;
    vec3 dir = normalize(worldRay);
    // Clear moving destination detail rather than the old opaque nine-tap blurred painting.
    vec2 uv = riftData.rg;
    vec3 bentRay = normalize(dir + vec3(sin(uv.y*16.0-t*1.3), cos(uv.x*13.0+t), 0.0)*0.012);
    vec3 col = destination(view, bentRay, t);
    // Warm golden-white or cyan core bloom pouring through the center of the window
    vec2 d = riftData.rg - 0.5;
    float core = exp(-dot(d, d) * 8.5);
    float coreK = view == 5 ? 0.92 : (view == 3 ? (night ? 0.72 : 0.48) : (view == 0 ? 0.48 : (view == 4 ? 0.42 : 0.25)));
    vec3 coreCol = (view == 4) ? vec3(0.92, 1.0, 1.0) : ((view == 3 || view == 0) ? vec3(1.0, 0.95, 0.82) : vec3(1.0, 0.98, 0.93));
    col = mix(col, coreCol, core * coreK * 0.18);
    if (view == 3 && night) col = mix(col, mix(vec3(1.0, 0.68, 0.78), vec3(1.0, 0.95, 0.92), riftData.g), 0.12);
    fragColor = apply_fog(vec4(min(col, vec3(1.0)), gl_FrontFacing ? 0.32 : 0.18) * ColorModulator, sphericalVertexDistance, cylindricalVertexDistance,
        FogEnvironmentalStart, FogEnvironmentalEnd, FogRenderDistanceStart, FogRenderDistanceEnd, FogColor);
#endif
}
