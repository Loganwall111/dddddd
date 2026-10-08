#version 120

#include "/lib/util.glsl"

uniform sampler2D colortex0;
uniform sampler2D colortex1;
uniform sampler2D colortex2;
uniform sampler2D depthtex0;
uniform mat4 gbufferProjectionInverse;
uniform vec3 cameraPosition;
uniform vec3 sunPosition;
uniform float viewWidth;
uniform float viewHeight;
uniform float frameTimeCounter;
uniform float rainStrength;
uniform float far;
uniform int isEyeInWater;

varying vec2 texcoord;

/* DRAWBUFFERS:0 */

// The deferred lighting stage: godrays, bloom collection and the mod's own reality distortion,
// applied to the whole frame at once.

vec3 sunDirection() {
    return normalize(sunPosition);
}

// Volumetric godrays by radial march toward the sun's screen position: this is what makes the black
// sun readable as a *mass* rather than as a black circle, because the light bends around it.
vec3 godrays(vec2 uv, vec2 sunUv, float strength) {
    vec3 total = vec3(0.0);
    float weight = 1.0;
    vec2 step = (sunUv - uv) / 24.0;
    vec2 samplePos = uv;
    for (int i = 0; i < 24; i++) {
        samplePos += step;
        float occluded = step(0.9999, texture2D(depthtex0, samplePos).r);
        total += texture2D(colortex0, samplePos).rgb * weight * occluded;
        weight *= 0.94;
    }
    return total / 24.0 * strength;
}

void main() {
    vec3 colour = texture2D(colortex0, texcoord).rgb;
    vec2 light = texture2D(colortex1, texcoord).xy;
    vec3 normal = texture2D(colortex2, texcoord).rgb * 2.0 - 1.0;

    vec4 viewPos = gbufferProjectionInverse * vec4(texcoord * 2.0 - 1.0, texture2D(depthtex0, texcoord).r * 2.0 - 1.0, 1.0);
    viewPos /= viewPos.w;
    vec3 worldPos = viewPos.xyz + cameraPosition;

    vec3 sunDir = sunDirection();
    float sunVisible = smoothstep(-0.08, 0.12, sunDir.y) * (1.0 - rainStrength * 0.85);

    // Sun screen position, for the ray march.
    vec3 sunView = (gbufferModelView * vec4(sunDir * 100.0, 0.0)).xyz;
    vec2 sunUv = (sunView.xy / max(0.001, -sunView.z)) * vec2(1.0, viewWidth / viewHeight) * 0.5 + 0.5;

    vec3 rays = godrays(texcoord, sunUv, GODRAY_STRENGTH * sunVisible);
    colour += rays * vec3(1.0, 0.92, 0.78);

    // Ambient occlusion from the normal buffer: cheap, and it is what makes the Backrooms' corners
    // feel like corners rather than like flat wallpaper.
    float occlusion = 0.0;
    for (int x = -1; x <= 1; x++) {
        for (int y = -1; y <= 1; y++) {
            vec2 offset = vec2(float(x), float(y)) / vec2(viewWidth, viewHeight);
            vec3 neighbour = texture2D(colortex2, texcoord + offset).rgb * 2.0 - 1.0;
            occlusion += max(0.0, dot(normalize(neighbour), normal));
        }
    }
    occlusion = occlusion / 9.0;
    colour *= mix(0.82, 1.0, occlusion);

    // Reality distortion: the pack's copy of the mod's screen-space pass. Bands that tear
    // horizontally, a violet bias, and a lensing pull toward the centre of the frame.
    float bandRow = floor(texcoord.y * 48.0 + frameTimeCounter * 2.0);
    float tear = step(0.97 - 0.12 * REALITY_DISTORTION,
                      hash12x(vec2(bandRow, floor(frameTimeCounter * 5.0))));
    if (tear > 0.5) {
        float offset = (hash12x(vec2(bandRow, 3.0)) - 0.5) * 0.012;
        colour = mix(colour, texture2D(colortex0, texcoord + vec2(offset, 0.0)).rgb, 0.6);
    }

    vec2 lensed = lensOffset(texcoord, vec2(0.5), 0.052 * REALITY_DISTORTION, 0.75);
    colour = mix(colour, texture2D(colortex0, texcoord + lensed).rgb, 0.35 * REALITY_DISTORTION);

    float violet = smoothstep(0.35, 1.0, length(texcoord - 0.5));
    colour = mix(colour, colour * vec3(0.85, 0.72, 1.05), violet * 0.35);

    gl_FragData[0] = vec4(colour, 1.0);
}
