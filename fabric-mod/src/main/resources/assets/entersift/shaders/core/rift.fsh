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

// 0.36: the destination seen through the opening, as a function so the frost can BLUR it by sampling
// neighbouring directions. Everything is driven by the view ray, so walking past the rift parallaxes.
vec3 destination(vec3 dir, vec3 tint, vec3 frost, vec2 uv, float crack, float strength, float t, int view, float hasTerrain) {
    float up = clamp(dir.y, -1.0, 1.0);
    float az = atan(dir.z, dir.x);

    // 0.37: each rift style paints ITS OWN world, so the opening can never be mistaken for the place
    // the player is standing in: 1 and 7 are the nether-heavy looks (embers, low burning horizon),
    // 2 is the end (a violet void with a floating island), the rest are temperate (sky, clouds, ridges).
    bool ember  = (view == 1 || view == 7);
    bool endish = (view == 2);
    float landY = endish ? -0.05 : ember ? -0.17 : 0.0;

    vec3 zenith  = mix(tint, frost, 0.35) * 0.42;
    vec3 horizon = mix(tint, vec3(1.0), 0.28);
    vec3 floorC  = endish ? mix(frost, vec3(0.02, 0.02, 0.06), 0.70)
                 : ember  ? mix(vec3(0.22, 0.05, 0.02), tint, 0.35)
                 :          mix(frost, vec3(0.05, 0.06, 0.09), 0.55);
    vec3 ridgeFar  = mix(tint, frost, 0.45) * 0.30;
    vec3 ridgeNear = mix(frost, vec3(0.03, 0.04, 0.06), 0.40);

    vec3 col = mix(horizon, zenith, smoothstep(0.02, 0.62, up));
    col = mix(col, floorC, smoothstep(0.02, -0.22, up) * 0.85);
    // A far ridge line, then a nearer, darker one: the destination reads as a PLACE, not a picture.
    float farRidge  = landY + 0.115 + 0.055 * sin(az * 2.3 + 0.8) + 0.030 * sin(az * 5.1 + 2.2);
    float nearRidge = landY + 0.045 + 0.045 * sin(az * 3.1 - 1.1) + 0.022 * sin(az * 7.3 + 0.4);
    if (hasTerrain < 0.5) {   // with a real relief behind the glass the painted land would double it up
        col = mix(col, ridgeFar,  1.0 - smoothstep(farRidge  - 0.008, farRidge  + 0.008, up));
        col = mix(col, ridgeNear, 1.0 - smoothstep(nearRidge - 0.008, nearRidge + 0.008, up));
    }
    if (!endish) {
        // A rift sun hanging over the ridge, with a wide glow. The End has no sun.
        float sun = length(vec2((az - 0.55) * 0.85, up - 0.34));
        col += tint * exp(-sun * 3.2) * 0.55;
        col = mix(col, vec3(1.0), 1.0 - smoothstep(0.020, 0.045, sun));
    } else {
        // A floating island silhouette: the unmistakable End shape.
        float island = 1.0 - smoothstep(0.0, 0.19, length(vec2(az * 0.75, (up + 0.11) * 2.4)));
        col = mix(col, mix(frost, tint, 0.5) * 0.35, island * 0.9);
    }
    if (ember) {
        // Embers rising off a burning horizon.
        float e = pow(max(0.0, sin(up * 30.0 + t * 2.0 + az * 6.0)), 10.0);
        col += vec3(1.0, 0.45, 0.10) * e * 0.60;
        col += vec3(1.0, 0.35, 0.10) * exp(-abs(up - landY) * 9.0) * 0.25;
    } else if (!endish) {
        // Temperate sky: slow cloud bands above the ridge.
        float clouds = smoothstep(0.60, 0.85, sin(up * 9.0 + t * 0.03 + az * 0.5) * 0.5 + 0.5);
        col = mix(col, vec3(1.0), clouds * 0.16);
    }
    // Sparks drifting up through the opening.
    float motes = sin(up * 26.0 - t * 2.2 + az * 5.0) * sin(up * 41.0 - t * 3.1 - az * 3.0 + 1.7);
    col += tint * pow(max(0.0, motes), 6.0) * 0.55;
    // The rift's own energy still breathes across the opening.
    col = mix(col, vec3(1.0, 0.48, 0.12), crack * 0.35);
    col += tint * (0.18 + 0.30 * strength) * exp(-1.6 * dot(uv * 2.0 - 1.0, uv * 2.0 - 1.0));
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
    int codeRaw = int(riftData.b * 64.0);
    int view = codeRaw % 8;
    // 0.38: 16 bit set = the client also has the server's sampled destination relief behind the glass,
    // so this shader keeps only the sky and weather and lets the real terrain carry the land.
    float hasTerrain = float((codeRaw / 16) % 2);
    // 0.39: 32 bit set = the rift's WHOLE interior is the window, so the destination fills it edge to
    // edge, the frost is only a veil and the scene copy stays in the thin outer rim.
    float openWindow = float((codeRaw / 32) % 2);
    vec2 uv = riftData.rg;
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
    // 0.34/0.36: WHAT IS BEYOND THE OPENING.
    // 0.31 sampled the copied framebuffer here, so the middle of the rift showed the world the player
    // was standing in - a literal window onto the Overworld, with no dimension behind it (reported in
    // game). The opening now paints the dimension the rift leads to and puts a BLURRED, FROSTED GLASS
    // over it, exactly as the user described: "imagine a window and then gloss it over with the blurred
    // frosted look". The real scene is sampled ONLY in the thin outer rim, where the glass edge bends
    // what surrounds the rift.
    // -------------------------------------------------------------------------------------------
    vec3 dir = normalize(worldRay + vec3(0.0, 0.0, 0.0001)); // camera -> this point, world axes

    // The frosted gloss blurs the destination: a wider spread at range (frostAmt high), sharper up close.
    float blur = 0.006 + 0.020 * frostAmt;
    vec3 col = destination(dir, tint, frost, uv, crack, strength, t, view, hasTerrain);
    col = mix(col, destination(normalize(dir + vec3(0.0, blur, 0.0)), tint, frost, uv, crack, strength, t, view, hasTerrain), 0.5);
    col = mix(col, destination(normalize(dir + vec3(blur * 1.4, 0.0, 0.0)), tint, frost, uv, crack, strength, t, view, hasTerrain), 0.35);
    col = mix(col, destination(normalize(dir + vec3(0.0, 0.0, blur * 1.4)), tint, frost, uv, crack, strength, t, view, hasTerrain), 0.35);
    // The frosted sheet sits OVER the destination (the reference's hazy pane), never over the world.
    // 0.39: a giant window is barely veiled - the frost is a gloss on the glass, not a curtain over it.
    col = mix(col, frost, frostAmt * mix(0.62, 0.26, openWindow));
    col += vec3(0.05) * frostAmt;
    // A slow gloss band sweeps the glass, the way the reference frames catch the light.
    float gloss = smoothstep(0.72, 1.0, sin((uv.x * 1.25 + uv.y * 0.75) * 3.14159 + t * 0.25) * 0.5 + 0.5);
    col += vec3(0.14) * gloss * (0.35 + frostAmt);

    // The opening is opaque: nothing of the world behind the rift may show through it. The captured
    // scene is used only in the outer rim, where the glass edge bends the surroundings. Up close the
    // pane clears to 0.86 (still glass); at range the frost takes it towards 0.98.
    float destAmt = smoothstep(0.05, 0.45, edgeFade);
    // 0.39: an open rift must show its destination from the very edge inwards; the scene copy that keeps
    // the background bending is squeezed into the outermost rim (which is where the glass curve is).
    destAmt = min(1.0, mix(destAmt, destAmt * 2.4, openWindow));
    // Thin glass when the real terrain is drawn behind it (the frosted look is the gloss on top),
    // near-opaque only when the painted world is all there is.
    float glass = mix(0.34, 0.72, frostAmt) + (1.0 - hasTerrain) * 0.34;
    // 0.39: a giant window is glass you look THROUGH, not a film over the destination.
    glass = max(glass, mix(0.70, 0.92, frostAmt) * openWindow);
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
    col = mix(texture(Sampler1, sampleUv).rgb, col, destAmt);
#endif
    fragColor = vec4(col, a) * ColorModulator;
#endif
}
