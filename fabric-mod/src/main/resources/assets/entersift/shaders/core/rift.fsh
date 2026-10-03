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

// 0.31: eight rift styles. 0-5 are the destinations, 6 is the white reference rift (17345525) and 7 is
// the steep olive wall (The_Nether). TINT is the inner glow colour, FROST the frosted layer over the
// opening; the frost tones come from the measured reference crops.
const vec3 TINT[8] = vec3[8](
    vec3(0.95, 0.85, 0.25), vec3(0.95, 0.25, 0.18), vec3(0.65, 0.38, 0.85), vec3(1.0, 0.58, 0.65),
    vec3(0.20, 0.80, 0.95), vec3(0.95, 0.85, 0.25), vec3(1.0, 0.97, 0.96), vec3(1.0, 0.78, 0.52));
const vec3 FROST[8] = vec3[8](
    vec3(0.90, 0.75, 0.76), vec3(0.86, 0.44, 0.40), vec3(0.52, 0.44, 0.58), vec3(0.88, 0.81, 0.83),
    vec3(0.40, 0.70, 0.78), vec3(0.92, 0.88, 0.66), vec3(0.97, 0.96, 0.96), vec3(0.52, 0.55, 0.60));

// Deterministic 2D hash & smooth value noise for low-frequency organic band & square modulation
float hash21(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
}

float riftNoise2D(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(
        mix(hash21(i + vec2(0.0, 0.0)), hash21(i + vec2(1.0, 0.0)), u.x),
        mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), u.x),
        u.y
    );
}

// Layer 2: Back distortion & radial chromatic opening depth (never a flat black hole)
#ifdef RIFT_REFRACT
vec3 backDistortion(vec2 sampleUv, vec2 bend, float edgeFade, float phase, vec3 tint, vec3 frost) {
    vec2 chromaStep = bend * 0.0028;
    vec2 uvR = clamp(sampleUv + chromaStep, vec2(0.002), vec2(0.998));
    vec2 uvG = clamp(sampleUv, vec2(0.002), vec2(0.998));
    vec2 uvB = clamp(sampleUv - chromaStep, vec2(0.002), vec2(0.998));
    vec3 refracted = vec3(
        texture(Sampler1, uvR).r,
        texture(Sampler1, uvG).g,
        texture(Sampler1, uvB).b
    );
    float ripple = 0.5 + 0.5 * sin(edgeFade * 16.0 - phase * 1.7951958);
    vec3 depthTint = mix(vec3(0.14, 0.78, 0.92), mix(tint, vec3(0.94, 0.36, 0.72), 0.5), 0.5 + 0.35 * ripple);
    return mix(refracted, depthTint, 0.65);
}
#endif

// Layer 3: Giant Rift aperture silhouette field (vertically dominant, organic curved profile)
float apertureField(vec2 uvCentered, float phase) {
    float curveX = uvCentered.x + 0.075 * sin(uvCentered.y * 2.8 + phase * 0.8975979)
                 + 0.035 * cos(uvCentered.y * 5.2 - phase * 0.8975979);
    float curveY = uvCentered.y * 0.82 + 0.045 * cos(uvCentered.x * 3.1 + phase * 0.8975979);
    float radial = length(vec2(curveX * 1.06, curveY));
    return clamp(1.0 - smoothstep(0.38, 1.05, radial), 0.0, 1.0);
}

// Layer 4: Wavy dark outer "soul face" bands (low-frequency sine/cosine + smooth noise)
float soulFaceBand(vec2 uvCentered, vec3 dir, float phase) {
    float w1 = sin(uvCentered.y * 4.4 + sin(uvCentered.x * 3.2 - phase * 0.8975979) * 1.35 + phase * 0.8975979);
    float w2 = cos(uvCentered.x * 3.6 - uvCentered.y * 4.0 + cos(uvCentered.y * 2.4 + phase * 0.8975979) * 1.15);
    float n = riftNoise2D(uvCentered * 2.8 + dir.xy * 1.35 + vec2(0.0, phase * 0.45));
    float r = length(uvCentered * vec2(1.04, 0.84));
    // Strongest in the outer ring (0.28..0.95) so dark wavy hollows frame the bright central aperture
    float outerBandZone = smoothstep(0.22, 0.52, r) * (1.0 - smoothstep(0.86, 1.16, r));
    float waveField = 0.68 + 0.24 * (0.55 * w1 + 0.45 * w2) + 0.16 * (n - 0.5);
    return clamp(waveField * (0.55 + 0.65 * outerBandZone), 0.0, 1.0);
}

