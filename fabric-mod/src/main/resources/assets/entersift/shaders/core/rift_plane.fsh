#version 330
#extension GL_ARB_separate_shader_objects : require

// 0.41 SCREEN-SPACE RIFT — single-pass fragment solution (official recipe, item 3).
// One flat quad per rift; everything below is procedural math on the quad UV:
//   * stepped UV bounding math draws the jagged tiered cross of the central portal,
//   * hollow debris shells float around it (only their voxel borders register solid),
//   * a continuous GameTime wave matrix liquid-warps the copied world framebuffer
//     (Sampler1 colour + Sampler0 depth guard) inside the portal = gravitational lensing,
//   * dynamic edge detection paints the glowing white outline around every boundary,
//   * a pixel-snapped pastel vortex (soft pink / warm yellow / deep orange) drifts over it.
// No clustered 3D block geometry anywhere: the shape lives entirely in this shader.

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
uniform sampler2D Sampler0; // copied scene depth, nearest, reverse-Z  (recipe: depth guard)
uniform sampler2D Sampler1; // copied scene colour = the world behind the plane (MinecraftRecolorTexture role)
#endif

// Per-view hue influence (destinations keep their identity; the vortex stays pastel).
const vec3 TINT[8] = vec3[8](
    vec3(0.97, 0.60, 0.40), vec3(0.95, 0.25, 0.18), vec3(0.65, 0.38, 0.85), vec3(1.0, 0.58, 0.65),
    vec3(0.20, 0.80, 0.95), vec3(0.95, 0.85, 0.25), vec3(1.0, 0.97, 0.96), vec3(1.0, 0.78, 0.52));

float hash21(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
}

// Signed box distance (negative inside) - the stepped bounding math primitive.
float sdBox(vec2 q, vec2 c, vec2 h) {
    vec2 d = abs(q - c) - h;
    return max(d.x, d.y);
}

// Jagged tiered cross: stacked arms with notched tiers, like the reference pixel-cross.
// Returns vec2(sd, tier) so the outline and per-tier shading share one boundary.
vec2 crossField(vec2 q) {
    float sd = sdBox(q, vec2(0.0), vec2(0.16, 0.60));      // vertical arm
    sd = min(sd, sdBox(q, vec2(0.0), vec2(0.60, 0.16)));   // horizontal arm
    sd = min(sd, sdBox(q, vec2(0.0), vec2(0.30, 0.30)));   // core
    sd = min(sd, sdBox(q, vec2(0.0,  0.44), vec2(0.10, 0.14)));  // tier notches
    sd = min(sd, sdBox(q, vec2(0.0, -0.44), vec2(0.10, 0.14)));
    sd = min(sd, sdBox(q, vec2( 0.44, 0.0), vec2(0.14, 0.10)));
    sd = min(sd, sdBox(q, vec2(-0.44, 0.0), vec2(0.14, 0.10)));
    float tier = floor(q.y * 6.0 + 0.5) * 0.5 + floor(q.x * 6.0 + 0.5) * 0.25;
    return vec2(sd, tier);
}

// Hollow debris shell i: a drifting box frame; only the border is solid.
// Returns vec3(border, core, 0) masks.
vec3 shellField(vec2 q, int i, float t) {
    float fi = float(i);
    vec2 c = vec2(
        (fract(fi * 0.6180339 + 0.21) * 2.0 - 1.0) * 0.86,
        (fract(fi * 0.3819660 + 0.37) * 2.0 - 1.0) * 0.80);
    // Weightless: low-frequency sine drift, exactly the gentle up/down path the recipe asks for.
    c += vec2(0.012 * sin(t * 0.45 + fi * 1.71), 0.028 * sin(t * 0.31 + fi * 2.23));
    vec2 h = vec2(0.055 + 0.05 * fract(fi * 0.4142135), 0.055 + 0.06 * fract(fi * 0.7320508));
    float sd = sdBox(q, c, h);
    float border = smoothstep(-0.030, -0.012, sd) * (1.0 - smoothstep(0.0, 0.012, sd));
    float core = 1.0 - smoothstep(-0.030, -0.012, sd);
    return vec3(border, core * (1.0 - border), 0.0);
}

