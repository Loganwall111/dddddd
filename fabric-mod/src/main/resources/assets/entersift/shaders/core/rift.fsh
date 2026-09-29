#version 330
#extension GL_ARB_separate_shader_objects : require

// 0.17 Enter the Sift: GPU rift interior.
//
// Interior (default): a living marble "window" into another space.
//   * three marble layers at different virtual depths, offset by a per-pixel parallax computed from
//     the real view direction and a tangent frame rebuilt from screen-space derivatives, so the face
//     reads as a deep hole rather than a flat sheet from every angle;
//   * domain-warped fbm marble with wavy flowing veins (cream / peach / pink / orange for warm rifts);
//   * a fake gravitational lens: the centre is magnified and swirled, and ripples run outward.
// RIFT_HALO: the additive ring behind the rift. Concentric ripples plus a soft bloom that bend
//   toward the centre, which stands in for lensing of the world around it. (True lensing would need
//   to sample the already-rendered scene, which core shaders cannot do.)

#include <minecraft:fog.glsl>
#include <minecraft:globals.glsl>
#include <minecraft:dynamictransforms.glsl>

layout(location = 0) in vec4 riftData;
layout(location = 1) in vec3 viewPos;
layout(location = 2) in float sphericalVertexDistance;
layout(location = 3) in float cylindricalVertexDistance;

layout(location = 0) out vec4 fragColor;

// 5 colours per rift type: vein (lightest), base A, base B, accent, deep.
const vec3 PAL[25] = vec3[](
    // 0 overworld / warm trailer rift: cream, peach, pink, orange, rose
    vec3(1.00, 0.95, 0.86), vec3(1.00, 0.71, 0.54), vec3(1.00, 0.56, 0.69), vec3(1.00, 0.60, 0.29), vec3(0.88, 0.38, 0.48),
    // 1 nether
    vec3(1.00, 0.82, 0.63), vec3(1.00, 0.35, 0.23), vec3(0.75, 0.13, 0.23), vec3(1.00, 0.56, 0.25), vec3(0.38, 0.06, 0.13),
    // 2 end
    vec3(0.96, 0.91, 1.00), vec3(0.79, 0.64, 1.00), vec3(0.55, 0.42, 1.00), vec3(1.00, 0.61, 0.91), vec3(0.23, 0.14, 0.44),
    // 3 sift: pink + teal
    vec3(1.00, 0.96, 0.98), vec3(1.00, 0.75, 0.88), vec3(0.50, 0.89, 0.85), vec3(1.00, 0.61, 0.78), vec3(0.24, 0.55, 0.60),
    // 4 ancient-city portal: cyan
    vec3(0.94, 1.00, 1.00), vec3(0.55, 0.96, 1.00), vec3(0.24, 0.78, 0.91), vec3(0.72, 1.00, 0.96), vec3(0.10, 0.42, 0.54)
);

float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
}

float vnoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),
               mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x), f.y);
}

float fbm(vec2 p) {
    float s = 0.0, a = 0.5;
    for (int i = 0; i < 4; i++) {
        s += a * vnoise(p);
        p = p * 2.03 + vec2(17.1, 9.2);
        a *= 0.5;
    }
    return s;
}

vec3 pal(int type, int k) { return PAL[clamp(type, 0, 4) * 5 + k]; }

// Wavy flowing marble at one depth layer.
vec3 marble(vec2 uv, float t, int type, float layer) {
    vec2 p = uv * 3.2 + layer * 7.3;
    vec2 q = vec2(fbm(p + vec2(0.0, t * 0.05)), fbm(p + vec2(5.2, 1.3) - t * 0.04));
    vec2 r = vec2(fbm(p + 3.0 * q + vec2(1.7, 9.2) + t * 0.06), fbm(p + 3.0 * q + vec2(8.3, 2.8) - t * 0.05));
    float f = fbm(p + 3.0 * r);
    float bands = 0.5 + 0.5 * sin((p.x + p.y * 0.6) * 2.2 + f * 9.0 + t * 0.35);
    vec3 c = mix(pal(type, 1), pal(type, 2), smoothstep(0.25, 0.75, f));
    c = mix(c, pal(type, 3), smoothstep(0.55, 0.95, bands) * 0.75);
    c = mix(c, pal(type, 0), pow(1.0 - abs(bands * 2.0 - 1.0), 7.0) * 0.9);   // thin cream veins
    c = mix(c, pal(type, 4), smoothstep(0.55, 1.0, length(q)) * 0.35);
    return c;
}

