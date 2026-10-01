#version 330
#extension GL_ARB_separate_shader_objects : require

// 0.22 Enter the Sift: walkable cosmic warp corridor shader (trailer refs IMG_5844, IMG_5845, IMG_5864-5866).
// Looking down the tunnel (+Z) there is a blinding white-gold core, fiery orange-red rings, scrolling
// rectangular voxel hallway bands, and long cosmic light streaks rushing outward (fiery orange-red
// and electric teal/cyan).

#include <minecraft:fog.glsl>
#include <minecraft:globals.glsl>
#include <minecraft:dynamictransforms.glsl>

layout(location = 0) in vec4 dirData;

layout(location = 0) out vec4 fragColor;
layout(location = 1) out vec4 packLight;   // 0.18.2: shader-pack masks (see rift.fsh)
layout(location = 2) out vec4 packNormal;

float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
}

// Value noise that wraps every `period` cells in x (the perimeter coordinate around the tunnel axis).
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
    // Rectangular Chebyshev distance from the +Z tunnel axis for voxel-ring framing, blended with forward depth
    float boxDist = max(abs(d.x), abs(d.y)) / max(d.z + 1.05, 0.08);
    float ang = acos(clamp(d.z, -1.0, 1.0)) / 3.14159265;     // 0 straight ahead, 1 straight behind
    float phi = atan(d.y, d.x) / 6.2831853 + 0.5;              // 0..1 around the axis
    float depth = 1.0 / (ang + 0.03);                          // perspective: far away near the centre

    // Cosmic streaks: fine and coarse layers, flowing outward (depth decreasing over time).
    float s1 = pnoise(vec2(phi * 96.0, depth * 0.9 - t * 5.0), 96.0);
    float s2 = pnoise(vec2(phi * 40.0 + 7.0, depth * 0.45 - t * 3.2), 40.0);
    float s3 = pnoise(vec2(phi * 180.0 + 3.0, depth * 1.6 - t * 7.5), 180.0);
    float streak = pow(s1, 6.0) * 1.3 + pow(s2, 4.0) * 0.8 + pow(s3, 10.0) * 1.6;
    // Teal / cyan streak sectors that slowly rotate.
    float sector = smoothstep(0.60, 0.85, pnoise(vec2(phi * 7.0 + t * 0.05, t * 0.15), 7.0));
    float tealLines = pow(pnoise(vec2(phi * 120.0 + 11.0, depth * 1.1 - t * 6.0), 120.0), 5.0) * sector;

    // Base colour ramp from the blinding white-gold core outward into blazing orange and deep crimson.
    vec3 core   = vec3(1.00, 0.96, 0.94);
    vec3 yellow = vec3(1.00, 0.86, 0.36);
    vec3 orange = vec3(1.00, 0.36, 0.04);
    vec3 red    = vec3(0.86, 0.12, 0.10);
    vec3 deep   = vec3(0.36, 0.03, 0.06);
    vec3 teal   = vec3(0.08, 0.78, 0.92);
    vec3 col = mix(core, yellow, smoothstep(0.0, 0.06, ang));
    col = mix(col, orange, smoothstep(0.05, 0.15, ang));
    col = mix(col, red, smoothstep(0.13, 0.32, ang));
    col = mix(col, deep, smoothstep(0.35, 0.82, ang));

    // Scrolling rectangular voxel ring bands along the corridor walls
    float voxelRing = pow(0.5 + 0.5 * sin((1.0 / (boxDist + 0.06)) * 1.2 - t * 4.2), 8.0) * smoothstep(0.02, 0.12, ang) * 0.28;

    vec3 streakCol = mix(vec3(1.0, 0.8, 0.45), vec3(1.0, 0.95, 0.85), smoothstep(0.2, 0.0, ang));
    col += streakCol * streak * (0.35 + 0.65 * smoothstep(0.5, 0.05, ang));
    col = mix(col, mix(teal, vec3(0.30, 0.95, 0.78), 0.45), clamp(tealLines * 1.6, 0.0, 0.85));
    col += vec3(1.0, 0.62, 0.28) * voxelRing;
    col += core * exp(-ang * ang * 900.0) * 0.85;              // blinding centre
    fragColor = vec4(min(col, vec3(1.0)), 1.0) * ColorModulator;
    packLight = vec4(1.0, 1.0, 0.0, 1.0);
    packNormal = vec4(0.5, 0.5, 1.0, 0.0);
}
