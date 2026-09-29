/* DRAWBUFFERS:0 */
// Dungeons II Overworld composite (0.11). The Sift dimension is never touched by this pack.
// Original composite. No dependency on a third-party shader's source.
#define SIFT_BLOOM 0.45 // [0.0 0.15 0.25 0.35 0.45 0.6 0.8]
#define SIFT_FOG 0.15 // [0.0 0.05 0.10 0.15 0.25]
#define SIFT_GRAIN 0.0 // [0.0 0.01 0.02]
#define SIFT_EXPOSURE 1.05 // [0.8 0.9 1.0 1.05 1.15 1.3]
uniform sampler2D colortex0;
uniform sampler2D depthtex0;
uniform float viewWidth;
uniform float viewHeight;
uniform float near;
uniform float far;
uniform float frameTimeCounter;
varying vec2 texcoord;
#if SIFT_OVERWORLD == 1
uniform mat4 gbufferProjectionInverse;
uniform mat4 gbufferModelViewInverse;
uniform int worldTime;
#endif
#if SIFT_OVERWORLD == 1
uniform mat4 gbufferProjection;
uniform vec3 sunPosition;
#endif
#if SIFT_OVERWORLD == 1
#define SIFT_DOF 0.6 // [0.0 0.3 0.6 1.0]
#include "/lib/overworld.glsl"
uniform sampler2D colortex1; // lightmap (block, sky) from gbuffers_lit
uniform sampler2D colortex2; // world normal (a = 1 world geometry, 0 hand)
uniform sampler2D depthtex1; // depth without translucents
uniform float rainStrength;
uniform ivec2 eyeBrightnessSmooth;
#include "/lib/shadows.glsl"
// Interleaved gradient noise: cheap per-pixel dither for PCF rotation and ray jitter.
float ign(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
// Soft highlight rolloff instead of a hard clip: snow and clouds keep their texture.
vec3 softClip(vec3 c) {
    vec3 k = 0.75 + 0.25 * (1.0 - exp(-(c - 0.75) / 0.25));
    return mix(c, k, step(0.75, c));
}
#endif
vec3 sampleColor(vec2 uv) { return texture2D(colortex0, clamp(uv, vec2(0.001), vec2(0.999))).rgb; }
float luminance(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
void main() {
    vec3 color = sampleColor(texcoord);
    float depth = texture2D(depthtex0, texcoord).r;
#if SIFT_OVERWORLD == 1
    float depth1 = texture2D(depthtex1, texcoord).r;
    vec4 vp1 = gbufferProjectionInverse * vec4(vec3(texcoord, depth1) * 2.0 - 1.0, 1.0);
    vp1 /= vp1.w;
    vec3 worldRel = mat3(gbufferModelViewInverse) * vp1.xyz + gbufferModelViewInverse[3].xyz;
    float noise = ign(gl_FragCoord.xy + mod(frameTimeCounter * 60.0, 64.0) * 5.588238);
    float owCycle = cos((mod(float(worldTime), 24000.0) - 6000.0) / 24000.0 * 6.2831853);
    float owDay = smoothstep(-0.3, 0.2, owCycle);
    float owDusk = pow(1.0 - abs(owCycle), 6.0);
    vec3 sunW = normalize(mat3(gbufferModelViewInverse) * sunPosition);
    vec3 lightW = owDay > 0.5 ? sunW : -sunW; // the moon casts (weaker) shadows at night
    float lightStrength = mix(0.3, 1.0, owDay) * (1.0 - rainStrength * 0.85) * smoothstep(0.03, 0.15, lightW.y);
    if (SIFT_SHADOWS == 1 && depth1 < 0.999999) {
        vec4 nb = texture2D(colortex2, texcoord);
        if (nb.a > 0.5) {
            vec3 N = normalize(nb.xyz * 2.0 - 1.0);
            float skyLight = clamp((texture2D(colortex1, texcoord).y - 0.03) / 0.94, 0.0, 1.0);
            float ndl = dot(N, lightW);
            float vis = ndl > 0.0 ? sunVisibility(worldRel, N, noise) : 0.0;
            float direct = vis * smoothstep(0.0, 0.3, ndl);
            // Cool blue shadows, warm sunlit faces (Dungeons II lighting).
            vec3 sunTint = mix(vec3(1.10, 1.03, 0.92), vec3(1.18, 0.96, 0.80), owDusk);
            vec3 nightTint = vec3(0.95, 1.0, 1.08);
            vec3 lit = mix(nightTint, sunTint, owDay);
            vec3 shade = mix(vec3(0.52, 0.60, 0.92), lit, direct);
            float amount = skyLight * skyLight * lightStrength * (SIFT_SHADOW_STRENGTH / 0.55);
            if (depth < depth1 - 0.000001) amount *= 0.5; // seen through water/glass
            color *= mix(vec3(1.0), shade, clamp(amount, 0.0, 1.0));
        }
    }
#endif
#if SIFT_OVERWORLD == 1
    if (depth >= 0.999999) {
        vec4 view=gbufferProjectionInverse*vec4(texcoord*2.0-1.0,1.0,1.0);
        vec3 dir=normalize(mat3(gbufferModelViewInverse)*(view.xyz/view.w));
        color=overworldClouds(color,dir,frameTimeCounter,float(worldTime));
    }
#endif
#if SIFT_OVERWORLD == 1
    if (SIFT_GODRAYS > 0.0 && depth > 0.56) {
        vec3 rayRel = depth1 >= 0.999999 ? normalize(worldRel) * shadowDistance : worldRel;
        float scatter = godRays(rayRel, noise);
        float cosT = dot(normalize(rayRel), lightW);
        float phase = 0.2 + 1.8 * pow(max(cosT, 0.0), 8.0) + 0.5 * pow(max(cosT, 0.0), 2.0);
        vec3 rayCol = owDay > 0.5 ? mix(vec3(1.0, 0.86, 0.62), vec3(1.0, 0.58, 0.32), owDusk) : vec3(0.30, 0.40, 0.65) * 0.5;
        float eyeSky = mix(0.45, 1.0, float(eyeBrightnessSmooth.y) / 240.0);
        color += rayCol * scatter * phase * SIFT_GODRAYS * lightStrength * 0.3 * eyeSky;
    }
#endif
    vec2 pixel = 1.0 / vec2(viewWidth, viewHeight);
#if SIFT_OVERWORLD == 1
    // Soft cinematic depth of field: far terrain gently melts (Dungeons II trailer look).
    if (SIFT_DOF > 0.0 && depth < 0.999999) {
        float lin = (2.0 * near * far) / (far + near - (depth * 2.0 - 1.0) * (far - near));
        float blur = smoothstep(70.0, 220.0, lin) * SIFT_DOF;
        if (blur > 0.01) {
            vec3 acc = color;
            for (int i = 0; i < 8; i++) {
                float a = float(i) * 0.7853982;
                acc += sampleColor(texcoord + vec2(cos(a), sin(a)) * pixel * 2.5 * blur);
            }
            color = mix(color, acc / 9.0, blur);
        }
    }
#endif
    vec3 bloom = vec3(0.0);
    // Bounded 12-tap glow: bright soul salt and fluid bleed gently into the fog.
    for (int i = 0; i < 12; i++) {
        float angle = float(i) * 2.399963;
        vec2 offset = vec2(cos(angle), sin(angle)) * (2.0 + float(i) * 1.2) * pixel;
        vec3 tap = sampleColor(texcoord + offset);
        bloom += tap * smoothstep(0.72, 1.0, max(tap.r, max(tap.g, tap.b)));
    }
    color += bloom * (SIFT_BLOOM / 12.0);
    float distanceToCamera = (2.0 * near * far) / (far + near - (depth * 2.0 - 1.0) * (far - near));
    float mist = (1.0 - exp(-distanceToCamera * 0.008)) * SIFT_FOG;
    // Avoid overlaying hand/UI pixels and keep sky grading modest.
    mist *= smoothstep(0.65, 0.99, depth);
#if SIFT_OVERWORLD == 1
    // Bright blue atmospheric haze by day (Dungeons II distance look), deep blue at night.
    vec3 mistColor = mix(vec3(0.05, 0.08, 0.13), mix(vec3(0.68, 0.80, 0.95), vec3(0.95, 0.72, 0.55), owDusk * 0.6), owDay);
    if (depth >= 0.999999) mist = 0.0;
    mist *= 1.6;
#else
    vec3 mistColor = vec3(0.055, 0.105, 0.145);
#endif
    color = mix(color, mistColor, mist);
#if SIFT_OVERWORLD == 1
    color = dungeonsGrade(max(color, 0.0)) * SIFT_EXPOSURE * 0.95;
    color = softClip(color);
#else
    float light = luminance(color);
    vec3 shadowTone = vec3(0.78, 0.94, 1.12);
    vec3 highlightTone = vec3(1.08, 1.02, 0.91);
    color *= mix(shadowTone, highlightTone, smoothstep(0.1, 0.85, light));
    color *= SIFT_EXPOSURE;
#endif
    vec2 centered = texcoord * 2.0 - 1.0;
    color *= 1.0 - 0.16 * pow(clamp(dot(centered, centered) * 0.5, 0.0, 1.0), 1.4);
    float grain = fract(sin(dot(gl_FragCoord.xy + frameTimeCounter, vec2(12.9898, 78.233))) * 43758.5453) - 0.5;
    color += grain * SIFT_GRAIN;
    gl_FragData[0] = vec4(clamp(color, 0.0, 1.0), 1.0);
}
