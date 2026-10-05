#version 330
#extension GL_ARB_separate_shader_objects : require

// 0.42 reference-accurate screen-space rift (single flat quad, one pass).
// Rebuilt after side-by-side review of the MCD2 frames: the rift is a CHUNKY CLUSTER -
// a fat stepped cross fused with large attached glass-box lobes and a few drifting
// floaters. Every cube carries a thin neon-white outline with a soft glow; the lobe
// faces are frosted glass (the warped world shows through, whitened) with a faked 3D
// extrusion; the cross interior is a soft emissive pastel cloud (pink / warm yellow /
// deep orange, near-white hot core) with floating spark pixels; and a tinted haze aura
// surrounds the cluster, liquid-warping the copied framebuffer (Sampler1 + Sampler0
// depth guard) both inside the portal and in the halo, for the gravitational-lensing
// frames. No clustered 3D block geometry: all of this is bounding math on the quad UV.

#include <minecraft:fog.glsl>
#include <minecraft:globals.glsl>
#include <minecraft:dynamictransforms.glsl>

layout(location = 0) in vec4 riftData;
layout(location = 1) in vec3 worldRay;
layout(location = 2) in float sphericalVertexDistance;
layout(location = 3) in float cylindricalVertexDistance;
layout(location = 4) in vec2 screenPos;

layout(location = 0) out vec4 fragColor;
layout(location = 1) out vec4 packLight;
layout(location = 2) out vec4 packNormal;

#ifdef RIFT_PLANE_LENS
uniform sampler2D Sampler0; // copied scene depth, nearest, reverse-Z (depth guard)
uniform sampler2D Sampler1; // copied scene colour = the world behind the plane
#endif

// Per-view hue influence (destinations keep their identity; the cloud stays pastel).
const vec3 TINT[8] = vec3[8](
    vec3(0.97, 0.60, 0.40), vec3(0.95, 0.25, 0.18), vec3(0.65, 0.38, 0.85), vec3(1.0, 0.58, 0.65),
    vec3(0.20, 0.80, 0.95), vec3(0.95, 0.85, 0.25), vec3(1.0, 0.97, 0.96), vec3(1.0, 0.78, 0.52));

// Attached glass-box lobes (cx, cy, hx, hy) - the chunky cluster around the cross.
const vec4 LOBES[6] = vec4[6](
    vec4(-0.68,  0.10, 0.24, 0.20),
    vec4( 0.72,  0.02, 0.22, 0.26),
    vec4(-0.42, -0.44, 0.20, 0.16),
    vec4( 0.46,  0.44, 0.18, 0.14),
    vec4(-0.60,  0.46, 0.14, 0.12),
    vec4( 0.64, -0.46, 0.16, 0.12));

float hash21(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
}

float vnoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    float a = hash21(i), b = hash21(i + vec2(1.0, 0.0));
    float c = hash21(i + vec2(0.0, 1.0)), d = hash21(i + vec2(1.0, 1.0));
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float fbm2(vec2 p) { return 0.65 * vnoise(p) + 0.35 * vnoise(p * 2.13 + 4.7); }

// Signed box distance (negative inside).
float sdBox(vec2 q, vec2 c, vec2 h) {
    vec2 d = abs(q - c) - h;
    return max(d.x, d.y);
}

// Thin neon line at a box boundary (1 on the edge, 0 away from it).
float edgeLine(float sd, float w) { return 1.0 - smoothstep(w * 0.40, w, abs(sd)); }

// Fat stepped cross: wide arms + core + tier notches (the reference silhouette).
float crossField(vec2 q) {
    float sd = sdBox(q, vec2(0.0), vec2(0.20, 0.58));
    sd = min(sd, sdBox(q, vec2(0.0), vec2(0.58, 0.20)));
    sd = min(sd, sdBox(q, vec2(0.0), vec2(0.32, 0.32)));
    sd = min(sd, sdBox(q, vec2(0.0,  0.46), vec2(0.12, 0.14)));
    sd = min(sd, sdBox(q, vec2(0.0, -0.46), vec2(0.12, 0.14)));
    sd = min(sd, sdBox(q, vec2( 0.46, 0.0), vec2(0.14, 0.12)));
    sd = min(sd, sdBox(q, vec2(-0.46, 0.0), vec2(0.14, 0.12)));
    return sd;
}

