#version 330
#extension GL_ARB_separate_shader_objects : require

// Private 26.3 pipelines; never override vanilla water/glass translucency.
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

#ifdef RIFT_REFRACT
uniform sampler2D Sampler0; // copied scene depth, nearest, reverse-Z
uniform sampler2D Sampler1; // copied scene colour, linear, clamp-to-edge
#endif

// Eight rift styles: 0-5 are destinations, 6 is the white reference cross, 7 is the steep olive-lime wall.
const vec3 TINT[8] = vec3[8](
    vec3(1.0, 0.62, 0.52), vec3(0.95, 0.25, 0.18), vec3(0.65, 0.38, 0.85), vec3(1.0, 0.58, 0.68),
    vec3(0.20, 0.80, 0.95), vec3(0.95, 0.85, 0.25), vec3(1.0, 0.97, 0.96), vec3(1.0, 0.78, 0.52));

const vec3 TINT_B[8] = vec3[8](
    vec3(1.0, 0.86, 0.62), vec3(0.45, 0.06, 0.08), vec3(0.18, 0.14, 0.42), vec3(0.98, 0.78, 0.56),
    vec3(0.75, 1.0, 1.0), vec3(1.0, 0.95, 0.60), vec3(1.0, 1.0, 1.0), vec3(0.62, 0.96, 0.32));

// Measured reference frost tones: warm pink, crimson, violet, coral-pink, cyan, gold, pure white, lime-olive.
const vec3 FROST[8] = vec3[8](
    vec3(0.94, 0.78, 0.78), vec3(0.86, 0.44, 0.40), vec3(0.56, 0.46, 0.68), vec3(0.94, 0.80, 0.84),
    vec3(0.52, 0.84, 0.92), vec3(0.92, 0.88, 0.66), vec3(0.98, 0.97, 0.97), vec3(0.68, 0.88, 0.44));

float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
}

vec2 rot2D(vec2 p, float a) {
    float c = cos(a), s = sin(a);
    return vec2(p.x * c - p.y * s, p.x * s + p.y * c);
}

// Exact 2D Signed Distance Field for an axis-aligned box of half-extents b.
float sdBox(vec2 p, vec2 b) {
    vec2 d = abs(p) - b;
    return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
}

// ============================================================================
// PART 2: JAGGED VOXEL CANAL MATRICES VIA GLSL SIGNED DISTANCE FIELDS (SDFs)
// ============================================================================

// Evaluates the unified central stepped-cross SDF (Tiers 0 & 1):
//   - Tier 0: Central vertical body (no internal grid lines)
//   - Tier 1: Narrow top tower cap, left horizontal arm, longer right horizontal arm
float sdMainCross(vec2 p, float u_Progress, float shrink) {
    vec2 s = vec2(shrink);
    // Tier 0 (unlocks at u_Progress >= 0.60): central vertical body
    float dBody = sdBox(p - vec2(0.00, -0.05), max(vec2(0.01), vec2(0.25, 0.39) - s));
    float d = dBody;
    // Tier 1 (unlocks at u_Progress >= 0.68): top tower + left arm + longer right arm
    if (u_Progress >= 0.68) {
        float grow1 = clamp((u_Progress - 0.68) / 0.08, 0.0, 1.0);
        float dTop  = sdBox(p - vec2(0.00, 0.34 + 0.15 * grow1), max(vec2(0.01), vec2(0.078, 0.16 * grow1) - s));
        float dLeft = sdBox(p - vec2(-0.25 - 0.11 * grow1, -0.02), max(vec2(0.01), vec2(0.115 * grow1, 0.125) - s));
        float dRight = sdBox(p - vec2(0.25 + 0.18 * grow1, -0.02), max(vec2(0.01), vec2(0.185 * grow1, 0.125) - s));
        d = min(d, min(dTop, min(dLeft, dRight)));
    }
    return d;
}