void main() {
    vec2 uv = riftData.rg;
    int type = int(riftData.b * 8.0);
    float fade = riftData.a;
    float t = GameTime * 1200.0;            // seconds (GameTime is the day fraction)
    vec2 d = uv - 0.5;
    float r = length(d) + 1e-4;

#ifdef RIFT_HALO
    // r: 0 at the centre, ~0.5 at the quad edge. Ripples travel outward and bend inward (lens feel).
    float rr = r * 2.0;
    float bend = rr + 0.04 * sin(atan(d.y, d.x) * 3.0 + t * 0.8);
    float waves = pow(0.5 + 0.5 * sin(bend * 30.0 - t * 2.6), 5.0);
    float ring = smoothstep(1.0, 0.55, rr) * smoothstep(0.28, 0.5, rr);
    float bloom = smoothstep(1.0, 0.3, rr) * 0.35;
    vec3 col = mix(pal(type, 1), pal(type, 0), waves);
    float a = (waves * ring * 0.45 + bloom * 0.5) * fade;
    fragColor = vec4(col, a) * ColorModulator;
#else
    // Tangent frame from screen-space derivatives (no normals or tangents needed on the vertices).
    vec3 dp1 = dFdx(viewPos), dp2 = dFdy(viewPos);
    vec2 du1 = dFdx(uv), du2 = dFdy(uv);
    vec3 N = normalize(cross(dp1, dp2));
    vec3 dp2p = cross(dp2, N), dp1p = cross(N, dp1);
    vec3 T = dp2p * du1.x + dp1p * du2.x;
    vec3 B = dp2p * du1.y + dp1p * du2.y;
    float inv = inversesqrt(max(max(dot(T, T), dot(B, B)), 1e-12));
    T *= inv; B *= inv;
    vec3 V = normalize(-viewPos);
    vec3 tv = vec3(dot(V, T), dot(V, B), abs(dot(V, N)));
    vec2 par = clamp(tv.xy / max(tv.z, 0.3), vec2(-3.0), vec2(3.0));

    // Fake gravitational lens: magnified, swirling centre and outward ripples.
    float ang = 0.9 * exp(-r * 3.5) * (1.0 + 0.3 * sin(t * 0.4));
    mat2 rot = mat2(cos(ang), -sin(ang), sin(ang), cos(ang));
    vec2 lens = 0.5 + rot * d * (1.0 - 0.22 * exp(-r * r * 14.0));
    lens += d / r * 0.012 * sin(r * 38.0 - t * 3.0);
    lens += 0.02 * vec2(sin(lens.y * 9.0 + t * 1.1), cos(lens.x * 8.0 - t * 0.9));   // wavy

    // Back to front: the deepest layer first, nearer layers veil it where their mask is open.
    vec3 col = marble(lens - par * 0.34, t * 0.8, type, 2.0) * 0.72;
    for (int i = 1; i >= 0; i--) {
        float depth = 0.06 + 0.13 * float(i);
        vec2 u = lens - par * depth;
        vec3 m = marble(u, t * (1.0 - 0.1 * float(i)), type, float(i));
        float mask = smoothstep(0.42, 0.68, fbm(u * 2.4 + vec2(t * 0.03, -t * 0.02) + float(i) * 4.1));
        col = mix(col, m * (0.86 + 0.14 * float(1 - i)), mask * (0.55 + 0.25 * float(1 - i)));
    }
    // Hot core: the lens concentrates light toward the centre.
    col += pal(type, 0) * exp(-r * r * 22.0) * 0.35;
    col = min(col, vec3(1.0));
    vec4 c = vec4(col, 1.0) * ColorModulator;
    c.rgb = mix(pal(type, 4) * 0.6, c.rgb, clamp(fade, 0.0, 1.0));
    fragColor = apply_fog(c, sphericalVertexDistance, cylindricalVertexDistance,
        FogEnvironmentalStart, FogEnvironmentalEnd, FogRenderDistanceStart, FogRenderDistanceEnd, FogColor);
#endif
}
