#version 120
// 0.12 world_sift: the Sift sky, aurora, beams and rifts are drawn by the Enter the Sift mod and reach
// this pass untouched (gbuffers_basic / gbuffers_skybasic are pure vertex colour). This composite
// only adds an optional soft glow around the brightest pixels (aurora streaks, sun ray, rift rims).
// No warping, no distortion, no colour shift of the sky itself.
#define SIFT_SKY_GLOW 0.30 // [0.0 0.15 0.30 0.45 0.6]
uniform sampler2D colortex0;
uniform float viewWidth;
uniform float viewHeight;
varying vec2 texcoord;

vec3 bright(vec2 uv) {
    vec3 c = texture2D(colortex0, clamp(uv, vec2(0.001), vec2(0.999))).rgb;
    float l = max(c.r, max(c.g, c.b));
    return c * smoothstep(0.78, 1.0, l);
}

void main() {
    vec3 base = texture2D(colortex0, texcoord).rgb;
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