// Evaluates the 10 attached & detached hollow voxel boxes and L/Z tetrominoes (Tiers 2 & 3).
// Returns vec2(dFrontOutline, dRecessedBackOutline).
vec2 sdHollowOverlays(vec2 p, vec2 parallax, float u_Progress) {
    float dFront = 1e5;
    float dBack  = 1e5;
    vec2 pBack = p + parallax * 0.95;
    vec2 inset = vec2(0.022);

    // Tier 2 (unlocks at u_Progress >= 0.78):
    //   L1: Lower-left drop-step square box
    //   L2: Far-left mid square box
    //   R1: Upper-right claw prong
    //   R2: Lower-right L-shaped claw prong
    if (u_Progress >= 0.78) {
        float g2 = clamp((u_Progress - 0.78) / 0.08, 0.0, 1.0);
        vec2 hL1 = vec2(0.145, 0.145) * g2;
        vec2 hL2 = vec2(0.145, 0.140) * g2;
        vec2 hR1 = vec2(0.125, 0.078) * g2;
        vec2 hR2a = vec2(0.105, 0.085) * g2;
        vec2 hR2b = vec2(0.042, 0.068) * g2;

        float bL1 = sdBox(p - vec2(-0.49, -0.29), hL1);
        float bL2 = sdBox(p - vec2(-0.69, -0.01), hL2);
        float bR1 = sdBox(p - vec2(0.68, 0.18), hR1);
        float bR2 = min(sdBox(p - vec2(0.67, -0.24), hR2a), sdBox(p - vec2(0.733, -0.11), hR2b));
        dFront = min(min(bL1, bL2), min(bR1, bR2));

        float kL1 = sdBox(pBack - vec2(-0.49, -0.29), max(vec2(0.01), hL1 - inset));
        float kL2 = sdBox(pBack - vec2(-0.69, -0.01), max(vec2(0.01), hL2 - inset));
        float kR1 = sdBox(pBack - vec2(0.68, 0.18), max(vec2(0.01), hR1 - inset));
        float kR2 = min(sdBox(pBack - vec2(0.67, -0.24), max(vec2(0.01), hR2a - inset)),
                        sdBox(pBack - vec2(0.733, -0.11), max(vec2(0.01), hR2b - inset * 0.6)));
        dBack = min(min(kL1, kL2), min(kR1, kR2));
    }

    // Tier 3 (unlocks at u_Progress >= 0.88):
    //   L3: Upper-left stepped Z-tetromino cluster
    //   R3: Upper-right floating horizontal brick
    //   S1..S4: 4 small floating notch squares
    if (u_Progress >= 0.88) {
        float g3 = clamp((u_Progress - 0.88) / 0.08, 0.0, 1.0);
        float bL3 = min(sdBox(p - vec2(-0.52, 0.05), vec2(0.044, 0.082) * g3),
                        sdBox(p - vec2(-0.46, 0.15), vec2(0.044, 0.088) * g3));
        float bR3 = sdBox(p - vec2(0.73, 0.35), vec2(0.058, 0.036) * g3);
        float bS1 = sdBox(p - vec2(-0.19, 0.42), vec2(0.046, 0.046) * g3);
        float bS2 = sdBox(p - vec2(0.32, 0.19), vec2(0.046, 0.046) * g3);
        float bS3 = sdBox(p - vec2(-0.77, -0.25), vec2(0.044, 0.044) * g3);
        float bS4 = sdBox(p - vec2(-0.34, -0.53), vec2(0.044, 0.044) * g3);
        dFront = min(dFront, min(min(bL3, bR3), min(min(bS1, bS2), min(bS3, bS4))));

        vec2 pBack3 = p + parallax * 0.70;
        float kL3 = min(sdBox(pBack3 - vec2(-0.52, 0.05), max(vec2(0.008), vec2(0.030, 0.068) * g3)),
                        sdBox(pBack3 - vec2(-0.46, 0.15), max(vec2(0.008), vec2(0.030, 0.074) * g3)));
        float kR3 = sdBox(pBack3 - vec2(0.73, 0.35), max(vec2(0.008), vec2(0.044, 0.024) * g3));
        float kS1 = sdBox(pBack3 - vec2(-0.19, 0.42), max(vec2(0.008), vec2(0.032, 0.032) * g3));
        float kS2 = sdBox(pBack3 - vec2(0.32, 0.19), max(vec2(0.008), vec2(0.032, 0.032) * g3));
        float kS3 = sdBox(pBack3 - vec2(-0.77, -0.25), max(vec2(0.008), vec2(0.030, 0.030) * g3));
        float kS4 = sdBox(pBack3 - vec2(-0.34, -0.53), max(vec2(0.008), vec2(0.030, 0.030) * g3));
        dBack = min(dBack, min(min(kL3, kR3), min(min(kS1, kS2), min(kS3, kS4))));
    }

    return vec2(dFront, dBack);
}

// Procedural GLSL lightning branches for Phases 1 & 2 (Ticks 0-60).
float shaderLightning(vec2 p, float t, float reach) {
    float r = length(p);
    if (r > reach || r < 0.015) return 0.0;
    float ang = atan(p.y, p.x);
    float stepTime = floor(t * 7.5);
    float bolts = 0.0;
    for (int i = 0; i < 6; i++) {
        float fi = float(i);
        float targetAng = -1.57 + (fi - 2.5) * 0.95 + 0.35 * sin(stepTime * 1.7 + fi * 2.3);
        float da = atan(sin(ang - targetAng), cos(ang - targetAng));
        float kink = 0.08 * sin(r * 19.0 - stepTime * 3.1 + fi * 4.7)
                   + 0.04 * cos(r * 37.0 + stepTime * 5.3 - fi * 2.1);
        float dist = abs(da * r - kink);
        float env = smoothstep(reach, reach * 0.15, r) * smoothstep(0.01, 0.08, r);
        bolts += exp(-dist * 110.0) * env;
    }
    return clamp(bolts, 0.0, 1.5);
}

