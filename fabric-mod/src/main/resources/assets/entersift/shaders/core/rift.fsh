#version 330
#extension GL_ARB_separate_shader_objects : require

// Filled rift material. The stepped mesh supplies the silhouette and physical side depth;
// this shader supplies a translucent, animated pastel membrane with no fullscreen white flash.
// RIFT_WALL draws the faceted shell, while RIFT_GLOW is reserved for the controlled rim and sparks.

#include <minecraft:fog.glsl>
#include <minecraft:globals.glsl>
#include <minecraft:dynamictransforms.glsl>

layout(location = 0) in vec4 riftData;
layout(location = 1) in vec3 worldRay;
layout(location = 2) in float sphericalVertexDistance;
layout(location = 3) in float cylindricalVertexDistance;

layout(location = 0) out vec4 fragColor;
// Keep rift pixels out of shader-pack lighting/composite passes; they are self-lit client geometry.
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

float noise21(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash21(i);
    float b = hash21(i + vec2(1.0, 0.0));
    float c = hash21(i + vec2(0.0, 1.0));
    float d = hash21(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

float fbm(vec2 p) {
    float sum = 0.0, weight = 0.55;
    for (int i = 0; i < 3; ++i) {
        sum += weight * noise21(p);
        p = p * 2.03 + vec2(17.1, 9.2);
        weight *= 0.5;
    }
    return sum;
}

void materialPalette(int view, bool night, out vec3 low, out vec3 middle, out vec3 high, out vec3 accent) {
    // Warm coral, apricot and pink remain the signature look; rift type only shifts the hue.
    if (view == 1) {
        low = vec3(0.56, 0.14, 0.18); middle = vec3(0.94, 0.37, 0.20);
        high = vec3(0.98, 0.66, 0.36); accent = vec3(1.00, 0.53, 0.37);
    } else if (view == 2) {
        low = vec3(0.34, 0.25, 0.61); middle = vec3(0.66, 0.43, 0.79);
        high = vec3(0.88, 0.69, 0.87); accent = vec3(0.67, 0.80, 0.91);
    } else if (view == 3) {
        low = vec3(0.76, 0.38, 0.55); middle = vec3(0.98, 0.63, 0.55);
        high = vec3(0.93, 0.58, 0.76); accent = vec3(0.48, 0.83, 0.72);
    } else if (view == 4) {
        low = vec3(0.18, 0.55, 0.69); middle = vec3(0.36, 0.81, 0.85);
        high = vec3(0.70, 0.87, 0.88); accent = vec3(0.93, 0.65, 0.78);
    } else if (view == 5) {
        low = vec3(0.71, 0.46, 0.20); middle = vec3(0.94, 0.70, 0.34);
        high = vec3(0.96, 0.84, 0.55); accent = vec3(0.91, 0.55, 0.55);
    } else {
        low = vec3(0.90, 0.43, 0.33); middle = vec3(0.99, 0.68, 0.39);
        high = vec3(0.95, 0.55, 0.68); accent = vec3(0.88, 0.72, 0.73);
    }
    if (night) {
        low *= 0.78;
        middle *= 0.84;
        high *= 0.88;
    }
}

vec4 animatedMembrane(vec2 uv, vec3 viewRay, int view, bool night, float t) {
    vec3 low, middle, high, accent;
    materialPalette(view, night, low, middle, high, accent);

    float field = fbm(uv * vec2(3.0, 2.6) + viewRay.xz * 0.42 + vec2(t * 0.035, -t * 0.022));
    float flow = 0.5 + 0.5 * sin((uv.x * 1.15 + uv.y * 1.55 + (field - 0.5) * 0.30 + viewRay.z * 0.08) * 2.0 * PI - t * 0.72);
    float drift = 0.07 * sin(uv.x * 7.0 - t * 0.44) + 0.045 * sin(uv.y * 10.0 + t * 0.31);
    float vertical = clamp(uv.y + drift + (field - 0.5) * 0.16, 0.0, 1.0);

    vec3 color = mix(low, high, smoothstep(0.04, 0.96, vertical));
    color = mix(color, middle, 0.26 + 0.32 * flow);
    float fold = smoothstep(0.68, 0.93, 0.5 + 0.5 * sin((uv.x * 1.9 - uv.y * 0.7 + field * 0.22) * 2.0 * PI + t * 0.50));
    color = mix(color, accent, fold * 0.24);

    // A soft apricot heart, intentionally capped below white so the fill never becomes a flash layer.
    float core = exp(-dot((uv - vec2(0.52, 0.49)) * vec2(0.92, 1.05), (uv - vec2(0.52, 0.49)) * vec2(0.92, 1.05)) * 8.0);
    vec3 warmCore = view == 4 ? vec3(0.70, 0.90, 0.87) : vec3(1.00, 0.80, 0.61);
    color = mix(color, warmCore, core * 0.20);
    color *= 0.86 + 0.12 * field;

    // Straight-alpha blend: keeps terrain readable underneath without erasing the dimensional color.
    float alpha = clamp(0.50 + 0.10 * field + 0.055 * flow + (night ? 0.02 : 0.0), 0.48, 0.68);
    return vec4(clamp(color, 0.0, 0.96), alpha);
}
#endif

void main() {
#if defined(RIFT_GLOW)
    packLight = vec4(0.0);
    packNormal = vec4(0.0);
    fragColor = vec4(riftData.rgb, riftData.a * fogFade()) * ColorModulator;
#elif defined(RIFT_WALL)
    packLight = vec4(1.0, 1.0, 0.0, 1.0);
    packNormal = vec4(0.5, 0.5, 1.0, 0.0);
    fragColor = apply_fog(vec4(riftData.rgb, 1.0) * ColorModulator, sphericalVertexDistance, cylindricalVertexDistance,
        FogEnvironmentalStart, FogEnvironmentalEnd, FogRenderDistanceStart, FogRenderDistanceEnd, FogColor);
#else
    packLight = vec4(1.0, 1.0, 0.0, 1.0);
    packNormal = vec4(0.5, 0.5, 1.0, 0.0);
    int flags = int(riftData.b * 16.0);
    int view = flags - (flags / 8) * 8;
    bool night = flags >= 8;
    vec3 dir = normalize(worldRay);
    float t = GameTime * 1200.0;
    vec4 membrane = animatedMembrane(clamp(riftData.rg, 0.0, 1.0), dir, view, night, t);
    fragColor = apply_fog(membrane * ColorModulator, sphericalVertexDistance, cylindricalVertexDistance,
        FogEnvironmentalStart, FogEnvironmentalEnd, FogRenderDistanceStart, FogRenderDistanceEnd, FogColor);
#endif
}
