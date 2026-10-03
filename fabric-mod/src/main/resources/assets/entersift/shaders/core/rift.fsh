#version 330
#extension GL_ARB_separate_shader_objects : require

// rendertype_rift_portal — the rift is a shader plane, not a pile of block meshes.
// The Java renderer submits one canvas quad (the shape). Everything else is decided here:
// stepped silhouette, symmetrical outline, frosted destination, ripple, hollow border
// fragments, birth flash, seed, and the slow wavy aurora around the opening.
// Private 26.3 pipeline; never overrides vanilla water/glass translucency.

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

// Canvas extents in cell space. Must match RiftPortalRenderer.U0/U1/V0/V1.
const float U0 = -4.5;
const float U1 = 15.5;
const float V0 = -4.0;
const float V1 = 12.0;

// 0.31: eight rift styles. 0-5 are the destinations, 6 is the white reference rift (17345525) and 7 is
// the steep olive wall (The_Nether). TINT is the inner glow colour, FROST the frosted layer over the
// opening; the frost tones come from the measured reference crops.
const vec3 TINT[8] = vec3[8](
    vec3(0.95, 0.85, 0.25), vec3(0.95, 0.25, 0.18), vec3(0.65, 0.38, 0.85), vec3(1.0, 0.58, 0.65),
    vec3(0.20, 0.80, 0.95), vec3(0.95, 0.85, 0.25), vec3(1.0, 0.97, 0.96), vec3(1.0, 0.78, 0.52));
const vec3 FROST[8] = vec3[8](
    vec3(0.90, 0.75, 0.76), vec3(0.86, 0.44, 0.40), vec3(0.52, 0.44, 0.58), vec3(0.88, 0.81, 0.83),
    vec3(0.40, 0.70, 0.78), vec3(0.92, 0.88, 0.66), vec3(0.97, 0.96, 0.96), vec3(0.52, 0.55, 0.60));

// Hollow border fragments in cell space. Global so the index can be dynamic, same as TINT.
const vec2 FRAG_C[8] = vec2[8](
    vec2(11.15, 5.35), vec2(-0.55, 3.15), vec2(1.15, 6.45), vec2(10.55, 1.20),
    vec2(11.45, 0.35), vec2(2.35, 7.20), vec2(8.55, -0.80), vec2(-1.25, 1.05));
const vec2 FRAG_H[8] = vec2[8](
    vec2(0.52, 0.52), vec2(0.92, 0.36), vec2(0.40, 0.40), vec2(0.62, 0.36),
    vec2(0.38, 0.58), vec2(0.46, 0.30), vec2(0.38, 0.38), vec2(0.34, 0.50));

float sdBox(vec2 p, vec2 b) {
    vec2 d = abs(p) - b;
    return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
}

float sdRect(vec2 p, vec2 a, vec2 b) {
    return sdBox(p - (a + b) * 0.5, (b - a) * 0.5);
}

float crossSdf(vec2 p) {
    // Same stepped cross the server collides against (RiftShape, wide variant).
    float d = sdRect(p, vec2(5.0, 6.0), vec2(6.0, 8.0));
    d = min(d, sdRect(p, vec2(3.0, 4.0), vec2(8.0, 6.0)));
    d = min(d, sdRect(p, vec2(2.0, 2.0), vec2(10.0, 4.0)));
    d = min(d, sdRect(p, vec2(3.0, 0.0), vec2(8.0, 2.0)));
    d = min(d, sdRect(p, vec2(1.0, 0.0), vec2(3.0, 2.0)));
    d = min(d, sdRect(p, vec2(0.0, 2.0), vec2(2.0, 4.0)));
    return d;
}

float tallSdf(vec2 p) {
    float d = sdRect(p, vec2(4.0, 0.0), vec2(7.0, 8.0));
    d = min(d, sdRect(p, vec2(3.0, 0.0), vec2(8.0, 2.0)));
    d = min(d, sdRect(p, vec2(3.0, 2.0), vec2(4.0, 5.0)));
    d = min(d, sdRect(p, vec2(7.0, 1.0), vec2(8.0, 4.0)));
    return d;
}