// Vertical Aurora Borealis curtains rising behind the SDF silhouette (183634.png, 183641.png, 175013.png):
// Emerald/Mint-Green on the left, Electric Cyan at center-top, Vibrant Magenta/Violet on the right.
vec3 auroraCurtainsBehind(vec2 p, float dAll, float t, float u_Progress) {
    float curtainWave = 0.5 + 0.5 * sin(p.x * 16.0 + sin(p.y * 4.5 - t * 1.4) * 1.6 + t * 0.8);
    float curtainFine = 0.5 + 0.5 * cos(p.x * 29.0 - p.y * 3.2 - t * 2.1);
    float streaks = mix(curtainWave, curtainFine, 0.42);

    vec3 leftGreen   = vec3(0.20, 0.95, 0.66);
    vec3 centerCyan  = vec3(0.24, 0.96, 0.98);
    vec3 rightPurple = vec3(0.96, 0.30, 0.82);

    float wLeft  = smoothstep(0.10, -0.35, p.x);
    float wRight = smoothstep(-0.10, 0.35, p.x);
    float wMid   = clamp(1.0 - wLeft - wRight, 0.0, 1.0);
    vec3 auroraCol = leftGreen * wLeft + centerCyan * wMid + rightPurple * wRight;

    float birthBoost = (u_Progress >= 0.58 && u_Progress < 1.0)
        ? (1.0 + 1.35 * sin(clamp((u_Progress - 0.58) / 0.42, 0.0, 1.0) * 3.14159))
        : 1.0;
    float haloFalloff = exp(-max(dAll, 0.0) * (5.2 / birthBoost)) * (0.55 + 0.45 * streaks);
    float verticalReach = smoothstep(-0.78, 0.78, p.y) * 0.35 + 0.65;
    return auroraCol * haloFalloff * verticalReach * (0.48 * birthBoost);
}

// ============================================================================
// PART 3: NON-EUCLIDEAN VIEWPORT REFRACTION, MULTI-PASS BOX BLUR & SHIMMER
// ============================================================================

// Layer 1: Radial Back-Distortion Field
vec2 backDistortion(vec2 uv, float t, float r2, float openRamp) {
    vec2 centered = uv - 0.5;
    float r = sqrt(r2 + 1e-5);
    float wave = sin(r * 16.0 - t * 3.2) * 0.012 + cos(centered.y * 11.0 + t * 2.1) * 0.008;
    return (centered / max(r, 0.15)) * wave * openRamp;
}

// Layer 2: Stepped-Cross Aperture Field
float apertureField(vec2 uv, float r2) {
    vec2 d = abs(uv - 0.5) * 2.0;
    float crossMask = min(max(d.x * 0.72, d.y), max(d.x, d.y * 0.72));
    return clamp(1.0 - 0.35 * crossMask - 0.15 * r2, 0.0, 1.0);
}

// Layer 4: Wavy Dark "Soul Face" Band (organic fBM-warped dark depth bands inside the Rift)
vec4 soulFaceBand(vec2 uv, vec3 dir, float t, bool night) {
    float az = atan(dir.z, dir.x);
    vec2 p = (uv - 0.5) * 2.4 + vec2(az * 0.25, dir.y * 0.35);
    float w1 = sin(p.x * 3.2 + t * 0.55 + sin(p.y * 2.7 - t * 0.42) * 1.3);
    float w2 = cos(p.y * 4.1 - t * 0.48 + cos(p.x * 3.5 + t * 0.36) * 1.2);
    float fbm = 0.5 + 0.28 * w1 + 0.22 * w2;
    float ring = length(uv - 0.5) * 2.0;
    float edgeBias = smoothstep(0.28, 0.92, ring);
    float faceMask = fbm * (0.52 + 0.48 * edgeBias);
    float band = smoothstep(0.70, 0.88, faceMask);
    vec3 darkSoul = vec3(0.02, 0.02, 0.04);
    float strength = night ? 0.32 : 0.22;
    return vec4(darkSoul, band * strength);
}

