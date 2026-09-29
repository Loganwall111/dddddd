#version 330
#extension GL_ARB_separate_shader_objects : require

// 0.18 Enter the Sift: the whole rift is drawn by this one GLSL program, in four variants.
//
// (base)     Interior: a living marble "window" into another space. Three marble layers sit at
//            different virtual depths, with parallax from the real view direction. Domain-warped
//            wavy veins (cream / peach / pink / orange for warm rifts) and a large white hot centre.
// RIFT_WALL  The cream box walls, rims and floating cubes (opaque). The vertex colour is the real
//            colour; the shader adds a slow breathing pulse and a light sweep across the faces.
// RIFT_GLOW  The white rim glow and sparks (additive). Flickers, fades with distance fog.
// RIFT_LENS  REAL gravitational lensing. A quad behind the rift samples a copy of the rendered scene
//            (Sampler0) and remaps it with the point-mass lens equation beta = theta - thetaE^2/theta.
//            The screen position of the lens centre and the face-to-pixel scale come from the
//            screen-space Jacobian of the face coordinates, so this is correct at any distance and angle.

#include <minecraft:fog.glsl>
#include <minecraft:globals.glsl>
#include <minecraft:dynamictransforms.glsl>

#ifdef RIFT_LENS
uniform sampler2D Sampler0;
#endif

layout(location = 0) in vec4 riftData;
layout(location = 1) in vec3 viewPos;
layout(location = 2) in float sphericalVertexDistance;
layout(location = 3) in float cylindricalVertexDistance;

layout(location = 0) out vec4 fragColor;

