#version 330
#extension GL_ARB_separate_shader_objects : require

// 0.18 Enter the Sift: the warp burst seen inside the rift tunnel (trailer ref IMG_5844).
// Looking down the tunnel (+Z) there is a white-pink core, then a yellow / orange ring, a deep red
// body, and long radial light streaks rushing outward, some of them teal / green. The streaks are
// periodic noise in the angle around the axis times a perspective depth coordinate 1/r that scrolls
// with time, so they stream past the viewer like hyperspace.

#include <minecraft:fog.glsl>
#include <minecraft:globals.glsl>
#include <minecraft:dynamictransforms.glsl>

layout(location = 0) in vec4 dirData;

layout(location = 0) out vec4 fragColor;

float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
}

// Value noise that wraps every `period` cells in x (the angle around the tunnel axis).
float pnoise(vec2 p, float period) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float x0 = mod(i.x, period), x1 = mod(i.x + 1.0, period);
    return mix(mix(hash21(vec2(x0, i.y)), hash21(vec2(x1, i.y)), f.x),
               mix(hash21(vec2(x0, i.y + 1.0)), hash21(vec2(x1, i.y + 1.0)), f.x), f.y);
}

void main() {
    float t = GameTime * 1200.0;
    vec3 d = normalize(dirData.rgb * 2.0 - 1.0);
    float ang = acos(clamp(d.z, -1.0, 1.0)) / 3.14159265;     // 0 straight ahead, 1 straight behind
    float phi = atan(d.y, d.x) / 6.2831853 + 0.5;              // 0..1 around the axis
    float depth = 1.0 / (ang + 0.03);                          // perspective: far away near the centre

    // Radial streaks: fine and coarse layers, flowing outward (depth decreasing over time).
    float s1 = pnoise(vec2(phi * 96.0, depth * 0.9 - t * 5.0), 96.0);
    float s2 = pnoise(vec2(phi * 40.0 + 7.0, depth * 0.45 - t * 3.2), 40.0);
    float s3 = pnoise(vec2(phi * 180.0 + 3.0, depth * 1.6 - t * 7.5), 180.0);
    float streak = pow(s1, 6.0) * 1.3 + pow(s2, 4.0) * 0.8 + pow(s3, 10.0) * 1.6;
    // Teal / green streak sectors that slowly rotate.
    float sector = smoothstep(0.62, 0.86, pnoise(vec2(phi * 7.0 + t * 0.05, t * 0.15), 7.0));
    float tealLines = pow(pnoise(vec2(phi * 120.0 + 11.0, depth * 1.1 - t * 6.0), 120.0), 5.0) * sector;

    // Base colour ramp from the core outward.
    vec3 core   = vec3(1.00, 0.95, 0.96);
    vec3 yellow = vec3(1.00, 0.86, 0.36);
    vec3 orange = vec3(1.00, 0.52, 0.14);
    vec3 red    = vec3(0.86, 0.12, 0.10);
    vec3 deep   = vec3(0.36, 0.03, 0.06);
    vec3 col = mix(core, yellow, smoothstep(0.0, 0.06, ang));
    col = mix(col, orange, smoothstep(0.05, 0.14, ang));
    col = mix(col, red, smoothstep(0.12, 0.3, ang));
    col = mix(col, deep, smoothstep(0.35, 0.8, ang));
    // Breathing pulse rings running outward.
    float pulse = pow(0.5 + 0.5 * sin(depth * 0.7 - t * 4.0), 8.0) * smoothstep(0.02, 0.1, ang) * 0.25;

    vec3 streakCol = mix(vec3(1.0, 0.8, 0.45), vec3(1.0, 0.95, 0.85), smoothstep(0.2, 0.0, ang));
    col += streakCol * streak * (0.35 + 0.65 * smoothstep(0.5, 0.05, ang));
    col = mix(col, vec3(0.30, 0.95, 0.78), clamp(tealLines * 1.6, 0.0, 0.85));
    col += vec3(1.0, 0.6, 0.3) * pulse;
    col += core * exp(-ang * ang * 900.0) * 0.8;               // blinding centre
    fragColor = vec4(min(col, vec3(1.0)), 1.0) * ColorModulator;
}
