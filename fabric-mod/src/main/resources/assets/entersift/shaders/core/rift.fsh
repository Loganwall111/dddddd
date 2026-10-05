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
    vec3(0.97, 0.60, 0.40), vec3(0.95, 0.25, 0.18), vec3(0.65, 0.38, 0.85), vec3(1.0, 0.58, 0.65),
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

// 0.40 refs 4-7: pale blocky Minecraft-style pixel clouds drifting over the destination field.
float pixelClouds(vec3 dir, float t, float scale, float cover, float seed) {
    float k = 1.0 / (max(dir.y, -0.08) + 0.22);
    vec2 cell = floor(vec2(atan(dir.z, dir.x), dir.y * 3.0) * scale + vec2(t * 0.010, 0.0) + seed);
    float n = hash21(cell) * 0.6 + hash21(floor(cell * 0.37) + 7.0) * 0.4;
    return step(cover, n);
}

// 0.40 refs: sparse tiny white sparkle squares rising through the opening.
float sparkles(vec3 dir, float t) {
    vec2 g = vec2(atan(dir.z, dir.x) * 30.0, dir.y * 30.0 - t * 0.35);
    vec2 cell = floor(g);
    vec2 fr = fract(g) - 0.5;
    float on = step(0.982, hash21(cell + floor(t * 0.5)));
    return on * step(max(abs(fr.x), abs(fr.y)), 0.16);
}

// Layer 2: Back distortion & radial chromatic opening depth (never a flat black hole)
#ifdef RIFT_REFRACT
vec3 backDistortion(vec2 sampleUv, vec2 bend, float edgeFade, float phase, vec3 tint, vec3 frost) {
    vec2 chromaStep = bend * 0.0018;
    vec2 uvR = clamp(sampleUv + chromaStep, vec2(0.002), vec2(0.998));
    vec2 uvG = clamp(sampleUv, vec2(0.002), vec2(0.998));
    vec2 uvB = clamp(sampleUv - chromaStep, vec2(0.002), vec2(0.998));
    vec3 refracted = vec3(
        texture(Sampler1, uvR).r,
        texture(Sampler1, uvG).g,
        texture(Sampler1, uvB).b
    );
    float ripple = 0.5 + 0.5 * sin(edgeFade * 16.0 - phase * 2.094395);
    vec3 depthTint = mix(vec3(0.14, 0.26, 0.44), mix(tint, frost, 0.5), 0.45 + 0.35 * ripple);
    return mix(refracted, depthTint, 0.24 * (1.0 - edgeFade));
}
#endif

// Layer 3: Giant Rift aperture silhouette field (vertically dominant, organic curved profile)
float apertureField(vec2 uvCentered, float phase) {
    float curveX = uvCentered.x + 0.06 * sin(uvCentered.y * 2.8 + phase * 0.8976) + 0.03 * cos(uvCentered.y * 5.2 - phase * 0.8976);
    float curveY = uvCentered.y * 0.86 + 0.04 * cos(uvCentered.x * 3.1 + phase * 0.8976);
    float radial = length(vec2(curveX * 1.08, curveY));
    return clamp(1.0 - smoothstep(0.42, 1.12, radial), 0.0, 1.0);
}

// Layer 4: Wavy dark outer "soul face" bands (low-frequency sine/cosine + smooth noise)
float soulFaceBand(vec2 uvCentered, vec3 dir, float phase) {
    float w1 = sin(uvCentered.y * 4.2 + sin(uvCentered.x * 3.1 - phase * 0.8976) * 1.25 + phase * 0.8976);
    float w2 = cos(uvCentered.x * 3.4 - uvCentered.y * 3.8 + cos(uvCentered.y * 2.2 + phase * 0.8976) * 1.10);
    float n = riftNoise2D(uvCentered * 2.6 + dir.xy * 1.4 + vec2(0.0, phase * 0.35));
    float ringZone = smoothstep(0.18, 0.52, length(uvCentered * vec2(1.0, 0.82)))
                   * (1.0 - smoothstep(0.78, 1.08, length(uvCentered * vec2(1.0, 0.82))));
    float waveCrest = 0.62 + 0.26 * (0.55 * w1 + 0.45 * w2) + 0.16 * (n - 0.5);
    return clamp(waveCrest * (0.65 + 0.45 * ringZone), 0.0, 1.0);
}

