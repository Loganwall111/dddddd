/* DRAWBUFFERS:0 */
// Dungeons II Overworld composite (0.24). The Sift dimension is never touched by this pack.
// Matches Images 4, 23, 24, 25: cool periwinkle-indigo cliff shadows, warm golden-apricot sunlight,
// diagonal volumetric sun-shafts across cliffs & spruce forests, and 3D stepped voxel cumulus clouds.
#define SIFT_BLOOM 0.48 // [0.0 0.15 0.25 0.35 0.45 0.48 0.6 0.8]
#define SIFT_FOG 0.16 // [0.0 0.05 0.10 0.15 0.16 0.25]
#define SIFT_GRAIN 0.0 // [0.0 0.01 0.02]
#define SIFT_EXPOSURE 1.06 // [0.8 0.9 1.0 1.05 1.06 1.15 1.3]
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
float ign(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
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
    vec3 lightW = owDay > 0.5 ? sunW : -sunW;
    float lightStrength = mix(0.32, 1.0, owDay) * (1.0 - rainStrength * 0.85) * smoothstep(0.03, 0.15, lightW.y);
    if (SIFT_SHADOWS == 1 && depth1 < 0.999999) {
        vec4 nb = texture2D(colortex2, texcoord);
        if (nb.a > 0.5) {
            vec3 N = normalize(nb.xyz * 2.0 - 1.0);
            float skyLight = clamp((texture2D(colortex1, texcoord).y - 0.03) / 0.94, 0.0, 1.0);
            float ndl = dot(N, lightW);
            float vis = ndl > 0.0 ? sunVisibility(worldRel, N, noise) : 0.0;
            float direct = vis * smoothstep(0.0, 0.28, ndl);
            // Dungeons II signature lighting (Images 4, 23, 24, 25):
            // Saturated periwinkle-indigo shadows on vertical cliffs + warm golden-apricot sunlit faces.
            vec3 sunTint = mix(vec3(1.14, 1.04, 0.88), vec3(1.24, 0.94, 0.76), owDusk);
            vec3 nightTint = vec3(0.92, 0.98, 1.12);
            vec3 lit = mix(nightTint, sunTint, owDay);
            vec3 cliffShadow = mix(vec3(0.46, 0.56, 0.94), vec3(0.52, 0.62, 0.94), clamp(N.y * 0.5 + 0.5, 0.0, 1.0));
            vec3 shade = mix(cliffShadow, lit, direct);
            float amount = skyLight * skyLight * lightStrength * (SIFT_SHADOW_STRENGTH / 0.52);
            if (depth < depth1 - 0.000001) amount *= 0.5;
            color *= mix(vec3(1.0), shade, clamp(amount, 0.0, 1.0));
            float morning = step(mod(float(worldTime), 24000.0), 6000.0) + step(22000.0, mod(float(worldTime), 24000.0));
            vec3 duskTint = mix(vec3(1.30, 0.78, 0.55), vec3(1.18, 0.92, 0.86), morning);
            vec3 todTint = mix(vec3(0.60, 0.72, 1.08), mix(vec3(1.04, 1.00, 0.96), duskTint, owDusk), owDay);
            color *= mix(vec3(1.0), todTint, 0.45 * skyLight);
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
    // Diagonal volumetric god-rays across mid-ground cliffs & spruce forests (Images 23, 24, 25).
    if (SIFT_GODRAYS > 0.0 && depth > 0.32) {
        vec3 rayRel = depth1 >= 0.999999 ? normalize(worldRel) * shadowDistance : worldRel;
        float scatter = godRays(rayRel, noise);
        float cosT = dot(normalize(rayRel), lightW);
        float phase = 0.25 + 1.85 * pow(max(cosT, 0.0), 7.0) + 0.55 * pow(max(cosT, 0.0), 2.0);
        phase += owDusk * 2.2 * pow(max(cosT, 0.0), 4.0);
        vec3 rayCol = owDay > 0.5 ? mix(vec3(1.0, 0.88, 0.64), vec3(1.0, 0.46, 0.26), owDusk) : vec3(0.30, 0.40, 0.65) * 0.5;
        float eyeSky = mix(0.45, 1.0, float(eyeBrightnessSmooth.y) / 240.0);
        float rayLight = mix(0.3, 1.0, owDay) * (1.0 - rainStrength * 0.85) * smoothstep(-0.02, 0.06, lightW.y);
        color += rayCol * scatter * phase * SIFT_GODRAYS * rayLight * 0.34 * eyeSky * (1.0 + 3.5 * owDusk);
    }
#endif
    vec2 pixel = 1.0 / vec2(viewWidth, viewHeight);
#if SIFT_OVERWORLD == 1
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
    for (int i = 0; i < 12; i++) {
        float angle = float(i) * 2.399963;
        vec2 offset = vec2(cos(angle), sin(angle)) * (2.0 + float(i) * 1.2) * pixel;
        vec3 tap = sampleColor(texcoord + offset);
        bloom += tap * smoothstep(0.72, 1.0, max(tap.r, max(tap.g, tap.b)));
    }
    color += bloom * (SIFT_BLOOM / 12.0);
    float distanceToCamera = (2.0 * near * far) / (far + near - (depth * 2.0 - 1.0) * (far - near));
    float mist = (1.0 - exp(-distanceToCamera * 0.008)) * SIFT_FOG;
    mist *= smoothstep(0.65, 0.99, depth);
#if SIFT_OVERWORLD == 1
    // Cool periwinkle-blue distance haze by day (Images 23, 24), warm peach-gold at dusk.
    vec3 mistColor = mix(vec3(0.05, 0.08, 0.14), mix(vec3(0.64, 0.78, 0.98), vec3(0.96, 0.74, 0.56), owDusk * 0.6), owDay);
    if (depth >= 0.999999) mist = 0.0;
    mist *= 1.65;
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