// 5 colours per rift type: vein (lightest), base A, base B, accent, deep.
const vec3 PAL[30] = vec3[](
    // 0 overworld / warm trailer rift: cream, peach, soft pink, orange, rose
    vec3(1.00, 0.96, 0.89), vec3(1.00, 0.76, 0.60), vec3(1.00, 0.64, 0.72), vec3(1.00, 0.66, 0.38), vec3(0.93, 0.48, 0.55),
    // 1 nether
    vec3(1.00, 0.84, 0.66), vec3(1.00, 0.40, 0.26), vec3(0.80, 0.18, 0.26), vec3(1.00, 0.58, 0.28), vec3(0.42, 0.08, 0.14),
    // 2 end
    vec3(0.97, 0.93, 1.00), vec3(0.81, 0.68, 1.00), vec3(0.60, 0.48, 1.00), vec3(1.00, 0.66, 0.92), vec3(0.28, 0.18, 0.48),
    // 3 sift: pink + teal
    vec3(1.00, 0.96, 0.98), vec3(1.00, 0.77, 0.89), vec3(0.54, 0.90, 0.86), vec3(1.00, 0.64, 0.80), vec3(0.28, 0.58, 0.62),
    // 4 ancient-city portal: cyan
    vec3(0.94, 1.00, 1.00), vec3(0.58, 0.96, 1.00), vec3(0.28, 0.80, 0.92), vec3(0.74, 1.00, 0.96), vec3(0.12, 0.44, 0.56),
    // 5 the Overworld seen from the Sift: gold
    vec3(1.00, 0.98, 0.80), vec3(1.00, 0.86, 0.30), vec3(0.95, 0.74, 0.18), vec3(1.00, 0.93, 0.55), vec3(0.62, 0.44, 0.08)
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

vec3 pal(int type, int k) { return PAL[clamp(type, 0, 5) * 5 + k]; }

// Wavy flowing marble at one depth layer.
vec3 marble(vec2 uv, float t, int type, float layer) {
    vec2 p = uv * 3.2 + layer * 7.3;
    vec2 q = vec2(fbm(p + vec2(0.0, t * 0.05)), fbm(p + vec2(5.2, 1.3) - t * 0.04));
    vec2 r = vec2(fbm(p + 3.0 * q + vec2(1.7, 9.2) + t * 0.06), fbm(p + 3.0 * q + vec2(8.3, 2.8) - t * 0.05));
    float f = fbm(p + 3.0 * r);
    float bands = 0.5 + 0.5 * sin((p.x + p.y * 0.6) * 2.2 + f * 9.0 + t * 0.35);
    vec3 c = mix(pal(type, 1), pal(type, 2), smoothstep(0.25, 0.75, f));
    c = mix(c, pal(type, 3), smoothstep(0.6, 0.95, bands) * 0.6);
    c = mix(c, pal(type, 0), pow(1.0 - abs(bands * 2.0 - 1.0), 7.0) * 0.9);   // thin cream veins
    c = mix(c, pal(type, 4), smoothstep(0.6, 1.0, length(q)) * 0.25);
    return c;
}

// ---------------------------------------------------------------- 0.18.1 destination viewports
// Each view is sampled at a parallax-shifted coordinate per layer, so the window looks deep.

// Blocky Minecraft-style pixelation of a coordinate (the trailer views are chunky, not smooth).
vec2 px(vec2 p, float n) { return (floor(p * n) + 0.5) / n; }

// Overworld: radiant peach-to-pink sky canvas with soft blocky clouds drifting along the horizon.
vec3 viewOverworld(vec2 uv, vec2 par, float t) {
    float y = uv.y - par.y * 0.35;
    vec3 c = mix(vec3(1.00, 0.62, 0.36), vec3(1.00, 0.72, 0.62), smoothstep(0.1, 0.55, y));
    c = mix(c, vec3(1.00, 0.80, 0.82), smoothstep(0.55, 1.0, y));
    c += vec3(0.25, 0.18, 0.08) * exp(-pow((y - 0.42) * 5.0, 2.0));        // bright horizon band
    for (int i = 0; i < 3; i++) {
        float d = 0.2 + 0.25 * float(i);
        vec2 q = px(uv - par * d + vec2(t * (0.012 + 0.006 * float(i)), 0.0), 40.0);
        float band = exp(-pow((q.y - (0.30 + 0.16 * float(i))) * 4.0, 2.0));
        float cl = smoothstep(0.48, 0.72, fbm(q * vec2(4.0, 7.0) + float(i) * 3.7)) * band;
        c = mix(c, mix(vec3(1.0, 0.93, 0.84), vec3(1.0, 0.70, 0.66), float(i) * 0.4), cl * 0.85);
    }
    return c;
}

// Overworld from the Sift: golden light pouring through, clouds turned amber, a white-hot core.
vec3 viewGold(vec2 uv, vec2 par, float t) {
    vec3 c = viewOverworld(uv, par, t);
    float l = dot(c, vec3(0.3, 0.5, 0.2));
    return mix(vec3(0.95, 0.72, 0.16), vec3(1.0, 0.95, 0.62), smoothstep(0.55, 0.95, l));
}

// Nether: burning dark crimson with rising fiery smoke and flickering embers.
vec3 viewNether(vec2 uv, vec2 par, float t) {
    vec3 c = mix(vec3(0.55, 0.05, 0.04), vec3(0.22, 0.02, 0.04), smoothstep(0.0, 1.0, uv.y));
    for (int i = 0; i < 3; i++) {
        float d = 0.15 + 0.22 * float(i);
        vec2 q = uv - par * d;
        vec2 f = q * vec2(3.0, 2.2) + vec2(0.0, -t * (0.18 + 0.08 * float(i))) + float(i) * 5.1;
        f.x += 0.3 * sin(f.y * 2.0 + t * 0.7);
        float smoke = fbm(f + fbm(f * 1.7) * 1.5);
        vec3 fire = mix(vec3(0.85, 0.12, 0.05), vec3(1.0, 0.55, 0.12), smoothstep(0.55, 0.85, smoke));
        c = mix(c, fire, smoothstep(0.45, 0.8, smoke) * (0.7 - 0.15 * float(i)));
        c = mix(c, vec3(0.12, 0.02, 0.03), smoothstep(0.35, 0.15, smoke) * 0.4);
    }
    c += vec3(1.0, 0.4, 0.1) * smoothstep(0.35, 0.0, uv.y) * 0.35;           // lava glow from below
    vec2 e = px(uv - par * 0.5 + vec2(0.0, -t * 0.25), 36.0);
    float ember = step(0.985, hash21(floor(e * 36.0))) * (0.5 + 0.5 * sin(t * 9.0 + hash21(e) * 40.0));
    return c + vec3(1.0, 0.75, 0.3) * ember;
}

// End: deep cosmic dark-purple starlight sheet with a slow nebula.
vec3 viewEnd(vec2 uv, vec2 par, float t) {
    vec3 c = mix(vec3(0.05, 0.02, 0.10), vec3(0.14, 0.05, 0.24), uv.y);
    vec2 n = uv - par * 0.3;
    float neb = fbm(n * 2.6 + vec2(t * 0.02, -t * 0.015) + fbm(n * 4.0) * 1.2);
    c += mix(vec3(0.30, 0.10, 0.50), vec3(0.75, 0.30, 0.80), smoothstep(0.5, 0.8, neb)) * smoothstep(0.4, 0.8, neb) * 0.6;
    for (int i = 0; i < 3; i++) {
        float d = 0.15 + 0.3 * float(i);
        vec2 g = (uv - par * d) * (40.0 + 25.0 * float(i)) + float(i) * 17.0;
        vec2 cell = floor(g), f = fract(g) - 0.5;
        float h = hash21(cell);
        float star = step(0.92, h) * smoothstep(0.18, 0.0, length(f)) * (0.6 + 0.4 * sin(t * (2.0 + h * 5.0) + h * 30.0));
        c += mix(vec3(0.8, 0.7, 1.0), vec3(1.0), h) * star * (1.0 - 0.25 * float(i));
    }
    return c;
}

// Sift: pale mint-cyan sky with soft panels and rows of vertical pillars at several depths.
vec3 viewSift(vec2 uv, vec2 par, float t) {
    vec3 c = mix(vec3(0.62, 0.90, 0.86), vec3(0.86, 0.97, 0.95), smoothstep(0.2, 1.0, uv.y));
    vec2 sp = uv - par * 0.9 + vec2(t * 0.01, 0.0);
    float panel = smoothstep(0.55, 0.75, fbm(px(sp, 10.0) * 3.0));
    c = mix(c, vec3(0.98, 0.80, 0.90), panel * 0.35);
    for (int i = 2; i >= 0; i--) {                                         // far to near
        float d = 0.12 + 0.2 * float(i);
        vec2 q = uv - par * d;
        float x = q.x * (5.0 + 3.0 * float(i)) + float(i) * 3.3;
        float col = floor(x);
        float h = 0.25 + 0.55 * hash21(vec2(col, float(i)));
        float w = 0.25 + 0.3 * hash21(vec2(col, 7.0 + float(i)));
        float inCol = step(abs(fract(x) - 0.5), w) * step(q.y, h) * step(0.35, hash21(vec2(col, 3.0 + float(i))));
        vec3 pillar = mix(vec3(0.85, 0.42, 0.44), vec3(0.40, 0.72, 0.70), float(i) * 0.3);
        pillar = mix(pillar, c, 0.25 + 0.2 * float(i));                    // aerial haze
        pillar *= 0.9 + 0.1 * step(0.5, fract(q.y * 12.0));                // block courses
        c = mix(c, pillar, inCol);
    }
    return c;
}

// Ancient-city portal: the cyan marble mosaic.
vec3 viewPortal(vec2 uv, vec2 par, float t) { return marble(px(uv - par * 0.2, 48.0), t, 4, 0.0); }

vec3 destination(int type, vec2 uv, vec2 par, float t) {
    if (type == 0) return viewOverworld(uv, par, t);
    if (type == 1) return viewNether(uv, par, t);
    if (type == 2) return viewEnd(uv, par, t);
    if (type == 3) return viewSift(uv, par, t);
    if (type == 5) return viewGold(uv, par, t);
    return viewPortal(uv, par, t);
}

float fogFade() {
    return 1.0 - smoothstep(FogRenderDistanceStart, FogRenderDistanceEnd, sphericalVertexDistance);
}

void main() {
    float t = GameTime * 1200.0;            // seconds (GameTime is the day fraction)

#if defined(RIFT_WALL)
    // Real colour; a slow breath plus a soft light sweep running diagonally over the cluster.
    float sweep = pow(0.5 + 0.5 * sin(dot(viewPos, vec3(0.35, 0.6, 0.2)) * 0.9 - t * 1.6), 12.0);
    vec3 c = riftData.rgb * (0.95 + 0.05 * sin(t * 1.3)) + vec3(0.10, 0.08, 0.06) * sweep;
    vec4 col = vec4(min(c, vec3(1.0)), 1.0) * ColorModulator;
    fragColor = apply_fog(col, sphericalVertexDistance, cylindricalVertexDistance,
        FogEnvironmentalStart, FogEnvironmentalEnd, FogRenderDistanceStart, FogRenderDistanceEnd, FogColor);

#elif defined(RIFT_GLOW)
    float flicker = 0.86 + 0.14 * sin(t * 7.0 + sphericalVertexDistance * 3.0) * sin(t * 2.3);
    fragColor = vec4(riftData.rgb * flicker, riftData.a * fogFade()) * ColorModulator;

#elif defined(RIFT_LENS)
    // Face coordinates of this pixel: (0.5, 0.5) is the rift centre (the lens mass).
    vec2 uv = riftData.rg;
    float fade = riftData.a;
    vec2 d = uv - 0.5;
    float th = length(d);
    mat2 J = mat2(dFdx(uv), dFdy(uv));            // d(uv) / d(pixel)
    float det = determinant(J);
    if (abs(det) < 1e-12 || th > 0.5) discard;
    mat2 toPx = inverse(J);                        // pixels per face unit
    vec2 centrePx = gl_FragCoord.xy - toPx * d;    // where the lens centre sits on screen
    // Point-mass lens: an image at angle theta shows the source at beta = theta - thetaE^2 / theta.
    // The deflection tapers to zero at the quad edge, so the bent region blends into the scene.
    float thE = 0.25 * (1.0 + 0.035 * sin(t * 0.7));
    float taper = smoothstep(0.5, 0.26, th);
    float defl = thE * thE / max(th, 0.02) * taper;
    vec2 dir = d / max(th, 1e-4);
    // A faint gravitational-wave ripple rolling outward.
    defl += 0.004 * sin(th * 60.0 - t * 3.0) * taper;
    vec2 size = vec2(textureSize(Sampler0, 0));
    vec3 col;
    for (int k = 0; k < 3; k++) {
        float ab = 1.0 + (float(k) - 1.0) * 0.035;   // slight chromatic aberration
        vec2 srcPx = centrePx + toPx * (dir * (th - defl * ab));
        vec2 st = clamp(srcPx / size, vec2(0.001), vec2(0.999));
        col[k] = texture(Sampler0, st)[k];
    }
    float a = clamp(fade, 0.0, 1.0) * smoothstep(0.5, 0.44, th);
    fragColor = vec4(col, a);

#else
    vec2 uv = riftData.rg;
    int type = int(riftData.b * 8.0);
    float fade = riftData.a;
    vec2 d = uv - 0.5;
    float r = length(d) + 1e-4;
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

    // Inner lensing of the other side: magnified, slowly swirling centre, wavy flow.
    float ang = 0.5 * exp(-r * 3.5) * (1.0 + 0.3 * sin(t * 0.4));
    mat2 rot = mat2(cos(ang), -sin(ang), sin(ang), cos(ang));
    vec2 lens = 0.5 + rot * d * (1.0 - 0.18 * exp(-r * r * 14.0));
    lens += 0.012 * vec2(sin(lens.y * 9.0 + t * 1.1), cos(lens.x * 8.0 - t * 0.9));

    // 0.18.1 destination viewport (camera parallax per layer inside each view).
    vec3 col = destination(type, lens, par * 0.2, t);
    // Light pouring through from the other side: white-hot core for bright worlds, a soft glow otherwise.
    float coreK = (type == 1 || type == 2) ? 0.25 : (type == 5 ? 0.85 : 0.55);
    float core = exp(-r * r * 9.0) * (0.85 + 0.15 * sin(t * 1.7));
    col = mix(col, vec3(1.0, 0.98, 0.95), core * coreK);
    // Soft bokeh lights drifting up (the trailer's floating light blobs).
    for (int i = 0; i < 5; i++) {
        vec2 bp = vec2(hash21(vec2(float(i), 1.0)), fract(hash21(vec2(float(i), 2.0)) + t * 0.03 * (1.0 + float(i) * 0.2)));
        col += vec3(1.0, 0.95, 0.92) * smoothstep(0.09, 0.0, length(lens - par * 0.2 - bp)) * 0.18;
    }
    col = min(col, vec3(1.0));
    vec4 c = vec4(col, 1.0) * ColorModulator;
    c.rgb = mix(pal(type, 4) * 0.6, c.rgb, clamp(fade, 0.0, 1.0));
    fragColor = apply_fog(c, sphericalVertexDistance, cylindricalVertexDistance,
        FogEnvironmentalStart, FogEnvironmentalEnd, FogRenderDistanceStart, FogRenderDistanceEnd, FogColor);
#endif
}
