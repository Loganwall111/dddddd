/* DRAWBUFFERS:0 */
// Original Sift cinematic composite. No dependency on a third-party shader's source.
#define SIFT_BLOOM 0.35 // [0.0 0.15 0.25 0.35 0.5 0.7]
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
#if SIFT_DIMENSION == 1
uniform mat4 gbufferProjectionInverse;
uniform mat4 gbufferModelViewInverse;
uniform int worldTime;
#include "/lib/sift_sky.glsl"
#endif
vec3 sampleColor(vec2 uv) { return texture2D(colortex0, clamp(uv, vec2(0.001), vec2(0.999))).rgb; }
float luminance(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
void main() {
    vec3 color = sampleColor(texcoord);
    float depth = texture2D(depthtex0, texcoord).r;
#if SIFT_DIMENSION == 1
    // Only uncovered sky. Never draw ribbons over terrain, entities or the player's hand.
    if (depth >= 0.999999) {
        vec4 view = gbufferProjectionInverse * vec4(texcoord * 2.0 - 1.0, 1.0, 1.0);
        vec3 direction = normalize(mat3(gbufferModelViewInverse) * (view.xyz / view.w));
        color = siftSky(direction, float(worldTime), frameTimeCounter);
    }
#endif
    vec2 pixel = 1.0 / vec2(viewWidth, viewHeight);
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
#if SIFT_DIMENSION == 1
    if (depth >= 0.999999) mist = 0.0;
#endif
    color = mix(color, vec3(0.055, 0.105, 0.145), mist);
    float light = luminance(color);
    vec3 shadowTone = vec3(0.78, 0.94, 1.12);
    vec3 highlightTone = vec3(1.08, 1.02, 0.91);
    color *= mix(shadowTone, highlightTone, smoothstep(0.1, 0.85, light));
    color *= SIFT_EXPOSURE;
    vec2 centered = texcoord * 2.0 - 1.0;
    color *= 1.0 - 0.16 * pow(clamp(dot(centered, centered) * 0.5, 0.0, 1.0), 1.4);
    float grain = fract(sin(dot(gl_FragCoord.xy + frameTimeCounter, vec2(12.9898, 78.233))) * 43758.5453) - 0.5;
    color += grain * SIFT_GRAIN;
    gl_FragData[0] = vec4(clamp(color, 0.0, 1.0), 1.0);
}