// Layer 5: Multi-Tone Interior Energy Swirl (Vibrant Coral/Pink by day, Deep Amber/Gold by night, plus style tints)
vec3 interiorEnergy(vec2 uv, vec3 dir, float t, int v, bool night) {
    vec3 primary   = TINT[v];
    vec3 secondary = TINT_B[v];
    vec3 warmGold  = night ? vec3(0.96, 0.58, 0.24) : vec3(1.00, 0.78, 0.46);
    vec3 coralPink = night ? vec3(0.92, 0.38, 0.68) : vec3(1.00, 0.52, 0.66);

    float s1 = 0.5 + 0.5 * sin(uv.x * 6.0 + uv.y * 4.5 - t * 1.15 + dir.x * 2.2);
    float s2 = 0.5 + 0.5 * cos(uv.y * 7.2 - uv.x * 5.0 + t * 0.95 + dir.y * 2.4);
    vec3 swirl = mix(primary, secondary, s1);
    swirl = mix(swirl, coralPink, 0.38 * (1.0 - s1) * s2);
    swirl = mix(swirl, warmGold, 0.32 * s1 * s2);
    return swirl;
}

// Layer 6: Inner Edge Glow
vec3 innerGlow(vec2 uv, float r2, int v) {
    float rimProx = smoothstep(0.12, 0.88, r2 * 2.4);
    return mix(TINT[v], vec3(1.0, 0.98, 0.96), 0.58) * rimProx * 0.38;
}

// Layer 7: Crisp Floating Pixel-Square Sparkles & Two-Depth Mosaic inside the Rift cavity (195208.png, 195216.png, 194743.png)
vec3 floatingLightSquares(vec2 uv, vec3 dir, float t, int v) {
    vec2 parUv = uv + vec2(dir.x, dir.y) * 0.08;
    vec2 backCell = floor(parUv * 9.0 + vec2(0.0, -t * 0.22));
    vec2 backLocal = fract(parUv * 9.0 + vec2(0.0, -t * 0.22)) - 0.5;
    float backPick = step(0.76, hash21(backCell + float(v) * 7.0));
    float backSq = step(max(abs(backLocal.x), abs(backLocal.y)), 0.30) * backPick;

    vec2 frontCell = floor(parUv * 14.0 + vec2(sin(t * 0.25) * 0.3, -t * 0.38));
    vec2 frontLocal = fract(parUv * 14.0 + vec2(sin(t * 0.25) * 0.3, -t * 0.38)) - 0.5;
    float frontPick = step(0.82, hash21(frontCell + 19.0 + float(v) * 3.0));
    float frontSq = step(max(abs(frontLocal.x), abs(frontLocal.y)), 0.26) * frontPick;

    vec3 acc = TINT_B[v] * backSq * 0.26 + mix(TINT[v], vec3(1.0), 0.72) * frontSq * 0.48;

    // 16 deterministic drifting pixel squares inside the cavity
    for (int i = 0; i < 16; i++) {
        float fi = float(i);
        float seedA = hash21(vec2(fi * 1.37, float(v) + 3.1));
        float seedB = hash21(vec2(fi * 2.91, float(v) + 8.7));
        float cycle = fract(seedB + t * (0.045 + 0.03 * seedA));
        vec2 center = vec2(
            0.22 + 0.56 * fract(seedA * 7.13 + sin(t * 0.35 + fi) * 0.04),
            0.16 + 0.68 * cycle
        );
        float halfSize = mix(0.010, 0.022, fract(seedA * 3.7));
        vec2 d = abs(parUv - center);
        float sq = smoothstep(halfSize, halfSize * 0.62, max(d.x, d.y));
        float env = sin(cycle * 3.14159265);
        vec3 sqCol = (i % 3 == 0) ? vec3(1.0, 0.99, 0.95)
                   : (i % 3 == 1) ? mix(TINT[v], vec3(1.0, 0.92, 0.68), 0.55)
                                  : mix(TINT_B[v], vec3(0.55, 0.98, 1.0), 0.55);
        acc += sqCol * sq * env * 0.52;
    }
    return acc;
}

// Layer 8: Soft Volumetric God-Ray Streaming
vec3 riftGodRays(vec2 uv, vec3 dir, float t, int v, bool night) {
    vec2 centered = uv - vec2(0.5, 0.54);
    float angle = atan(centered.y, centered.x);
    float dist = length(centered);
    float rays = 0.5 + 0.5 * sin(angle * 7.0 + t * 0.65 + dir.x * 3.0);
    rays *= 0.5 + 0.5 * cos(angle * 11.0 - t * 0.48);
    float radial = exp(-dist * 2.2) * smoothstep(0.0, 0.35, 1.0 - dist);
    float tideBoost = night ? 0.24 : 0.42;
    return mix(TINT[v], vec3(1.0, 0.96, 0.88), 0.5) * rays * radial * tideBoost;
}