float netherSdf(vec2 p) {
    float d = sdRect(p, vec2(2.0, 0.0), vec2(9.0, 6.0));
    d = min(d, sdRect(p, vec2(3.0, 6.0), vec2(5.0, 8.0)));
    d = min(d, sdRect(p, vec2(6.0, 6.0), vec2(8.0, 8.0)));
    d = min(d, sdRect(p, vec2(1.0, 1.0), vec2(2.0, 4.0)));
    d = min(d, sdRect(p, vec2(9.0, 1.0), vec2(10.0, 4.0)));
    return d;
}

float endSdf(vec2 p) {
    float d = sdRect(p, vec2(2.0, 0.0), vec2(9.0, 6.0));
    d = min(d, sdRect(p, vec2(2.0, 6.0), vec2(3.0, 8.0)));
    d = min(d, sdRect(p, vec2(4.0, 6.0), vec2(6.0, 8.0)));
    d = min(d, sdRect(p, vec2(7.0, 6.0), vec2(8.0, 8.0)));
    d = min(d, sdRect(p, vec2(1.0, 2.0), vec2(2.0, 3.0)));
    d = min(d, sdRect(p, vec2(1.0, 5.0), vec2(2.0, 6.0)));
    d = min(d, sdRect(p, vec2(9.0, 1.0), vec2(10.0, 2.0)));
    d = min(d, sdRect(p, vec2(9.0, 3.0), vec2(10.0, 5.0)));
    return d;
}

float portalSdf(vec2 p) {
    // Crenellated cyan mosaic: a slab with square teeth cut from the rim.
    float d = sdRect(p, vec2(1.0, 1.0), vec2(10.0, 7.0));
    d = max(d, -sdRect(p, vec2(2.0, 6.6), vec2(3.2, 8.4)));
    d = max(d, -sdRect(p, vec2(5.2, 6.6), vec2(6.4, 8.4)));
    d = max(d, -sdRect(p, vec2(8.0, 6.6), vec2(9.2, 8.4)));
    d = max(d, -sdRect(p, vec2(0.0, 3.0), vec2(1.4, 4.2)));
    d = max(d, -sdRect(p, vec2(9.6, 2.0), vec2(11.2, 3.4)));
    d = max(d, -sdRect(p, vec2(3.4, -0.4), vec2(4.6, 1.2)));
    d = max(d, -sdRect(p, vec2(7.0, -0.4), vec2(8.2, 1.2)));
    return d;
}

float silhouette(vec2 p, int kind, bool tall) {
    if (kind == 4) return portalSdf(p);
    if (kind == 1) return netherSdf(p);
    if (kind == 2) return endSdf(p);
    if (tall) return tallSdf(p);
    return crossSdf(p);
}

// Hollow rectangular border. The "floating cubes" in the footage are these frames, not meshes.
float frame(vec2 p, vec2 c, vec2 h, float width) {
    float d = abs(sdBox(p - c, h));
    return 1.0 - smoothstep(width * 0.35, width, d);
}

float hash11(float n) { return fract(sin(n) * 43758.5453); }