// Layer 5: Colored interior energy (cyan / turquoise / pastel mint / pink / magenta / violet + style tint)
vec3 interiorEnergy(vec2 uvCentered, vec3 dir, float phase, vec3 tint, vec3 frost) {
    float flowA = 0.5 + 0.5 * sin(uvCentered.y * 3.4 + uvCentered.x * 2.3 - phase * 0.8975979 + dir.x * 2.2);
    float flowB = 0.5 + 0.5 * cos(uvCentered.x * 3.9 - uvCentered.y * 2.7 + phase * 0.8975979 + dir.y * 2.4);
    float n = riftNoise2D(uvCentered * 2.2 - dir.xy * 1.6 + vec2(phase * 0.3, -phase * 0.3));
    vec3 cyan = vec3(0.18, 0.94, 0.98);
    vec3 mint = vec3(0.52, 0.98, 0.84);
    vec3 pink = vec3(1.00, 0.44, 0.74);
    vec3 magenta = vec3(0.86, 0.22, 0.72);
    vec3 violet = vec3(0.48, 0.26, 0.90);
    vec3 aquaStream = mix(cyan, mint, smoothstep(0.2, 0.8, flowA * 0.7 + n * 0.3));
    vec3 roseStream = mix(pink, mix(magenta, violet, flowB), smoothstep(0.15, 0.85, flowB));
    vec3 siftField = mix(aquaStream, roseStream, 0.38 * smoothstep(0.25, 0.85, flowB * 0.65 + (1.0 - flowA) * 0.35));
    return mix(siftField, mix(tint, frost, 0.30), 0.32);
}

// Layer 6: Inner glow & concentrated vertical luminance core
vec3 innerGlow(vec2 uvCentered, float edgeFade, float phase, vec3 tint, vec3 frost) {
    float spineWave = 0.09 * sin(uvCentered.y * 3.2 - phase * 0.8975979);
    float coreSpine = exp(-abs(uvCentered.x - spineWave) * 2.8) * exp(-abs(uvCentered.y) * 1.2);
    float boxRim = smoothstep(0.62, 0.96, max(abs(uvCentered.x), abs(uvCentered.y)));
    vec3 coreCol = mix(vec3(0.65, 0.98, 1.0), mix(tint, vec3(1.0), 0.65), 0.55);
    return coreCol * (0.42 * coreSpine + 0.28 * boxRim);
}