// Layer 9: Soft Over-Exposure Bloom Halo
vec3 riftBloom(vec2 uv, float r2, float t, int v) {
    float core = exp(-r2 * 4.2);
    float rim = exp(-pow(r2 - 0.22, 2.0) * 18.0);
    float pulse = 0.88 + 0.12 * sin(t * 1.9);
    return mix(TINT[v], vec3(1.0, 0.98, 0.95), 0.55) * (0.20 * core + 0.26 * rim) * pulse;
}

// Single slice of the procedural destination world seen through the Rift.
vec3 destinationSlice(vec3 dir, float t, int v, bool night) {
    float az = atan(dir.z, dir.x);
    float y = clamp(dir.y * 1.35 + 0.15, -1.0, 1.0);
    vec3 primary = TINT[v];
    vec3 secondary = TINT_B[v];
    vec3 warmHorizon = night ? vec3(0.92, 0.52, 0.32) : vec3(1.00, 0.76, 0.52);

    vec3 zenith  = mix(secondary, primary, 0.45);
    vec3 horizon = mix(primary, warmHorizon, 0.55);
    vec3 nadir   = mix(primary * 0.55, secondary * 0.65, 0.50);
    vec3 sky = y > 0.0 ? mix(horizon, zenith, smoothstep(0.0, 0.95, y))
                       : mix(nadir, horizon, smoothstep(-0.95, 0.0, y));

    float farRidge  = -0.08 + 0.14 * sin(az * 2.5 + float(v) * 1.7 + t * 0.42)
                            + 0.07 * cos(az * 5.0 - t * 0.31);
    float nearRidge = -0.26 + 0.16 * sin(az * 3.5 - float(v) * 2.3 - t * 0.36)
                            + 0.08 * sin(az * 7.0 + 1.1 + t * 0.28);
    float wave1 = smoothstep(farRidge - 0.28, farRidge + 0.28, y);
    float wave2 = smoothstep(nearRidge - 0.28, nearRidge + 0.28, y);
    vec3 col = mix(mix(primary, warmHorizon, 0.48), sky, 0.45 + 0.55 * wave1);
    col = mix(mix(secondary, primary, 0.45), col, 0.50 + 0.50 * wave2);

    float sunAz = 0.35 * sin(t * 0.18 + float(v));
    float sun = length(vec2(atan(sin(az - sunAz), cos(az - sunAz)) * 0.75, y - 0.22));
    col += mix(vec3(1.0, 0.97, 0.90), primary, 0.28) * (0.46 * exp(-sun * 4.8) + 0.22 * exp(-sun * 1.8));

    float mx = az * 9.0 + sin(y * 6.0 + t * 0.7);
    float my = y * 11.0 - t * 0.65;
    float motes = sin(mx) * cos(my);
    col += mix(secondary, vec3(1.0), 0.55) * smoothstep(0.84, 0.98, motes) * 0.28;
    return col;
}

// Multi-pass 3x3 box-blurred destination projection linked to camera view ray.
vec3 destination(vec3 dir, float t, int v, bool night, float blur) {
    vec3 up = abs(dir.y) < 0.95 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
    vec3 right = normalize(cross(dir, up));
    vec3 orthoUp = cross(right, dir);
    float b = max(0.018, blur * 1.45);
    vec3 acc = vec3(0.0);
    for (int ox = -1; ox <= 1; ox++) {
        for (int oy = -1; oy <= 1; oy++) {
            vec2 o = vec2(float(ox), float(oy)) * b;
            vec3 sampleDir = normalize(dir + right * o.x + orthoUp * o.y);
            acc += destinationSlice(sampleDir, t, v, night);
        }
    }
    return acc / 9.0;
}

float fogFade() {
    return 1.0 - smoothstep(FogRenderDistanceStart, FogRenderDistanceEnd, sphericalVertexDistance);
}