// 0.36: the destination seen through the opening, as a function so the frost can BLUR it by sampling
// neighbouring directions. Everything is driven by the view ray, so walking past the rift parallaxes.
vec3 destination(vec3 dir, vec3 tint, vec3 frost, vec2 uv, float crack, float strength, float t) {
    float up = clamp(dir.y, -1.0, 1.0);
    float az = atan(dir.z, dir.x);

    vec3 zenith  = mix(tint, frost, 0.35) * 0.42;
    vec3 horizon = mix(tint, vec3(1.0), 0.28);
    vec3 floorC  = mix(frost, vec3(0.05, 0.06, 0.09), 0.55);
    vec3 ridgeFar  = mix(tint, frost, 0.45) * 0.30;
    vec3 ridgeNear = mix(frost, vec3(0.03, 0.04, 0.06), 0.40);

    vec3 col = mix(horizon, zenith, smoothstep(0.02, 0.62, up));
    col = mix(col, floorC, smoothstep(0.02, -0.22, up) * 0.85);
    float farRidge  = 0.115 + 0.055 * sin(az * 2.3 + 0.8) + 0.030 * sin(az * 5.1 + 2.2);
    float nearRidge = 0.045 + 0.045 * sin(az * 3.1 - 1.1) + 0.022 * sin(az * 7.3 + 0.4);
    col = mix(col, ridgeFar,  1.0 - smoothstep(farRidge  - 0.008, farRidge  + 0.008, up));
    col = mix(col, ridgeNear, 1.0 - smoothstep(nearRidge - 0.008, nearRidge + 0.008, up));
    float sun = length(vec2((az - 0.55) * 0.85, up - 0.34));
    // A warm glow, not a white disc. The window must not cap out to a white sheet.
    col += mix(tint, vec3(1.0, 0.82, 0.48), 0.35) * exp(-sun * 6.0) * 0.28;
    float motes = sin(up * 26.0 - t * 2.2 + az * 5.0) * sin(up * 41.0 - t * 3.1 - az * 3.0 + 1.7);
    col += tint * pow(max(0.0, motes), 6.0) * 0.55;
    col = mix(col, vec3(1.0, 0.48, 0.12), crack * 0.35);
    col += tint * (0.18 + 0.30 * strength) * exp(-1.6 * dot(uv * 2.0 - 1.0, uv * 2.0 - 1.0));
    return col;
}

float fogFade() {
    return 1.0 - smoothstep(FogRenderDistanceStart, FogRenderDistanceEnd, sphericalVertexDistance);
}

float boltField(vec2 p, vec2 origin, float t, float life) {
    float acc = 0.0;
    for (int i = 0; i < 5; i++) {
        float seed = float(i) * 17.13;
        float ang = hash11(seed + 0.2) * 6.28318;
        vec2 dir = vec2(cos(ang), sin(ang));
        vec2 nrm = vec2(-dir.y, dir.x);
        vec2 a = origin;
        float reach = 0.85 + hash11(seed + 1.7) * 0.9;
        for (int s = 0; s < 5; s++) {
            float jitter = (hash11(seed + float(s) * 3.7) - 0.5) * 1.15;
            vec2 b = a + dir * reach + nrm * jitter;
            vec2 pa = p - a;
            vec2 ba = b - a;
            float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-4), 0.0, 1.0);
            float dist = length(pa - ba * h);
            acc = max(acc, 1.0 - smoothstep(0.015, 0.07, dist));
            a = b;
        }
    }
    return acc * life;
}