// Layer 5: Colored interior energy (cyan / turquoise / pastel mint / pink / magenta / violet + style tint)
vec3 interiorEnergy(vec2 uvCentered, vec3 dir, float phase, vec3 tint, vec3 frost) {
    float flowA = 0.5 + 0.5 * sin(uvCentered.y * 3.6 + uvCentered.x * 2.2 - phase * 0.8976 + dir.x * 2.0);
    float flowB = 0.5 + 0.5 * cos(uvCentered.x * 4.1 - uvCentered.y * 2.9 + phase * 0.8976 + dir.y * 2.4);
    vec3 cyan = vec3(0.36, 0.92, 0.90);
    vec3 mint = vec3(0.58, 0.96, 0.84);
    vec3 pink = vec3(0.98, 0.46, 0.72);
    vec3 magenta = vec3(0.84, 0.26, 0.68);
    vec3 violet = vec3(0.52, 0.30, 0.88);
    vec3 siftRibbon = mix(mix(cyan, mint, flowA), mix(pink, mix(magenta, violet, flowB), flowB), 0.42 * flowB);
    return mix(siftRibbon, mix(tint, frost, 0.48), 0.78);
}

// Layer 6: Inner glow & concentrated vertical luminance core
vec3 innerGlow(vec2 uvCentered, float edgeFade, float phase, vec3 tint, vec3 frost) {
    float spineWave = 0.10 * sin(uvCentered.y * 3.2 - phase * 0.8976);
    float coreSpine = exp(-abs(uvCentered.x - spineWave) * 3.2) * exp(-abs(uvCentered.y) * 1.35);
    float rimLuminance = pow(clamp(1.0 - edgeFade, 0.0, 1.0), 2.1);
    vec3 coreCol = mix(mix(tint, frost, 0.5), vec3(1.0, 0.99, 1.0), 0.68);
    return coreCol * (0.12 * coreSpine + 0.10 * rimLuminance);
}

// Layer 7: Deterministic floating light squares in depth (16 major semi-translucent squares across 3 depth layers)
vec3 floatingLightSquares(vec2 uvCentered, vec3 dir, float phase, vec3 tint, vec3 frost) {
    vec3 accum = vec3(0.0);
    for (int i = 0; i < 16; i++) {
        float fi = float(i);
        float depthLayer = mod(fi, 3.0);
        float parallax = 0.04 + 0.045 * depthLayer;
        float ax = (fract(fi * 0.6180339 + 0.13) * 2.0 - 1.0) * 0.68;
        float ay = (fract(fi * 0.3819660 + 0.29) * 2.0 - 1.0) * 0.74;
        float driftX = 0.045 * sin(phase * 0.8976 + fi * 1.73);
        float driftY = 0.065 * cos(phase * 0.8976 + fi * 2.19);
        vec2 center = vec2(ax + driftX, ay + driftY) - dir.xy * parallax;
        vec2 halfSize = vec2(
            0.065 + 0.045 * fract(fi * 0.4142135),
            0.070 + 0.050 * fract(fi * 0.7320508)
        ) * (1.0 - 0.14 * depthLayer);
        vec2 d = abs(uvCentered - center) / max(halfSize, vec2(0.01));
        float sqDist = max(d.x, d.y);
        float pane = smoothstep(1.04, 0.86, sqDist);
        float border = smoothstep(0.18, 0.0, abs(sqDist - 0.94));
        float halo = exp(-sqDist * 2.3) * 0.16;
        float pulse = 0.72 + 0.28 * sin(phase * 0.8976 + fi * 1.37);
        float layerWeight = (depthLayer == 0.0) ? 0.32 : ((depthLayer == 1.0) ? 0.22 : 0.14);
        vec3 sqColor = (mod(fi, 2.0) < 0.5)
            ? mix(frost, vec3(1.0), 0.55)
            : mix(tint, vec3(0.72, 0.98, 1.0), 0.45);
        // 0.40: the refs show HOLLOW outlined cubes, not filled panes: outline dominant, pane a whisper.
        accum += sqColor * (pane * 0.06 + border * 0.90 + halo) * pulse * layerWeight;
    }
    return accum;
}

// Layer 8: Volumetric god-ray / light-shaft component streaming through the Rift aperture
vec3 riftGodRays(vec2 uvCentered, vec3 dir, float phase, vec3 tint, vec3 frost) {
    float diag = uvCentered.x * 0.78 + uvCentered.y * 0.62 + dir.x * 0.35;
    float r1 = pow(0.5 + 0.5 * sin(diag * 7.5 - phase * 0.8976), 4.0);
    float r2 = pow(0.5 + 0.5 * cos(diag * 11.0 + phase * 0.8976 + 1.1), 5.0);
    float verticalFalloff = smoothstep(-0.85, 0.75, uvCentered.y);
    vec3 shaftCol = mix(mix(tint, frost, 0.5), vec3(1.0, 0.92, 0.96), 0.42);
    return shaftCol * (0.08 * r1 + 0.06 * r2) * (0.45 + 0.55 * verticalFalloff);
}

