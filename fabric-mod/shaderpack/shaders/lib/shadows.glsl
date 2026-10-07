// Sun shadows + volumetric god rays for the Dungeons II overworld look.
// Deferred: composite rebuilds each pixel's world position from depth, then looks it up in the
// sun's shadow map. Normals and lightmap come from the gbuffers programs (colortex2 / colortex1).
#define SIFT_SHADOWS 1 // [0 1]
#define SIFT_SHADOW_STRENGTH 0.55 // [0.3 0.45 0.55 0.7 0.85]
#define SIFT_GODRAYS 0.9 // [0.0 0.2 0.35 0.45 0.6 0.9 1.2]
const int shadowMapResolution = 2048; // [1024 2048 3072 4096]
const float shadowDistance = 128.0; // [64.0 96.0 128.0 160.0 192.0]
const float sunPathRotation = -25.0;
const float shadowDistanceRenderMul = 1.0;

uniform sampler2D shadowtex0;
uniform mat4 shadowModelView;
uniform mat4 shadowProjection;

#include "/lib/distort.glsl"

// Player-relative world position -> shadow map uvz (0..1).
vec3 shadowCoord(vec3 worldRel) {
    vec4 sp = shadowProjection * (shadowModelView * vec4(worldRel, 1.0));
    sp.xyz = distortShadow(sp.xyz);
    return sp.xyz * 0.5 + 0.5;
}

// 0 = fully shadowed, 1 = fully lit. Soft 12-tap spiral PCF, rotated per pixel.
float sunVisibility(vec3 worldRel, vec3 normal, float noise) {
    float dist = length(worldRel);
    // Push along the normal (bigger far away, where shadow texels are coarse) to kill acne.
    // Stronger normal offset + distance-scaled bias: removes the moire "z-fighting" shadow acne on flat ground.
    vec3 sc = shadowCoord(worldRel + normal * (0.14 + dist * 0.009));
    float bias = 0.00035 + dist * 0.000004;
    if (sc.x <= 0.0 || sc.x >= 1.0 || sc.y <= 0.0 || sc.y >= 1.0 || sc.z >= 1.0) return 1.0;
    float radius = 1.4 / float(shadowMapResolution);
    float lit = 0.0;
    for (int i = 0; i < 12; i++) {
        // Golden-angle spiral kernel, rotated per pixel (no const arrays: GLSL 1.20 safe).
        float r = sqrt((float(i) + 0.5) / 12.0);
        float a = float(i) * 2.3999632 + noise * 6.2831853;
        float d = texture2D(shadowtex0, sc.xy + vec2(cos(a), sin(a)) * r * radius * 2.2).r;
        lit += step(sc.z - bias, d);
    }
    float fade = smoothstep(shadowDistance * 0.8, shadowDistance, dist);
    return mix(lit / 12.0, 1.0, fade);
}

// Raymarch the view ray through the shadow map: light scattering in the air = real god rays
// through trees, cliffs and cave mouths. Returns scattering amount (0..~1).
float godRays(vec3 worldRel, float noise) {
    float len = min(length(worldRel), shadowDistance * 0.85);
    vec3 dir = normalize(worldRel);
    const int STEPS = 12;
    float stepLen = len / float(STEPS);
    float lit = 0.0;
    for (int i = 0; i < STEPS; i++) {
        vec3 p = dir * (stepLen * (float(i) + noise));
        vec3 sc = shadowCoord(p);
        if (sc.x <= 0.0 || sc.x >= 1.0 || sc.y <= 0.0 || sc.y >= 1.0) { lit += 1.0; continue; }
        lit += step(sc.z - 0.0003, texture2D(shadowtex0, sc.xy).r);
    }
    // More air = more haze, saturating around 90 blocks.
    return (lit / float(STEPS)) * (1.0 - exp(-len / 90.0));
}
