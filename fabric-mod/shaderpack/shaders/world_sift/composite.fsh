#version 120
// world_sift composite.
// 0.12: the Sift sky, aurora, beams and rifts are drawn by the Enter the Sift mod and reach this pass
// untouched (gbuffers_basic / gbuffers_skybasic are pure vertex colour). The soft glow around the brightest
// pixels (aurora streaks, rays, rift rims) is kept. No warping or colour shift of the sky itself.
// 0.17: Sift lighting for terrain and mobs. There is no sun disc, but the Sift clock still has a light angle,
// so the terrain gets soft cast shadows from the shadow map. The light and shadow colours follow the
// current sky colour: cyan day, mint noon, magenta evening, amber night. Shadows are cool teal-violet, lit
// faces take on the sky hue, and up-facing surfaces get a little sky-coloured bounce light.
#define SIFT_SKY_GLOW 0.30 // [0.0 0.15 0.30 0.45 0.6]
#define SIFT_SIFT_LIGHT 1 // [0 1]
uniform sampler2D colortex0;
uniform sampler2D colortex1; // lightmap (block, sky) from gbuffers_siftlit
uniform sampler2D colortex2; // world normal (a = 1 world geometry, 0 hand)
uniform sampler2D depthtex0;
uniform sampler2D depthtex1;
uniform mat4 gbufferProjectionInverse;
uniform mat4 gbufferModelViewInverse;
uniform vec3 shadowLightPosition;
uniform vec3 skyColor;
uniform float frameTimeCounter;
uniform float viewWidth;
uniform float viewHeight;
varying vec2 texcoord;
#include "/lib/shadows.glsl"

vec3 bright(vec2 uv) {
    vec3 c = texture2D(colortex0, clamp(uv, vec2(0.001), vec2(0.999))).rgb;
    float l = max(c.r, max(c.g, c.b));
    return c * smoothstep(0.78, 1.0, l);
}

float siftNoise(vec2 p) {
    return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715))));
}

vec3 siftLight(vec3 base) {
    float depth = texture2D(depthtex0, texcoord).r;
    float depth1 = texture2D(depthtex1, texcoord).r;
    if (depth1 >= 0.999999) return base;                    // sky: untouched
    vec4 nb = texture2D(colortex2, texcoord);
    if (nb.a < 0.5) return base;                            // hand, particles over sky
    vec4 vp = gbufferProjectionInverse * vec4(vec3(texcoord, depth1) * 2.0 - 1.0, 1.0);
    vp /= vp.w;
    vec3 worldRel = mat3(gbufferModelViewInverse) * vp.xyz + gbufferModelViewInverse[3].xyz;
    vec3 N = normalize(nb.xyz * 2.0 - 1.0);
    vec3 L = normalize(mat3(gbufferModelViewInverse) * shadowLightPosition);
    float skyLight = clamp((texture2D(colortex1, texcoord).y - 0.03) / 0.94, 0.0, 1.0);
    float strength = smoothstep(0.03, 0.2, L.y);
    float ndl = dot(N, L);
    float vis = 1.0;
    if (SIFT_SHADOWS == 1) vis = ndl > 0.0 ? sunVisibility(worldRel, N, siftNoise(gl_FragCoord.xy)) : 0.0;
    float direct = vis * smoothstep(0.0, 0.3, ndl);
    // Sky hue, normalised so a dark night sky still tints rather than darkens.
    vec3 hue = skyColor / max(max(skyColor.r, max(skyColor.g, skyColor.b)), 0.05);
    vec3 lit = mix(vec3(1.06, 1.03, 0.98), hue * 1.08, 0.30);
    vec3 shadow = mix(vec3(0.50, 0.66, 0.84), vec3(0.64, 0.52, 0.86), 0.5 + 0.5 * sin(frameTimeCounter * 0.05)) * mix(vec3(1.0), hue, 0.15);
    vec3 shade = mix(shadow, lit, direct);
    float amount = skyLight * skyLight * strength * (SIFT_SHADOW_STRENGTH / 0.55);
    if (depth < depth1 - 0.000001) amount *= 0.5;           // seen through ichor or glass
    vec3 c = base * mix(vec3(1.0), shade, clamp(amount, 0.0, 1.0));
    // Colour blending: surfaces facing the sky pick up a little of its colour.
    c += base * (hue - 0.6) * 0.12 * max(N.y, 0.0) * skyLight;
    return max(c, 0.0);
}

void main() {
    vec3 base = texture2D(colortex0, texcoord).rgb;
    if (SIFT_SIFT_LIGHT == 1) base = siftLight(base);
    if (SIFT_SKY_GLOW > 0.0) {
    vec2 px = vec2(1.0 / viewWidth, 1.0 / viewHeight);
    vec3 glow = vec3(0.0);
    float total = 0.0;
    // 16 taps on two rings: cheap, stable and wide enough to read as bloom.
    for (int i = 0; i < 8; i++) {
        float a = float(i) * 0.785398;
        vec2 d = vec2(cos(a), sin(a));
        glow += bright(texcoord + d * px * 6.0) * 1.0;
        glow += bright(texcoord + d * px * 14.0) * 0.6;
        total += 1.6;
    }
    glow /= total;
    base += glow * SIFT_SKY_GLOW;
    }
    gl_FragData[0] = vec4(base, 1.0);
}
