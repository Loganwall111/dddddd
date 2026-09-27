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
#if SIFT_DIMENSION == 1 || SIFT_OVERWORLD == 1
uniform mat4 gbufferProjectionInverse;
uniform mat4 gbufferModelViewInverse;
uniform int worldTime;
#endif
#if SIFT_DIMENSION == 1
#include "/lib/sift_sky.glsl"
#ifndef SIFT_SHAFTS
#define SIFT_SHAFTS 0.25 // [0.0 0.15 0.25 0.4]
#endif
#endif
#if SIFT_DIMENSION == 1 || SIFT_OVERWORLD == 1
uniform mat4 gbufferProjection;
uniform vec3 sunPosition;
#endif
#if SIFT_OVERWORLD == 1
#include "/lib/overworld.glsl"
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
#if SIFT_OVERWORLD == 1
    if (depth >= 0.999999) {
        vec4 view=gbufferProjectionInverse*vec4(texcoord*2.0-1.0,1.0,1.0);
        vec3 dir=normalize(mat3(gbufferModelViewInverse)*(view.xyz/view.w));
        color=overworldClouds(color,dir,frameTimeCounter,float(worldTime));
    }
#endif
#if SIFT_DIMENSION == 1 || SIFT_OVERWORLD == 1
    vec4 sunClip=gbufferProjection*vec4(sunPosition,1.0);
    if (sunClip.w>0.0) {
        vec2 sunUV=sunClip.xy/sunClip.w*.5+.5;
        float shafts=0.0;
        for(int j=1;j<=12;j++) {
            vec2 sampleUV=mix(texcoord,sunUV,float(j)/24.0);
            if(sampleUV.x>0.0 && sampleUV.x<1.0 && sampleUV.y>0.0 && sampleUV.y<1.0)
                shafts+=step(.999999,texture2D(depthtex0,sampleUV).r)/12.0;
        }
#if SIFT_DIMENSION == 1
        vec3 shaftTint=vec3(1.0,.72,.62);
#else
        vec3 shaftTint=vec3(1.0,.83,.61);
#endif
        color+=shaftTint*shafts*SIFT_SHAFTS*exp(-length(texcoord-sunUV)*3.0)*smoothstep(.7,1.0,depth);
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
#if SIFT_DIMENSION == 1
    // Distant terrain dissolves into the luminous sky haze (peach by day, pale teal at night).
    float siftDay = smoothstep(-0.25, 0.45, cos((mod(float(worldTime), 24000.0) - 6000.0) / 24000.0 * 6.2831853));
    vec3 mistColor = mix(vec3(0.62, 0.86, 0.84), vec3(0.96, 0.76, 0.66), siftDay);
    mist *= 2.2;
#else
    vec3 mistColor = vec3(0.055, 0.105, 0.145);
#endif
    color = mix(color, mistColor, mist);
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
