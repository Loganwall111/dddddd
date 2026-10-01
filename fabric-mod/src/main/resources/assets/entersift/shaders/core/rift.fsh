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
    float alpha = 0.15 * strength * edgeFade;
    tint = mix(tint, vec3(1.0, 0.48, 0.12), crack * 0.5);
    // The frosted sheet takes the rift's own frost colour, so each rift reads green / red / yellow / orange.
    tint = mix(tint, frost, frostAmt * 0.65);
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
    vec3 scene = texture(Sampler1, sampleUv).rgb;
    // Alpha blends the bent scene over the actual background; NOT a synthetic destination image.
    // Up close frostAmt falls away, so the dimension clears — but the sheet never goes fully clear.
    float a = max(0.50 * edgeFade * fogFade() * fade, frostAmt * 0.62 * edgeFade * fogFade());
    fragColor = vec4(mix(scene, tint, max(alpha, frostAmt * 0.5)), a) * ColorModulator;
#else
    // No valid capture / shader-pack / disabled lens: preserve real terrain with a faint membrane.
    float a = clamp(alpha + frostAmt * 0.55, 0.0, 1.0) * fogFade() * fade;
    fragColor = vec4(tint, a) * ColorModulator;
#endif
#endif
#endif
}