// Layer 7: Deterministic floating light squares in depth (multi-depth mosaic + 16 floating squares across 3 depth layers)
vec3 floatingLightSquares(vec2 uvCentered, vec3 dir, float phase, vec3 tint, vec3 frost) {
    vec3 accum = vec3(0.0);

    // Sub-layer 7A: Two-depth parallaxing pixel-square mosaic (reference Sift portal interior tiles)
    vec2 tileUvFar = uvCentered * vec2(7.0, 9.0) - dir.xy * 1.6 + vec2(0.0, phase * 0.25);
    vec2 cellFar = floor(tileUvFar);
    vec2 fracFar = fract(tileUvFar);
    float hFar = hash21(cellFar);
    float borderFar = smoothstep(0.08, 0.02, min(min(fracFar.x, 1.0 - fracFar.x), min(fracFar.y, 1.0 - fracFar.y)));
    float litFar = step(0.42, hFar) * (0.55 + 0.45 * sin(phase * 0.8975979 + hFar * 6.28318));
    vec3 colFar = mix(vec3(0.22, 0.92, 0.96), vec3(0.75, 1.0, 0.94), fract(hFar * 3.7));
    accum += colFar * (litFar * 0.26 + borderFar * step(0.55, hFar) * 0.28);

    vec2 tileUvNear = uvCentered * vec2(4.5, 5.5) - dir.xy * 3.0 - vec2(0.0, phase * 0.18);
    vec2 cellNear = floor(tileUvNear);
    vec2 fracNear = fract(tileUvNear);
    float hNear = hash21(cellNear + vec2(17.0, 31.0));
    float edgeNear = smoothstep(0.10, 0.02, min(min(fracNear.x, 1.0 - fracNear.x), min(fracNear.y, 1.0 - fracNear.y)));
    float litNear = step(0.58, hNear) * (0.6 + 0.4 * cos(phase * 0.8975979 + hNear * 6.28318));
    vec3 colNear = mix(mix(tint, vec3(0.45, 0.98, 1.0), 0.6), vec3(1.0), 0.45);
    accum += colNear * (litNear * 0.28 + edgeNear * step(0.60, hNear) * 0.36);

    // Sub-layer 7B: 16 major deterministic floating semi-translucent squares across 3 parallax depth planes
    for (int i = 0; i < 16; i++) {
        float fi = float(i);
        float depthLayer = mod(fi, 3.0);
        float parallax = 0.06 + 0.065 * depthLayer;
        float ax = (fract(fi * 0.6180339 + 0.13) * 2.0 - 1.0) * 0.72;
        float ay = (fract(fi * 0.3819660 + 0.29) * 2.0 - 1.0) * 0.76;
        float driftX = 0.055 * sin(phase * 0.8975979 + fi * 1.73);
        float driftY = 0.075 * cos(phase * 0.8975979 + fi * 2.19);
        vec2 center = vec2(ax + driftX, ay + driftY) - dir.xy * parallax;
        vec2 halfSize = vec2(
            0.075 + 0.055 * fract(fi * 0.4142135),
            0.080 + 0.060 * fract(fi * 0.7320508)
        ) * (1.0 - 0.14 * depthLayer);
        vec2 d = abs(uvCentered - center) / max(halfSize, vec2(0.01));
        float sqDist = max(d.x, d.y);
        float pane = smoothstep(1.04, 0.84, sqDist);
        float border = smoothstep(0.16, 0.0, abs(sqDist - 0.94));
        float halo = exp(-sqDist * 2.4) * 0.28;
        float pulse = 0.74 + 0.26 * sin(phase * 0.8975979 + fi * 1.37);
        float layerWeight = (depthLayer == 0.0) ? 0.38 : ((depthLayer == 1.0) ? 0.26 : 0.18);
        vec3 sqColor = (mod(fi, 2.0) < 0.5)
            ? mix(vec3(0.55, 0.98, 1.0), vec3(1.0), 0.55)
            : mix(tint, vec3(1.0, 0.58, 0.86), 0.50);
        accum += sqColor * (pane * 0.55 + border * 0.92 + halo) * pulse * layerWeight;
    }
    return accum;
}

// Layer 8: Volumetric god-ray / light-shaft component streaming through the Rift aperture
vec3 riftGodRays(vec2 uvCentered, vec3 dir, float phase, vec3 tint, vec3 frost) {
    float diag = uvCentered.x * 0.78 + uvCentered.y * 0.62 + dir.x * 0.35;
    float r1 = pow(0.5 + 0.5 * sin(diag * 7.0 - phase * 0.8975979), 3.5);
    float r2 = pow(0.5 + 0.5 * cos(diag * 10.5 + phase * 0.8975979 + 1.1), 4.5);
    float verticalFalloff = smoothstep(-0.92, 0.82, uvCentered.y);
    vec3 shaftCol = mix(vec3(0.62, 0.98, 0.96), mix(tint, vec3(1.0, 0.76, 0.92), 0.5), 0.48);
    return shaftCol * (0.24 * r1 + 0.18 * r2) * (0.50 + 0.50 * verticalFalloff);
}

// Layer 9: Soft highlight bloom shoulder
vec3 riftBloom(vec3 col, float edgeFade, float gloss) {
    float luma = max(col.r, max(col.g, col.b));
    float highlight = smoothstep(0.62, 1.10, luma);
    vec3 bloomTint = mix(col, vec3(0.88, 0.99, 1.0), 0.42);
    return col + bloomTint * (0.26 * highlight + 0.12 * (1.0 - edgeFade) + 0.08 * gloss);
}