// Small detached floaters, weightless on low-frequency sines. Returns (line, glass).
vec2 shellField(vec2 q, int i, float t) {
    float fi = float(i);
    vec2 c = vec2(
        (fract(fi * 0.6180339 + 0.21) * 2.0 - 1.0) * 0.88,
        (fract(fi * 0.3819660 + 0.37) * 2.0 - 1.0) * 0.82);
    c += vec2(0.012 * sin(t * 0.45 + fi * 1.71), 0.028 * sin(t * 0.31 + fi * 2.23));
    vec2 h = vec2(0.075 + 0.05 * fract(fi * 0.4142135), 0.075 + 0.06 * fract(fi * 0.7320508));
    float sd = sdBox(q, c, h);
    return vec2(edgeLine(sd, 0.020), 1.0 - smoothstep(-0.006, 0.006, sd));
}

float fogFade() {
    return 1.0 - smoothstep(FogRenderDistanceStart, FogRenderDistanceEnd, sphericalVertexDistance);
}

void main() {
    packLight = vec4(1.0, 1.0, 0.0, 1.0);
    packNormal = vec4(0.5, 0.5, 1.0, 0.0);
    float t = GameTime * 1200.0;
    int view = int(riftData.b * 32.0) % 8;
    vec3 tint = TINT[view];
    float frostAmt = clamp(riftData.a * 2.0 - 1.0, 0.0, 1.0);
    float fade = clamp(riftData.a * 2.0 - frostAmt, 0.0, 1.0);
    vec2 q = (riftData.rg * 2.0 - 1.0) * vec2(1.0, 1.12);

    // ---- opening lifecycle (dormant -> white arc -> ignition -> reveal) ----
    float arcAmt   = smoothstep(0.16, 0.30, fade) * (1.0 - smoothstep(0.44, 0.60, fade));
    float whiteOut = smoothstep(0.42, 0.66, fade);
    float reveal   = smoothstep(0.66, 0.94, fade);

    // ---- bounding math: cross + lobes (+faked extrusion) + floaters ----
    float sdC = crossField(q);
    float crossIn = 1.0 - smoothstep(-0.006, 0.006, sdC);
    float sdAll = sdC;
    float edge = edgeLine(sdC, 0.024);
    float glow = exp(-abs(sdC) * 22.0);
    float lobeIn = 0.0, sideIn = 0.0;
    for (int i = 0; i < 6; i++) {
        vec4 L = LOBES[i];
        float f = sdBox(q, L.xy, L.zw);
        float b = sdBox(q - vec2(0.07, 0.06), L.xy, L.zw);   // extruded back face
        float frontIn = 1.0 - smoothstep(-0.006, 0.006, f);
        float backIn  = 1.0 - smoothstep(-0.006, 0.006, b);
        lobeIn = max(lobeIn, frontIn);
        sideIn = max(sideIn, backIn * (1.0 - frontIn));
        edge = max(edge, edgeLine(f, 0.020));
        edge = max(edge, edgeLine(b, 0.020) * (1.0 - frontIn));
        glow = max(glow, exp(-abs(f) * 22.0));
        sdAll = min(sdAll, f);
    }
    float floatLine = 0.0, floatIn = 0.0;
    for (int i = 0; i < 4; i++) {
        vec2 sh = shellField(q, i, t);
        floatLine = max(floatLine, sh.x);
        floatIn = max(floatIn, sh.y);
    }
    edge = max(edge, floatLine);
    glow = max(glow, floatLine * 0.8);

    float anyMask = max(max(crossIn, lobeIn), max(sideIn, max(floatIn, max(edge, glow * 0.4))));
    if (anyMask < 0.004 && arcAmt < 0.01) {
        fragColor = vec4(0.0);
        return;
    }

    // ---- gravitational lensing: wave-matrix warp of the world framebuffer ----
    vec3 bg = tint * 0.35;
    vec2 warpAmt = vec2(0.0);
#ifdef RIFT_PLANE_LENS
    vec2 size = vec2(textureSize(Sampler1, 0));
    vec2 texel = 1.0 / size;
    float outside = max(sdAll, 0.0);
    float auraZone = exp(-outside * 4.0);
    float lensZone = crossIn * 0.9 + lobeIn * 0.5 + auraZone * 1.2;
    vec2 wave = vec2(
        sin(screenPos.y * 42.0 + t * 1.35) + 0.5 * sin(screenPos.y * 17.0 - t * 0.7),
        cos(screenPos.x * 38.0 - t * 1.10) + 0.5 * cos(screenPos.x * 15.0 + t * 0.6));
    vec2 sampleUv = clamp(screenPos + wave * texel * 9.0 * lensZone, texel * 0.5, vec2(1.0) - texel * 0.5);
    // Reverse-Z depth guard: never drag an occluder into the portal.
    float warpedDepth = texture(Sampler0, sampleUv).r;
    if (warpedDepth > gl_FragCoord.z + 0.00001) sampleUv = screenPos;
    bg = texture(Sampler1, sampleUv).rgb;
    warpAmt = wave * lensZone;
#endif

    // ---- soft emissive pastel cloud inside the cross ----
    vec2 eq = floor(q * 26.0) / 26.0;                    // gentle voxel snap
    float n1 = fbm2(eq * 2.3 + vec2(-t * 0.020,  t * 0.015));
    float n2 = fbm2(eq * 3.1 + 7.7 + vec2(t * 0.016, -t * 0.012));
    vec3 pink   = vec3(1.00, 0.62, 0.72);
    vec3 yellow = vec3(1.00, 0.85, 0.45);
    vec3 orange = vec3(0.95, 0.45, 0.20);
    vec3 energy = mix(orange, yellow, smoothstep(0.32, 0.68, n1));
    energy = mix(energy, pink, smoothstep(0.42, 0.78, n2));
    energy = mix(energy, tint, 0.12);
    float hot = exp(-1.1 * dot(q, q));
    energy = mix(energy, vec3(1.0), 0.12 + 0.32 * hot);  // near-white hot core like the refs
    energy *= 0.92 + 0.28 * n1;
    energy = mix(energy, vec3(1.0), step(0.94, hash21(floor(q * 22.0) + 3.3)));  // spark pixels

    // ---- layer stack (back to front): aura haze, extrusion sides, glass, energy, edges ----
    vec3 col = bg;
    float a = 0.0;
    float aura = exp(-max(length(q * vec2(0.9, 1.0)) - 0.80, 0.0) * 3.0) * 0.36 * reveal;
    vec3 auraCol = mix(energy, vec3(1.0), 0.30);
    col = mix(col, auraCol, aura); a = aura;

    float aSide = sideIn * 0.48;
    vec3 sideCol = mix(bg, tint, 0.45) * 0.85 + 0.10;
    col = mix(col, sideCol, aSide * (1.0 - a)); a = a + aSide * (1.0 - a);

    float aGlass = lobeIn * 0.55;
    vec3 glassCol = mix(bg, vec3(1.0), 0.70);
    col = mix(col, glassCol, aGlass * (1.0 - a)); a = a + aGlass * (1.0 - a);

    float aFloat = floatIn * 0.45;
    col = mix(col, glassCol, aFloat * (1.0 - a)); a = a + aFloat * (1.0 - a);

    float aEn = crossIn * 0.93;
    col = mix(col, energy, aEn * (1.0 - a)); a = a + aEn * (1.0 - a);

    col = mix(col, vec3(1.0), edge); a = a + edge * (1.0 - a);   // neon outlines
    col += glow * 0.22;                                          // soft bloom halo

    // white arc / ignition flash
    float ringR = mix(0.18, 1.35, smoothstep(0.16, 0.60, fade));
    float thick = mix(0.30, 0.09, smoothstep(0.16, 0.60, fade));
    float arc = 1.0 - smoothstep(thick * 0.35, thick, abs(length(q) - ringR));
    col = mix(col, vec3(1.0, 0.99, 0.98), whiteOut * (1.0 - reveal) * max(crossIn, lobeIn));
    col = mix(col, vec3(1.0), arc * arcAmt * 0.9);
    a = max(a, arc * arcAmt * 0.85);

    a *= mix(0.10, 1.0, smoothstep(0.04, 0.30, fade));
    a *= fogFade() * mix(0.35, 1.0, fade);

    fragColor = vec4(min(col, vec3(1.5)), a) * ColorModulator;
}