// Layer 9: Soft highlight bloom shoulder
vec3 riftBloom(vec3 col, float edgeFade, float gloss) {
    float luma = max(col.r, max(col.g, col.b));
    float highlight = smoothstep(0.68, 1.15, luma);
    vec3 bloomTint = mix(col, vec3(1.0), 0.35);
    return col + bloomTint * (0.12 * highlight + 0.06 * (1.0 - edgeFade) + 0.03 * gloss);
}

// 0.36: the destination seen through the opening, as a function so the frost can BLUR it by sampling
// neighbouring directions. Everything is driven by the view ray, so walking past the rift parallaxes.
vec3 destination(vec3 dir, vec3 tint, vec3 frost, vec2 uv, float crack, float strength, float t) {
    float up = clamp(dir.y, -1.0, 1.0);
    float az = atan(dir.z, dir.x);

    vec3 zenith  = mix(tint, frost, 0.25) * 0.55;
    vec3 horizon = mix(tint, vec3(1.0), 0.16);
    vec3 floorC  = mix(tint, vec3(0.05, 0.06, 0.09), 0.30);
    vec3 ridgeFar  = mix(tint, frost, 0.45) * 0.30;
    vec3 ridgeNear = mix(tint, vec3(0.03, 0.04, 0.06), 0.62);

    vec3 col = mix(horizon, zenith, smoothstep(0.02, 0.62, up));
    col = mix(col, floorC, smoothstep(0.02, -0.22, up) * 0.85);
    // A far ridge line, then a nearer, darker one: the destination reads as a PLACE, not a picture.
    float farRidge  = 0.115 + 0.055 * sin(az * 2.3 + 0.8) + 0.030 * sin(az * 5.1 + 2.2);
    float nearRidge = 0.045 + 0.045 * sin(az * 3.1 - 1.1) + 0.022 * sin(az * 7.3 + 0.4);
    col = mix(col, ridgeFar,  0.75 * (1.0 - smoothstep(farRidge  - 0.008, farRidge  + 0.008, up)));
    col = mix(col, ridgeNear, 0.60 * (1.0 - smoothstep(nearRidge - 0.008, nearRidge + 0.008, up)));
    // A rift sun hanging over the ridge, with a wide glow.
    float sun = length(vec2((az - 0.55) * 0.85, up - 0.34));
    col += tint * exp(-sun * 4.5) * 0.12;
    col = mix(col, vec3(1.0), 1.0 - smoothstep(0.020, 0.045, sun));
    // Sparks drifting up through the opening.
    float motes = sin(up * 26.0 - t * 2.2 + az * 5.0) * sin(up * 41.0 - t * 3.1 - az * 3.0 + 1.7);
    col += tint * pow(max(0.0, motes), 6.0) * 0.30;
    // 0.40 refs 4-7: pale blocky pixel clouds and tiny white sparkle squares over the field.
    col = mix(col, mix(vec3(1.0), tint, 0.30), pixelClouds(dir, t, 2.2, 0.72, 3.0) * 0.30);
    col = mix(col, vec3(1.0), pixelClouds(dir, t * 1.35, 4.4, 0.80, 11.0) * 0.14);
    col += vec3(1.0) * sparkles(dir, t) * 0.80;
    // The rift's own energy still breathes across the opening.
    col = mix(col, vec3(1.0, 0.48, 0.12), crack * 0.35);
    col += tint * (0.08 + 0.12 * strength) * exp(-1.6 * dot(uv * 2.0 - 1.0, uv * 2.0 - 1.0));
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
    int view = int(riftData.b * 32.0) % 8;
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
                     phase < 4.0 ? 4.0 - phase : phase < 5.0 ? 0.15 : phase < 6.0 ? 0.9 : 0.25 + 0.3 * throb;
    if (phase >= 4.0 && phase < 5.0) tint = vec3(0.6);
    if (phase >= 5.0 && phase < 6.0) tint = vec3(1.0, 0.97, 0.96);
    float edgeFade = exp(-3.0 * dot(uv * 2.0 - 1.0, uv * 2.0 - 1.0));
    float crack = 1.0 - smoothstep(0.012, 0.045, abs(uv.x - 0.5 - 0.1 * sin(floor(uv.y * 24.0) + floor(t * 5.0))));
    // -------------------------------------------------------------------------------------------
    // 0.34/0.36: WHAT IS BEYOND THE OPENING + 10-LAYER GLSL RIFT STACK.
    // The opening paints the dimension the rift leads to, layers the Sift aperture, wavy dark
    // "soul face" bands, colored interior energy, inner glow, 16 deterministic floating light
    // squares in depth, and volumetric god-ray shafts, then puts a BLURRED, FROSTED GLASS over it.
    // -------------------------------------------------------------------------------------------
    vec3 dir = normalize(worldRay + vec3(0.0, 0.0, 0.0001)); // camera -> this point, world axes

    // The frosted gloss blurs the destination: a wider spread at range (frostAmt high), sharper up close.
    float blur = 0.006 + 0.020 * frostAmt;
    vec3 col = destination(dir, tint, frost, uv, crack, strength, t);
    col = mix(col, destination(normalize(dir + vec3(0.0, blur, 0.0)), tint, frost, uv, crack, strength, t), 0.5);
    col = mix(col, destination(normalize(dir + vec3(blur * 1.4, 0.0, 0.0)), tint, frost, uv, crack, strength, t), 0.35);
    col = mix(col, destination(normalize(dir + vec3(0.0, 0.0, blur * 1.4)), tint, frost, uv, crack, strength, t), 0.35);

    // Layer 3 & Layer 5: Giant Rift aperture field + colored interior energy ribbons
    float aperture = apertureField(uvCentered, phase);
    vec3 energy = interiorEnergy(uvCentered, dir, phase, tint, frost);
    col = mix(col, energy, (0.16 + 0.12 * aperture) * (1.0 - 0.45 * frostAmt));

    // Layer 4: Wavy dark outer "soul face" bands (smoothstep(0.70, 0.88, faceMask) -> vec3(0.02, 0.02, 0.04))
    float faceMask = soulFaceBand(uvCentered, dir, phase);
    float bandStrength = 0.36 * (1.0 - 0.4 * frostAmt) * smoothstep(0.05, 0.45, edgeFade);
    col = mix(col, vec3(0.02, 0.02, 0.04), smoothstep(0.70, 0.88, faceMask) * bandStrength);

    // Layer 7: Deterministic floating light squares in depth (16 semi-translucent squares)
    vec3 squares = floatingLightSquares(uvCentered, dir, phase, tint, frost);
    col += squares * (0.34 + 0.20 * (1.0 - frostAmt));

    // Layer 8 & Layer 6: Volumetric god-ray shafts + concentrated inner glow
    col += riftGodRays(uvCentered, dir, phase, tint, frost);
    col += innerGlow(uvCentered, edgeFade, phase, tint, frost);

    // The frosted sheet sits OVER the destination (the reference's hazy pane), never over the world.
    col = mix(col, frost, frostAmt * 0.40);
    col += vec3(0.02) * frostAmt;
    // A slow gloss band sweeps the glass, the way the reference frames catch the light.
    float gloss = smoothstep(0.72, 1.0, sin((uv.x * 1.25 + uv.y * 0.75) * 3.14159 + t * 0.25) * 0.5 + 0.5);
    col += vec3(0.14) * gloss * (0.35 + frostAmt);

    // Layer 9: Soft highlight bloom shoulder
    col = riftBloom(col, edgeFade, gloss);

    // 0.40 opening/closing lifecycle (master directive section 8), driven by the CPU fade:
    // dormant shimmer -> expanding white arc (annulus frames) -> white ignition -> color reveal.
    // Closing runs the same curve in reverse (color drains to white, then contracts).
    float arcAmt   = smoothstep(0.16, 0.30, fade) * (1.0 - smoothstep(0.44, 0.60, fade));
    float whiteOut = smoothstep(0.42, 0.66, fade);
    float reveal   = smoothstep(0.66, 0.94, fade);
    col = mix(col, vec3(1.0, 0.99, 0.98), whiteOut * (1.0 - reveal));
    float ringR = mix(0.18, 1.45, smoothstep(0.16, 0.60, fade));
    float thick = mix(0.34, 0.10, smoothstep(0.16, 0.60, fade));
    float arc = smoothstep(thick, thick * 0.35, abs(length(uvCentered) - ringR));
    col = mix(col, vec3(1.0), arc * arcAmt * 0.9);

    // The opening is opaque: nothing of the world behind the rift may show through it. The captured
    // scene is used only in the outer rim, where the glass edge bends the surroundings. Up close the
    // pane clears to 0.86 (still glass); at range the frost takes it towards 0.98.
    float destAmt = smoothstep(0.05, 0.45, edgeFade);
    float glass = mix(0.86, 0.98, frostAmt);
    float a = mix(0.45 * edgeFade, glass, destAmt) * fogFade() * fade;
    a *= mix(0.10, 1.0, smoothstep(0.04, 0.30, fade));   // 0.40 dormant: barely visible shimmer
    a = max(a, arc * arcAmt * 0.85 * fogFade());        // 0.40 the white arc shows early

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
    col = mix(backCol, col, destAmt);
#endif
    fragColor = vec4(col, a) * ColorModulator;
#endif
}