// Pixel-snapped pastel vortex: soft pink / warm yellow / deep orange, slow shift.
vec3 vortex(vec2 q, float t, vec3 tint) {
    vec2 cell = floor(q * 10.0 + vec2(t * 0.10, -t * 0.07));
    float n1 = hash21(cell);
    float n2 = hash21(cell + 17.7);
    float shift = 0.5 + 0.5 * sin(t * 0.22 + n1 * 6.2831);
    vec3 pink   = vec3(1.00, 0.62, 0.72);
    vec3 yellow = vec3(1.00, 0.85, 0.45);
    vec3 orange = vec3(0.95, 0.45, 0.20);
    vec3 c = n1 < 0.45 ? pink : (n1 < 0.75 ? yellow : orange);
    c = mix(c, tint, 0.30);
    return c * (0.72 + 0.28 * n2) * (0.80 + 0.20 * shift);
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
    vec2 q = (riftData.rg * 2.0 - 1.0) * vec2(1.0, 1.12);   // plane space, slightly tall

    // ---- opening lifecycle (dormant -> white arc -> ignition -> reveal; closing reverses) ----
    float arcAmt   = smoothstep(0.16, 0.30, fade) * (1.0 - smoothstep(0.44, 0.60, fade));
    float whiteOut = smoothstep(0.42, 0.66, fade);
    float reveal   = smoothstep(0.66, 0.94, fade);

    vec2 cf = crossField(q);
    float crossIn = 1.0 - smoothstep(-0.012, 0.012, cf.x);
    // Dynamic edge detection: the exact boundary band of the cross, clean and solid white
    // (1 right at the boundary, 0 deep inside so the interior stays the vortex).
    float crossEdge = crossIn * smoothstep(-0.055, -0.020, cf.x);
    float tierShade = 0.90 + 0.10 * fract(cf.y * 0.75);

    vec3 shellB = vec3(0.0), shellAcc = vec3(0.0);
    float shellCore = 0.0;
    for (int i = 0; i < 6; i++) {
        vec3 sh = shellField(q, i, t);
        shellAcc += sh.x * vec3(1.0);
        shellCore = max(shellCore, sh.y);
    }
    shellB = min(shellAcc, 1.0);

    float anyMask = max(crossIn, max(shellB, shellCore * 0.5));
    if (anyMask < 0.003 && arcAmt < 0.01) {
        fragColor = vec4(0.0);
        return;
    }

    // ---- gravitational lensing: wave-matrix warp of the world framebuffer inside the shape ----
    vec3 bg = tint * 0.35;   // fallback when the scene copy is unavailable
#ifdef RIFT_PLANE_LENS
    vec2 size = vec2(textureSize(Sampler1, 0));
    vec2 texel = 1.0 / size;
    float lensZone = crossIn * (1.0 - crossEdge) + shellCore * 0.6;
    vec2 wave = vec2(
        sin(screenPos.y * 42.0 + t * 1.35) + 0.5 * sin(screenPos.y * 17.0 - t * 0.7),
        cos(screenPos.x * 38.0 - t * 1.10) + 0.5 * cos(screenPos.x * 15.0 + t * 0.6));
    vec2 sampleUv = clamp(screenPos + wave * texel * 6.0 * lensZone, texel * 0.5, vec2(1.0) - texel * 0.5);
    // Reverse-Z depth guard: never drag an occluder into the portal.
    float warpedDepth = texture(Sampler0, sampleUv).r;
    if (warpedDepth > gl_FragCoord.z + 0.00001) sampleUv = screenPos;
    bg = texture(Sampler1, sampleUv).rgb;
#endif

    // ---- interior composition: warped world + pastel vortex + per-tier step + core glow ----
    vec3 vort = vortex(q, t, tint);
    vec3 col = mix(bg * 0.55, vort, 0.55);
    col *= tierShade;
    col += tint * 0.22 * exp(-1.8 * dot(q, q));
    col = mix(col, vec3(1.0), crossEdge);                       // glowing white outline
    col = mix(col, vec3(1.0), shellB * 0.92);                  // hollow shell borders read solid
    col = mix(col, vort * 0.35, shellCore * 0.30);             // shell centres stay translucent

    // white arc / ignition / reveal
    float ringR = mix(0.18, 1.35, smoothstep(0.16, 0.60, fade));
    float thick = mix(0.30, 0.09, smoothstep(0.16, 0.60, fade));
    float arc = smoothstep(thick, thick * 0.35, abs(length(q) - ringR));
    col = mix(col, vec3(1.0, 0.99, 0.98), whiteOut * (1.0 - reveal));
    col = mix(col, vec3(1.0), arc * arcAmt * 0.9);

    // ---- opacity: solid rim and shell borders, translucent interior, dormant shimmer ----
    float a = max(crossIn * 0.90, max(crossEdge, max(shellB * 0.90, shellCore * 0.14)));
    a *= mix(0.10, 1.0, smoothstep(0.04, 0.30, fade));
    a = max(a, arc * arcAmt * 0.85);
    a *= fogFade() * mix(0.35, 1.0, fade);

    fragColor = vec4(min(col, vec3(1.5)), a) * ColorModulator;
}
