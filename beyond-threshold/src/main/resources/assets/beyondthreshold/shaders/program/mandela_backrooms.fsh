#version 150

// MANDELA EFFECT // BACKROOMS
// Mono-yellow dampness, fluorescent hum, soft blur, carpet static,
// and something almost visible at the edge of the frame.

uniform sampler2D DiffuseSampler;
in vec2 texCoord;
out vec4 fragColor;

uniform float BttTime;
uniform float BttIntensity;
uniform vec2 BttRes;

float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9, 78.2))) * 43758.5453); }

void main() {
    vec2 uv = texCoord;
    float t = BttTime * 10.0;

    // damp soft blur
    vec3 col = vec3(0.0);
    col += texture(DiffuseSampler, uv).rgb * 0.4;
    col += texture(DiffuseSampler, uv + vec2(1.0, 0.0) / BttRes * 2.0).rgb * 0.15;
    col += texture(DiffuseSampler, uv - vec2(1.0, 0.0) / BttRes * 2.0).rgb * 0.15;
    col += texture(DiffuseSampler, uv + vec2(0.0, 1.0) / BttRes * 2.0).rgb * 0.15;
    col += texture(DiffuseSampler, uv - vec2(0.0, 1.0) / BttRes * 2.0).rgb * 0.15;

    float l = dot(col, vec3(0.299, 0.587, 0.114));
    // yellow wallpaper grade
    vec3 yellow = vec3(0.85, 0.72, 0.32);
    col = mix(col, yellow * (0.25 + l * 1.1), 0.85);

    // fluorescent flicker
    float flick = 0.92 + 0.08 * hash(vec2(floor(t * 8.0), 3.0));
    flick *= 1.0 + 0.04 * sin(t * 40.0);
    col *= flick;

    // carpet static
    float staticN = hash(uv * BttRes + t);
    col += (staticN - 0.5) * 0.09;

    // ceiling light banding
    col *= 1.0 + 0.06 * smoothstep(0.6, 0.9, uv.y);

    // a silhouette that is never quite there
    float s = smoothstep(0.06, 0.0, length((uv - vec2(0.82 + 0.02 * sin(t * 0.1), 0.42)) * vec2(2.2, 1.0)));
    float appear = step(0.985, hash(vec2(floor(t * 0.25), 9.0)));
    col = mix(col, vec3(0.05, 0.04, 0.02), s * 0.7 * appear);

    // vignette of unease
    vec2 c = uv - 0.5;
    col *= 1.0 - dot(c, c) * 0.9;

    fragColor = vec4(mix(texture(DiffuseSampler, uv).rgb, col, BttIntensity), 1.0);
}