vec4 compose() {
    float t = GameTime * 1200.0;
    vec2 uv = riftData.rg;
    // Blue packs view (0-7), night (+8), tall (+16) and destination kind (*32). Alpha is lifecycle progress.
    int flags = int(riftData.b * 255.0 + 0.5);
    int view = int(mod(float(flags), 8.0));
    bool night = mod(floor(float(flags) / 8.0), 2.0) > 0.5;
    bool tall = mod(floor(float(flags) / 16.0), 2.0) > 0.5;
    int kind = int(floor(float(flags) / 32.0));
    float frostAmt = clamp(riftData.a * 2.0 - 1.0, 0.0, 1.0);
    float fade = clamp(riftData.a, 0.0, 1.0); // 0 dormant, 1 stable (ticks 0-100)
    // Proximity frost from the view ray: the pane clears as you walk up, and never from the packed alpha
    // (that channel is the lifecycle). The legacy unpack above stays so a missing ray still has a value.
    frostAmt = clamp(smoothstep(1.6, 7.5, length(worldRay)), 0.0, 1.0);

    vec3 tint = TINT[view];
    vec3 frost = FROST[view];
    if (night) {
        tint = mix(tint, vec3(1.0, 0.42, 0.62), 0.35);
        frost = mix(frost, vec3(0.62, 0.34, 0.48), 0.40);
    }

    vec2 cell = vec2(mix(U0, U1, uv.x), mix(V0, V1, uv.y));
    vec2 center = vec2(5.5, 3.6);
    vec2 q = cell - center;
    float dist = length(q);

    // The rift is wavy only on the sides and the corners. The fill does not travel.
    float side = abs(cos(atan(q.y, q.x)));
    float corner = smoothstep(0.28, 0.62, abs(sin(atan(q.y, q.x) * 2.0)));
    float sideMask = max(smoothstep(0.42, 0.78, side), corner);
    vec2 wave = vec2(
        (0.20 * sin(cell.y * 1.9 + t * 1.1) + 0.07 * sin(cell.y * 3.7 - t * 1.7)) * sideMask,
        0.06 * sin(cell.x * 1.4 + t * 0.7) * corner);
    float sdf = silhouette(cell, kind, tall);
    float sdfW = silhouette(cell + wave, kind, tall);

    // Ticks 61-100: the silhouette assembles from the centre out, then the circle math stops.
    float tier = clamp(length(q / vec2(6.5, 5.0)), 0.0, 1.0);
    float appearAt = 0.58 + tier * 0.38;
    float appear = smoothstep(appearAt, appearAt + 0.07, fade);
    float interior = (1.0 - smoothstep(-0.02, 0.09, sdf)) * appear;

    // Symmetrical shader outline: the stroke is centred on the contour, equal inside and outside.
    float stroke = (1.0 - smoothstep(0.045, 0.15, abs(sdfW))) * appear;
    float inner = (1.0 - smoothstep(0.012, 0.055, abs(sdf + 0.24))) * appear;
    float halo = (1.0 - smoothstep(0.08, 0.70, max(sdfW, 0.0))) * appear;

    // Detached hollow frames overlying the border. Present in the day, only much fainter.
    float frag = 0.0;
    for (int i = 0; i < 8; i++) {
        vec2 drift = vec2(sin(t * 0.17 + float(i) * 1.7), cos(t * 0.13 + float(i) * 0.9)) * 0.12;
        frag = max(frag, frame(cell, FRAG_C[i] + drift, FRAG_H[i], 0.09));
    }
    frag *= appear * (night ? 0.72 : 0.26);

    // Phase 1 (ticks 0-30): localised white-gold disc and three expanding rings. Locked off at progress 1.
    float discR = mix(0.15, 5.4, smoothstep(0.0, 0.30, min(fade, 0.30)));
    float discLife = 1.0 - smoothstep(0.18, 0.38, fade);
    float disc = (1.0 - smoothstep(discR - 0.5, discR, dist)) * discLife;
    float rings = 0.0;
    if (fade < 1.0) {
        float ringLife = 1.0 - smoothstep(0.20, 0.42, fade);
        for (int i = 0; i < 3; i++) {
            float radius = (0.35 + fade * 8.0) * (0.46 + float(i) * 0.24);
            rings += (1.0 - smoothstep(0.02, 0.10, abs(dist - radius))) * (0.5 - float(i) * 0.12);
        }
        rings *= ringLife;
    }

    // Phase 2 (ticks 31-60): tilted pulsing seed slab.
    float ang = 0.32;
    vec2 rot = vec2(cos(ang) * q.x + sin(ang) * q.y, -sin(ang) * q.x + cos(ang) * q.y);
    float seedD = sdBox(rot, vec2(1.85, 0.52));
    float seedLife = smoothstep(0.20, 0.32, fade) * (1.0 - smoothstep(0.52, 0.68, fade));
    float pulse = 0.55 + 0.45 * sin(t * 9.0);
    float seed = (1.0 - smoothstep(-0.02, 0.08, seedD)) * seedLife * (0.45 + 0.55 * pulse);
    float seedRim = (1.0 - smoothstep(0.015, 0.09, abs(seedD))) * seedLife;

    float boltLife = 1.0 - smoothstep(0.38, 0.62, fade);
    float bolts = fade < 0.64 ? boltField(cell, center, t, boltLife) : 0.0;

    // Seven recurring phases kept as a gentle breath, not a grey wash.
    float phase = mod(t, 6.0) * (7.0 / 6.0);
    float throb = 0.5 + 0.5 * sin(t * 8.0);
    float strength = phase < 1.0 ? phase : phase < 2.0 ? 1.0 : phase < 3.0 ? 0.45 + 0.4 * throb :
                     phase < 4.0 ? 4.0 - phase : phase < 5.0 ? 0.15 : phase < 6.0 ? 0.9 : 0.25 + 0.3 * throb;
    float crack = 1.0 - smoothstep(0.012, 0.045, abs(uv.x - 0.5 - 0.1 * sin(floor(uv.y * 24.0) + floor(t * 5.0))));

    // Ripple lives on the outer edge only, so the middle of the window stays a stable place.
    vec2 rippleOffset = vec2(sin(uv.y * 14.0 + (t * 0.05)), cos(uv.x * 10.0 - (t * 0.03))) * 0.02;
    float rimW = smoothstep(0.40, 0.0, abs(sdf));
    vec3 dir = normalize(worldRay + vec3(rippleOffset * rimW, 0.0) + vec3(0.0, 0.0, 0.0001));
    vec2 faceUv = clamp(vec2(cell.x / 11.0, cell.y / 8.0), 0.0, 1.0);
    float edgeFade = exp(-3.0 * dot(faceUv * 2.0 - 1.0, faceUv * 2.0 - 1.0));
    float destAmt = smoothstep(0.05, 0.45, edgeFade);
    destAmt = mix(destAmt, 0.12, smoothstep(0.28, 0.0, abs(sdf)));
    float blur = 0.006 + 0.020 * frostAmt;
    vec3 col = destination(dir, tint, frost, faceUv, crack * (1.0 - interior), strength, t);
    col = mix(col, destination(normalize(dir + vec3(0.0, blur, 0.0)), tint, frost, faceUv, 0.0, strength, t), 0.5);
    col = mix(col, destination(normalize(dir + vec3(blur * 1.4, 0.0, 0.0)), tint, frost, faceUv, 0.0, strength, t), 0.35);
    col = mix(col, destination(normalize(dir + vec3(0.0, 0.0, blur * 1.4)), tint, frost, faceUv, 0.0, strength, t), 0.35);
    col = mix(col, frost, frostAmt * 0.18);
    // Trailer fill: gold along the bottom, pink toward the upper right, a soft cloud, never a white cap.
    // Day leans coral, night leans deep amber. The white belongs on the rim only.
    vec3 portal = mix(vec3(1.00, 0.74, 0.34), vec3(1.00, 0.50, 0.64),
        smoothstep(0.12, 0.88, uv.y) * 0.62 + uv.x * 0.18);
    if (night) portal = mix(vec3(0.86, 0.45, 0.22), portal, 0.42);
    else portal = mix(portal, vec3(1.00, 0.42, 0.55), 0.20);
    float cloud = smoothstep(0.58, 0.90, 0.5 + 0.5 * sin(cell.x * 0.8 + t * 0.18) * cos(cell.y * 0.55 - t * 0.11));
    portal = mix(portal, vec3(1.0, 0.94, 0.88), cloud * 0.20);
    col = mix(portal, col, 0.12);
    // Stay under the bloom threshold. White is mixed in later, and only on the rim.
    col = min(col, vec3(0.78));
    float gloss = smoothstep(0.72, 1.0, sin((faceUv.x * 1.25 + faceUv.y * 0.75) * 3.14159 + t * 0.25) * 0.5 + 0.5);
    col += portal * gloss * 0.05;
    col *= 0.92 + 0.08 * strength;

    float glass = mix(0.86, 0.98, frostAmt);
    float a = mix(0.45 * edgeFade, glass, destAmt) * fogFade() * fade;

#ifdef RIFT_REFRACT
    vec2 bend = vec2(sin(uv.y * 31.0 + t * 2.4), cos(uv.x * 27.0 - t * 1.9));
    vec2 size = vec2(textureSize(Sampler1, 0));
    vec2 texel = 1.0 / size;
    vec2 screen = gl_FragCoord.xy * texel;
    vec2 sampleUv = clamp(screen + bend * texel * 5.0 * edgeFade, texel * 0.5, vec2(1.0) - texel * 0.5);
    float warpedDepth = texture(Sampler0, sampleUv).r;
    if (warpedDepth > gl_FragCoord.z + 0.00001) sampleUv = screen;
    col = mix(texture(Sampler1, sampleUv).rgb, col, destAmt);
#endif

    // Wavy aurora around the opening. Broad soul-face hollows, slow, never a scanline.
    float aura = exp(-max(sdfW, 0.0) * 0.40) * (1.0 - interior) * appear;
    float faceMask = sin(uv.y * 6.0 + (t * 0.02)) * cos(uv.x * 4.0 - (t * 0.01));
    float smoothFace = smoothstep(0.70, 0.88, faceMask);
    aura *= 1.0 - 0.70 * smoothFace;
    vec3 auraCol = night ? vec3(0.85, 0.32, 0.68) : mix(vec3(0.35, 0.95, 0.82), tint, 0.35);
    float auraA = aura * (night ? 0.32 : 0.18);

    // Many soft shafts, not a few lasers. Night accumulates more; day keeps a hint.
    float rays = 0.0;
    float rayAng = atan(q.y, q.x);
    for (int i = 0; i < 10; i++) {
        float ba = rayAng + float(i) * 0.628 + t * 0.03;
        float band = exp(-pow(sin(ba * 2.0 + float(i)), 2.0) * 14.0);
        rays += band * exp(-dist * 0.22);
    }
    // Shafts stay outside the pane. A burst inside the fill read as another white layer.
    rays *= (night ? 0.045 : 0.012) * (1.0 - interior * 0.9) * exp(-max(sdf, 0.0) * 0.55) * appear;
    vec3 rayCol = night ? vec3(1.0, 0.72, 0.86) : vec3(0.70, 0.95, 1.0);

    vec3 rgb = col * interior;
    // glass stays the 0.36 frost value; 0.72 brings the pane to the 0.65 translucent multiplier
    // so the colour reads and the world only hazes through. Not a white sheet, not a clear window.
    float alpha = a * interior * 0.72;
    rgb += auraCol * auraA;
    alpha = max(alpha, auraA * fogFade());
    rgb += tint * halo * 0.55;
    alpha = max(alpha, halo * 0.42 * fogFade());
    // Chunky neon rim. White stays on the contour; it does not wash the fill.
    float lip = (1.0 - smoothstep(0.06, 0.30, abs(sdfW))) * appear;
    rgb = mix(rgb, vec3(1.0), max(stroke, lip * 0.8));
    alpha = max(alpha, max(stroke, lip * 0.8) * fogFade());
    // Kept as a hairline. A strong inner stroke was cutting the fill into shelves.
    rgb = mix(rgb, mix(vec3(1.0), tint, 0.35), inner * 0.22);
    alpha = max(alpha, inner * 0.22 * fogFade());
    // Cyan / magenta fringe beside the rim — the close-up distortion, not a second fill.
    float fringe = smoothstep(0.0, 0.08, abs(sdfW)) * (1.0 - smoothstep(0.08, 0.34, abs(sdfW))) * appear;
    vec3 fringeCol = mix(vec3(0.20, 0.90, 1.0), vec3(1.0, 0.32, 0.70), 0.5 + 0.5 * sin(cell.y * 0.7 + t));
    rgb += fringeCol * fringe * 0.40 * (1.0 - stroke);
    alpha = max(alpha, fringe * 0.28 * fogFade());
    // Geometry owns the hollow frames. This is only the faint daytime hint.
    rgb += vec3(1.0) * frag * 0.35;
    alpha = max(alpha, frag * 0.35 * fogFade());
    // Sparse white squares inside the pane, not a sheet.
    float spark = 0.0;
    for (int i = 0; i < 5; i++) {
        vec2 sc = center + vec2(sin(float(i) * 2.4) * 2.4, cos(float(i) * 1.7) * 1.6);
        sc += 0.12 * vec2(sin(t * 0.3 + float(i)), cos(t * 0.25 + float(i) * 1.3));
        spark = max(spark, 1.0 - smoothstep(0.035, 0.08, max(abs(cell.x - sc.x), abs(cell.y - sc.y))));
    }
    spark *= interior * appear * 0.85;
    rgb += vec3(1.0) * spark;
    alpha = max(alpha, spark * fogFade());
    // Thin concentric circles on the plane outside the opening. They expand and die. No square flakes.
    float ringsOut = 0.0;
    for (int i = 0; i < 3; i++) {
        float ph = mod(t * 0.22 + float(i) * 0.33, 1.0);
        float ringR = 1.6 + ph * 5.2;
        ringsOut += (1.0 - smoothstep(0.012, 0.045, abs(dist - ringR))) * (1.0 - smoothstep(0.55, 1.0, ph));
    }
    ringsOut *= (1.0 - interior) * 0.40 * appear;
    rgb += tint * ringsOut;
    alpha = max(alpha, ringsOut * 0.32 * fogFade());
    rgb += rayCol * rays;
    alpha = max(alpha, rays * 2.2 * fogFade());

    // Phase 1: a rigid vertical core the lightning coils around. Gone before the fill locks.
    float coreLife = 1.0 - smoothstep(0.18, 0.38, fade);
    float rod = (1.0 - smoothstep(0.05, 0.16, abs(cell.x - center.x)))
        * (1.0 - smoothstep(2.6, 4.4, abs(cell.y - center.y))) * coreLife;
    // Razor thread coiled around the core. Not a glow.
    float coilX = center.x + 0.46 * sin(cell.y * 3.4 + t * 8.0);
    float coil = (1.0 - smoothstep(0.015, 0.05, abs(cell.x - coilX)))
        * (1.0 - smoothstep(2.2, 4.0, abs(cell.y - center.y))) * coreLife;
    // Birth overlays sit on top of whatever has assembled, and they are local to the canvas.
    float white = disc + rings * 0.85 + seed + seedRim + bolts + rod + coil;
    rgb += vec3(1.0) * white;
    alpha = max(alpha, white * fogFade());
    // Ignition drains the flash. It must not leave a white layer on the open window.
    float ignite = 1.0 - smoothstep(0.30, 0.62, fade);
    rgb = mix(rgb, vec3(1.0), ignite * disc);

    // Dark hollows only in the outer glow, so the window is never punched out.
    rgb = mix(rgb, vec3(0.02, 0.02, 0.04), smoothFace * aura * 0.85);
    return vec4(rgb, clamp(alpha, 0.0, 1.0));
}

void main() {
    packLight = vec4(1.0, 1.0, 0.0, 1.0);
    packNormal = vec4(0.5, 0.5, 1.0, 0.0);
    vec4 rift = compose();
#if defined(RIFT_GLOW)
    packLight = vec4(0.0);
    packNormal = vec4(0.0);
    float bloom = smoothstep(0.82, 1.35, max(rift.r, max(rift.g, rift.b)));
    fragColor = vec4(rift.rgb, bloom * rift.a * 0.9) * ColorModulator;
#elif defined(RIFT_WALL)
    packLight = vec4(1.0, 1.0, 0.0, 1.0);
    packNormal = vec4(0.5, 0.5, 1.0, 0.0);
    fragColor = apply_fog(vec4(riftData.rgb, riftData.a * 0.82) * ColorModulator,
        sphericalVertexDistance, cylindricalVertexDistance, FogEnvironmentalStart, FogEnvironmentalEnd,
        FogRenderDistanceStart, FogRenderDistanceEnd, FogColor);
#else
    fragColor = rift * ColorModulator;
#endif
}