// Layer 0 & Layer 1: Background Sift sky dome & distant atmospheric fade seen through the Rift opening.
// Driven by the view ray so walking past the Rift parallaxes smoothly without any hard grey horizontal cut.
vec3 destination(vec3 dir, vec3 tint, vec3 frost, vec2 uv, float crack, float strength, float t) {
    float up = clamp(dir.y, -1.0, 1.0);
    float az = atan(dir.z, dir.x);

    vec3 zenith  = mix(vec3(0.14, 0.68, 0.84), mix(tint, frost, 0.35), 0.38);
    vec3 horizon = mix(vec3(0.42, 0.96, 0.92), mix(tint, vec3(1.0), 0.32), 0.42);
    vec3 lowerGlow = mix(vec3(0.20, 0.52, 0.74), mix(tint, vec3(0.86, 0.34, 0.68), 0.48), 0.45);
    vec3 ridgeFar  = mix(vec3(0.32, 0.92, 0.88), tint, 0.40);
    vec3 ridgeNear = mix(vec3(0.94, 0.44, 0.74), frost, 0.35);

    vec3 col = mix(lowerGlow, horizon, smoothstep(-0.65, 0.15, up));
    col = mix(col, zenith, smoothstep(0.10, 0.80, up));
    // Smooth undulating Sift aurora bands (replacing the old dark grey mountain cutoff)
    float farRidge  = 0.115 + 0.055 * sin(az * 2.3 + 0.8) + 0.030 * sin(az * 5.1 + 2.2);
    float nearRidge = 0.045 + 0.045 * sin(az * 3.1 - 1.1) + 0.022 * sin(az * 7.3 + 0.4);
    col = mix(col, ridgeFar,  exp(-abs(up - farRidge) * 4.2) * 0.42);
    col = mix(col, ridgeNear, exp(-abs(up - nearRidge) * 3.8) * 0.34);
    // Soft dimensional core radiance
    float sun = length(vec2((az - 0.55) * 0.85, up - 0.18));
    col += mix(tint, vec3(0.55, 0.98, 1.0), 0.5) * exp(-sun * 2.8) * 0.38;
    // Sparks drifting up through the opening
    float motes = sin(up * 26.0 - t * 2.2 + az * 5.0) * sin(up * 41.0 - t * 3.1 - az * 3.0 + 1.7);
    col += mix(tint, vec3(0.75, 1.0, 0.98), 0.5) * pow(max(0.0, motes), 6.0) * 0.50;
    // The rift's own energy breathes across the opening
    col = mix(col, vec3(0.65, 0.98, 1.0), crack * 0.25);
    col += tint * (0.14 + 0.22 * strength) * exp(-1.2 * dot(uv * 2.0 - 1.0, uv * 2.0 - 1.0));
    return col;
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
    int rawCode = int(riftData.b * 32.0);
    int view = rawCode % 8;
    float nightBoost = (rawCode >= 8) ? 1.35 : 1.0;
    vec2 uv = riftData.rg;
    vec2 uvCentered = uv * 2.0 - 1.0;
    vec3 tint = TINT[view];
    vec3 frost = FROST[view];
    // The vertex packs alpha as fade/2 + frost/2, so both terms can be recovered exactly.
    float frostAmt = clamp(riftData.a * 2.0 - 1.0, 0.0, 1.0);
    float fade = clamp(riftData.a * 2.0 - frostAmt, 0.0, 1.0);
    // Seven recurring phases in 120 ticks: crack, flare, throb, wane, grey, throat, shimmer.
    float phase = mod(t, 6.0) * (7.0 / 6.0);
    float throb = 0.5 + 0.5 * sin(t * 8.0);
    float strength = phase < 1.0 ? phase : phase < 2.0 ? 1.0 : phase < 3.0 ? 0.45 + 0.4 * throb :
                     phase < 4.0 ? 4.0 - phase : phase < 5.0 ? 0.45 : phase < 6.0 ? 0.9 : 0.45 + 0.3 * throb;
    // Wide edgeFade across the full stepped silhouette so destAmt stays 1.0 and the world behind never bleeds through.
    float edgeFade = exp(-0.18 * dot(uv * 2.0 - 1.0, uv * 2.0 - 1.0));
    float crack = 1.0 - smoothstep(0.012, 0.045, abs(uv.x - 0.5 - 0.1 * sin(floor(uv.y * 24.0) + floor(t * 5.0))));

    // -------------------------------------------------------------------------------------------
    // 10-LAYER GLSL RIFT VISUAL STACK:
    //   Layer 0 & 1: Background Sift sky & distant atmospheric fade (destination)
    //   Layer 2:     Back distortion & radial chromatic opening depth (backDistortion)
    //   Layer 3:     Giant Rift aperture field (apertureField)
    //   Layer 4:     Wavy dark outer "soul face" bands (soulFaceBand -> vec3(0.02, 0.02, 0.04))
    //   Layer 5:     Colored interior energy ribbons (interiorEnergy)
    //   Layer 6:     Concentrated inner glow & rim luminance (innerGlow)
    //   Layer 7:     Deterministic floating light squares in depth (floatingLightSquares)
    //   Layer 8:     Volumetric god-ray light shafts (riftGodRays)
    //   Layer 9:     Soft highlight bloom shoulder (riftBloom)
    //   Layer 10:    Final atmospheric composite
    // -------------------------------------------------------------------------------------------
    vec3 dir = normalize(worldRay + vec3(0.0, 0.0, 0.0001)); // camera -> this point, world axes

    // Layer 0 & Layer 1: blurred destination backdrop
    float blur = 0.006 + 0.020 * frostAmt;
    vec3 col = destination(dir, tint, frost, uv, crack, strength, t);
    col = mix(col, destination(normalize(dir + vec3(0.0, blur, 0.0)), tint, frost, uv, crack, strength, t), 0.5);
    col = mix(col, destination(normalize(dir + vec3(blur * 1.4, 0.0, 0.0)), tint, frost, uv, crack, strength, t), 0.35);
    col = mix(col, destination(normalize(dir + vec3(0.0, 0.0, blur * 1.4)), tint, frost, uv, crack, strength, t), 0.35);

    // Layer 3 & Layer 5: Giant Rift aperture field + colored interior energy ribbons
    float aperture = apertureField(uvCentered, phase);
    vec3 energy = interiorEnergy(uvCentered, dir, phase, tint, frost);
    col = mix(col, energy, 0.52 + 0.24 * aperture);

    // Layer 4: Wavy dark outer "soul face" bands (smoothstep(0.70, 0.88, faceMask) -> vec3(0.02, 0.02, 0.04))
    float faceMask = soulFaceBand(uvCentered, dir, phase);
    float bandStrength = 0.72 * (1.0 - 0.52 * aperture);
    col = mix(col, vec3(0.02, 0.02, 0.04), smoothstep(0.70, 0.88, faceMask) * bandStrength);

    // Subtle proximity frost sheen (kept light so it never washes out the GLSL Rift layers)
    col = mix(col, frost, frostAmt * 0.12);
    float gloss = smoothstep(0.72, 1.0, sin((uv.x * 1.25 + uv.y * 0.75) * 3.14159 + t * 0.25) * 0.5 + 0.5);
    col += vec3(0.08) * gloss * (0.25 + 0.5 * frostAmt);

    // Layer 7: Deterministic floating light squares in depth (rendered over the frost so squares stay crisp)
    vec3 squares = floatingLightSquares(uvCentered, dir, phase, tint, frost);
    col += squares * (0.72 + 0.18 * nightBoost);

    // Layer 8 & Layer 6: Volumetric god-ray shafts + concentrated inner glow
    col += riftGodRays(uvCentered, dir, phase, tint, frost) * nightBoost;
    col += innerGlow(uvCentered, edgeFade, phase, tint, frost);

    // Layer 9: Soft highlight bloom shoulder
    col = riftBloom(col, edgeFade, gloss);

    // Layer 10: Final atmospheric composite (destAmt is 1.0 across the opening so world behind never shows through)
    float destAmt = smoothstep(0.05, 0.45, edgeFade);
    float glass = mix(0.86, 0.98, frostAmt);
    float a = mix(0.45 * edgeFade, glass, destAmt) * fogFade() * fade;
#ifdef RIFT_REFRACT
    vec2 size = vec2(textureSize(Sampler1, 0));
    vec2 texel = 1.0 / size;
    vec2 screen = gl_FragCoord.xy * texel;
    vec2 bend = vec2(sin(uv.y * 31.0 + t * 2.4), cos(uv.x * 27.0 - t * 1.9));
    vec2 sampleUv = clamp(screen + bend * texel * 5.0 * edgeFade, texel * 0.5, vec2(1.0) - texel * 0.5);
    // A warped sample in front of this membrane would drag an occluder into the portal.
    // Vanilla 26.3 uses reverse-Z: larger means closer. Iris uses the fallback pipeline.
    float warpedDepth = texture(Sampler0, sampleUv).r;
    if (warpedDepth > gl_FragCoord.z + 0.00001) sampleUv = screen;
    vec3 backCol = backDistortion(sampleUv, bend, edgeFade, phase, tint, frost);
    col = mix(texture(Sampler1, sampleUv).rgb, col, destAmt);
    col = mix(col, backCol, (1.0 - aperture) * 0.22);
#endif
    fragColor = vec4(col, a) * ColorModulator;
#endif
}