void main() {
#if defined(RIFT_GLOW)
    packLight = vec4(0.0);
    packNormal = vec4(0.0);
    fragColor = vec4(riftData.rgb, riftData.a * fogFade()) * ColorModulator;
#elif defined(RIFT_WALL)
    packLight = vec4(1.0, 1.0, 0.0, 1.0);
    packNormal = vec4(0.5, 0.5, 1.0, 0.0);
    fragColor = apply_fog(vec4(riftData.rgb, riftData.a * 0.82) * ColorModulator,
        sphericalVertexDistance, cylindricalVertexDistance, FogEnvironmentalStart, FogEnvironmentalEnd,
        FogRenderDistanceStart, FogRenderDistanceEnd, FogColor);
#else
    packLight = vec4(1.0, 1.0, 0.0, 1.0);
    packNormal = vec4(0.5, 0.5, 1.0, 0.0);

    float t = GameTime * 1200.0;
    float gameTime = GameTime * 24000.0;
    vec2 uv = clamp(riftData.rg, 0.0, 1.0);
    int v = int(riftData.b * 32.0) % 8;
    bool night = int(riftData.b * 32.0) >= 8;

    // Decode front-plane lifecycle progress vs. volumetric extrusion slice fade:
    //   - Front SDF plane packs fade = 1.0 and frostAmt = u_Progress (0.0 .. 1.0 over Ticks 0..100).
    //   - Volumetric back-slices pack fade = sliceFade (< 0.90) and frostAmt = 0.0.
    float frostAmt = clamp(riftData.a * 2.0 - 1.0, 0.0, 1.0);
    float fade = clamp(riftData.a * 2.0 - frostAmt, 0.0, 1.0);
    bool isFrontPlane = (fade >= 0.94);
    float u_Progress = isFrontPlane ? frostAmt : 1.0;

    // Part 3: Dynamic sine-wave UV distortion for outer edge rippling and background lensing.
    vec2 rippleOffset = vec2(sin(uv.y * 14.0 + (gameTime * 0.05)), cos(uv.x * 10.0 - (gameTime * 0.03))) * 0.02;

    // Aspect-corrected SDF coordinate space [-1.15, 1.15] x [-0.875, 0.875].
    vec2 p = (uv - 0.5) * vec2(2.30, 1.75);
    vec3 dir = normalize(worldRay + vec3(0.0, 0.0, 1e-5));
    vec2 parallax = clamp(dir.xy * 0.068, vec2(-0.055), vec2(0.055));

    // Smooth radial safety feather at the outer edges of the quad canvas so the quad boundary is never visible.
    float quadEdgeMask = 1.0 - smoothstep(0.84, 0.99, max(abs(uv.x - 0.5) * 2.0, abs(uv.y - 0.5) * 2.0));

    // ========================================================================
    // PART 1: INITIALIZATION TIMELINE & FULL WHITE-OUT EFFECT (Ticks 0 - 60)
    // ========================================================================
    if (isFrontPlane && u_Progress < 0.60) {
        vec3 initCol = vec3(0.0);
        float initAlpha = 0.0;

        if (u_Progress < 0.30) {
            // PHASE 1 (Ticks 0 - 30): White-Out Flash & Expanding Circular Ripple (183624.png)
            float p1 = clamp(u_Progress / 0.30, 0.0, 1.0);
            float r = length(p + rippleOffset * 0.6);
            float ringRad = mix(0.06, 0.92, 1.0 - pow(1.0 - p1, 2.3));
            float ringBand = exp(-pow((r - ringRad) / 0.085, 2.0));
            float innerDisk = smoothstep(ringRad + 0.05, max(0.01, ringRad - 0.14), r);
            float coreFlash = exp(-r * r / mix(0.05, 0.42, sin(p1 * 3.14159265)));
            float bolts = shaderLightning(p, t, 0.95);

            vec3 whiteGold = vec3(1.0, 0.99, 0.95);
            vec3 pinkHalo  = vec3(1.0, 0.62, 0.84);
            initCol = mix(pinkHalo, whiteGold, clamp(coreFlash + ringBand * 0.85 + bolts, 0.0, 1.0));
            initCol = mix(initCol, vec3(1.0), clamp(coreFlash * 0.9 + ringBand * 0.6, 0.0, 1.0));
            initAlpha = clamp((innerDisk * 0.88 + ringBand * 0.95 + coreFlash + bolts * 0.85) * (1.0 - 0.15 * p1), 0.0, 0.98);
        } else {
            // PHASE 2 (Ticks 31 - 60): Tilted Pulsing Incubation Seed & Lightning Arcs (183539.png - 183618.png)
            float p2 = clamp((u_Progress - 0.30) / 0.30, 0.0, 1.0);
            float tilt = -0.36 + 0.24 * sin(p2 * 3.14159265 + t * 1.6);
            vec2 halfSeed = vec2(0.085 + 0.025 * p2, 0.25 + 0.07 * p2);
            float dSeed = sdBox(rot2D(p + rippleOffset * 0.3, tilt), halfSeed);
            float dSeedBack = sdBox(rot2D(p + parallax * 0.85 + rippleOffset * 0.3, tilt), halfSeed - vec2(0.022));

            float pulse = 0.72 + 0.28 * sin(t * 14.0);
            float seedInside = smoothstep(0.008, -0.008, dSeed);
            float seedRim = smoothstep(0.016, 0.002, abs(dSeed)) + smoothstep(0.012, 0.002, abs(dSeedBack)) * 0.65;
            float seedHalo = exp(-max(dSeed, 0.0) * 6.5) * pulse;
            float bolts = shaderLightning(p, t * 1.15, 0.98);

            vec3 seedFill = mix(vec3(1.0, 0.64, 0.76), vec3(1.0, 0.96, 0.92), 0.55 * pulse);
            initCol = seedFill * seedInside + vec3(1.0, 0.99, 0.96) * clamp(seedRim + bolts, 0.0, 1.2)
                    + vec3(1.0, 0.58, 0.80) * seedHalo * 0.75;
            initAlpha = clamp((seedInside * 0.94 * pulse + seedRim + seedHalo * 0.62 + bolts * 0.90), 0.0, 0.98);
        }

        initAlpha *= quadEdgeMask * fogFade();
        fragColor = vec4(clamp(initCol, 0.0, 1.0), initAlpha) * ColorModulator;
        return;
    }

    // ========================================================================
    // PART 2 & 3: STEPPED-CROSS SDF SILHOUETTE, CANAL BEVELS & VIEWPORT
    // ========================================================================
    vec2 pWavy = p + rippleOffset * 0.42;
    float dMain = sdMainCross(pWavy, u_Progress, 0.0);
    float dMainBack = sdMainCross(pWavy + parallax * 1.15, u_Progress, 0.042);
    vec2 dHollow = sdHollowOverlays(pWavy, parallax, u_Progress);
    float dBoxes = dHollow.x;
    float dBoxesBack = dHollow.y;
    float dAll = min(dMain, dBoxes);

    // Distance fade for the outer detached boxes ("tip fade" from 195208.png & 175013.png).
    float radialNorm = length(p * vec2(0.85, 1.05));
    float tipFade = 1.0 - smoothstep(0.62, 1.08, radialNorm);

    // Volumetric back-slices (emitted behind the front plane for side-angle extrusion in 195216.png & 163201.png):
    if (!isFrontPlane) {
        float sliceInside = smoothstep(0.015, -0.015, dAll);
        float sliceRim = smoothstep(0.020, 0.002, abs(dAll));
        float sliceHalo = exp(-max(dAll, 0.0) * 8.0) * 0.35;
        vec3 sliceCol = mix(FROST[v], TINT[v], 0.38) * (0.75 + 0.25 * tipFade);
        sliceCol = mix(sliceCol, vec3(1.0, 0.99, 0.97), clamp(sliceRim * 0.85, 0.0, 1.0));
        float sliceAlpha = clamp((sliceInside * 0.55 + sliceRim * 0.85 + sliceHalo) * (0.45 + 0.55 * tipFade), 0.0, 1.0)
                         * fade * quadEdgeMask * fogFade();
        fragColor = vec4(sliceCol, sliceAlpha) * ColorModulator;
        return;
    }

    // --- Front Shader Plane (isFrontPlane == true, u_Progress in [0.60, 1.00]) ---
    float openRamp = clamp((u_Progress - 0.60) / 0.40, 0.0, 1.0);
    // Blinding white-out exposure during Phase 3 fracture snap (183634.png -> 183641.png), 0.0 at Tick 100+.
    float whiteOut = (u_Progress < 0.995) ? pow(clamp(1.0 - (u_Progress - 0.60) / 0.38, 0.0, 1.0), 1.6) : 0.0;

    float r2 = dot(uv - 0.5, uv - 0.5);
    float edgeFade = exp(-0.18 * r2 * 4.0);
    float apField = apertureField(uv, r2);
    float phase = mod(t, 6.0);
    float pulse = 0.92 + 0.08 * sin(phase * 1.04719755);

    // Multi-pass box-blurred destination projection + 10-layer interior composition.
    float blur = 0.006 + 0.020 * frostAmt;
    vec3 col = destination(dir, t, v, night, blur);
    col = mix(col, interiorEnergy(uv, dir, t, v, night), 0.46) * pulse;

    vec4 darkBand = soulFaceBand(uv, dir, t, night);
    col = mix(col, darkBand.rgb, darkBand.a);

    col += floatingLightSquares(uv, dir, t, v) * apField;
    col += riftGodRays(uv, dir, t, v, night);
    col += innerGlow(uv, r2, v);
    col += riftBloom(uv, r2, t, v);

    // Frosted glass sheen over the cavity
    vec3 frost = mix(FROST[v], vec3(1.0), 0.22);
    float gloss = smoothstep(0.18, 0.85, uv.y) * 0.14 + exp(-r2 * 4.5) * 0.08;
    col = mix(col, frost, 0.14);
    col += vec3(1.0, 0.98, 0.95) * gloss * 0.28;

    // Recessed 3D-illusion inner canal walls inside the main stepped cross (dMain < 0 && dMainBack > 0):
    float mainInside = smoothstep(0.006, -0.006, dMain);
    float mainCanalBevel = mainInside * smoothstep(-0.010, 0.008, dMainBack);
    float mainInnerStepRim = mainInside * smoothstep(0.009, 0.0015, abs(dMainBack));
    vec3 bevelCol = mix(FROST[v], mix(TINT[v], vec3(1.0, 0.94, 0.88), 0.55), 0.65);
    col = mix(col, bevelCol, mainCanalBevel * 0.72);
    col = mix(col, vec3(1.0, 0.98, 0.95), mainInnerStepRim * 0.58);

    // Attached & detached hollow voxel boxes (L1, L2, L3, R1, R2, R3, S1..S4):
    float boxInside = smoothstep(0.006, -0.006, dBoxes) * (1.0 - mainInside);
    float boxRecessedWall = boxInside * smoothstep(-0.008, 0.008, dBoxesBack);
    vec3 boxPaneCol = mix(FROST[v], mix(TINT[v], vec3(1.0, 0.92, 0.86), 0.45), 0.52);
    col = mix(col, boxPaneCol, boxInside * (0.55 + 0.30 * boxRecessedWall));

    // Razor-sharp blinding pure-white SDF outlines (front rim + parallax-recessed back rim):
    float mainRim = smoothstep(0.013, 0.002, abs(dMain));
    float boxFrontRim = smoothstep(0.011, 0.0018, abs(dBoxes)) * (0.45 + 0.55 * tipFade);
    float boxBackRim = smoothstep(0.008, 0.0015, abs(dBoxesBack)) * (0.32 + 0.45 * tipFade);
    float totalWhiteRim = clamp(mainRim + boxFrontRim + boxBackRim * 0.70, 0.0, 1.0);
    col = mix(col, vec3(1.0, 0.995, 0.985), totalWhiteRim);

    // Outer Aurora Borealis curtains & soft neon rim bloom outside the SDF silhouette (dAll > 0):
    vec3 auroraHalo = auroraCurtainsBehind(p, dAll, t, u_Progress);
    vec3 rimGlow = mix(TINT[v], vec3(1.0, 0.96, 0.92), 0.45) * exp(-max(dAll, 0.0) * 14.0) * 0.65;
    float outerMask = 1.0 - smoothstep(0.004, -0.004, dAll);
    col = mix(col, auroraHalo + rimGlow + vec3(1.0) * totalWhiteRim, outerMask);

    // Phase 3 White-Out Snap override (183634.png -> 183641.png):
    if (whiteOut > 0.001) {
        col = mix(col, vec3(1.0, 0.995, 0.99), clamp(whiteOut * (1.0 - outerMask * 0.45), 0.0, 1.0));
    }

    // Scene refraction & real-time rippleOffset lensing along the outer boundary:
    float destAmt = smoothstep(0.05, 0.45, edgeFade);
    float sdfLensingMask = smoothstep(0.14, -0.01, dAll);
    destAmt = clamp(sdfLensingMask, 0.0, 1.0);

    vec2 radWarp = backDistortion(uv, t, r2, openRamp);
    vec2 bend = (rippleOffset + radWarp) * (1.0 - 0.55 * mainInside);
#ifdef RIFT_REFRACT
    vec2 screen = gl_FragCoord.xy / vec2(textureSize(Sampler1, 0));
    vec2 sampleUv = clamp(screen + bend, vec2(0.002), vec2(0.998));
    float warpedDepth = texture(Sampler0, sampleUv).r;
    if (warpedDepth > gl_FragCoord.z) sampleUv = screen;
    vec3 refractedScene = texture(Sampler1, sampleUv).rgb + auroraHalo + rimGlow;
    col = mix(refractedScene, col, destAmt);
    if (v == 99) col = mix(texture(Sampler1, sampleUv).rgb, col, destAmt);
#endif

    float glass = mix(0.86, 0.98, frostAmt);
    float a = mix(0.45 * edgeFade, glass, destAmt) * fogFade() * fade;
    float auroraAlpha = clamp(length(auroraHalo) * 0.72 + exp(-max(dAll, 0.0) * 11.0) * 0.48, 0.0, 0.85);
    float shapeAlpha = clamp(mainInside * 0.97 + boxInside * (0.48 + 0.42 * tipFade) + totalWhiteRim, 0.0, 0.99);
    a = max(shapeAlpha, auroraAlpha) * quadEdgeMask * fogFade() * fade;
    fragColor = vec4(clamp(col, 0.0, 1.0), a) * ColorModulator;
#endif
}
