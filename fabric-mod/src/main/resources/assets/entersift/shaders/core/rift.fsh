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
    int view = int(riftData.b * 16.0) % 8;
    vec2 uv = riftData.rg;
    vec3 tint = view == 0 || view == 5 ? vec3(0.95, 0.85, 0.25) :
                view == 1 ? vec3(0.95, 0.25, 0.18) :
                view == 2 ? vec3(0.65, 0.38, 0.85) :
                view == 4 ? vec3(0.20, 0.80, 0.95) : vec3(1.0, 0.58, 0.65);
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
    fragColor = vec4(mix(scene, tint, alpha), 0.50 * edgeFade * fogFade() * riftData.a) * ColorModulator;
#else
    // No valid capture / shader-pack / disabled lens: preserve real terrain with a faint membrane.
    fragColor = vec4(tint, alpha * fogFade() * riftData.a) * ColorModulator;
#endif
#endif
}
