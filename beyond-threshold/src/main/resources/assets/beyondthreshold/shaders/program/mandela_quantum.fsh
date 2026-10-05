#version 150

// MANDELA EFFECT // QUANTUM
// Probability shimmer: block-glitch RGB splits, luminance quantised
// into superposed bands, interference scanlines, collapse flashes.

uniform sampler2D DiffuseSampler;
in vec2 texCoord;
out vec4 fragColor;

uniform float BttTime;
uniform float BttIntensity;
uniform vec2 BttRes;

float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9, 78.2))) * 43758.5453); }

void main() {
    vec2 uv = texCoord;
    float t = BttTime * 12.0;

    // glitch blocks
    vec2 block = floor(uv * vec2(24.0, 18.0));
    float h = hash(block + floor(t * 2.0));
    float glitch = step(0.93, h);
    vec2 off = vec2((hash(block + 1.7) - 0.5) * 0.08 * glitch, 0.0);

    // probability shimmer displacement
    vec2 shim = (vec2(hash(floor(uv * 300.0) + t), hash(floor(uv * 300.0) - t)) - 0.5) * 0.003;

    vec2 p = uv + off + shim;
    float split = 0.0025 + glitch * 0.012;
    vec3 col;
    col.r = texture(DiffuseSampler, p + vec2(split, 0.0)).r;
    col.g = texture(DiffuseSampler, p).g;
    col.b = texture(DiffuseSampler, p - vec2(split, 0.0)).b;

    // quantise luminance into superposed states
    float l = dot(col, vec3(0.299, 0.587, 0.114));
    float q = floor(l * 7.0 + 0.5) / 7.0;
    float mixq = 0.5 + 0.2 * sin(t + l * 20.0);
    col = mix(col, col / max(l, 1e-3) * q, mixq * BttIntensity);

    // interference scanlines
    col *= 1.0 - 0.15 * (0.5 + 0.5 * sin(uv.y * BttRes.y * 2.0 + t * 30.0));

    // wave-function hue per block
    col = mix(col, col * (0.7 + 0.6 * sin(vec3(0.0, 2.1, 4.2) + h * 6.28)), 0.25 * BttIntensity);

    // collapse flash
    float flash = step(0.995, hash(vec2(floor(t * 0.7), 5.0)));
    col = mix(col, vec3(1.0) - col, flash * 0.8);

    fragColor = vec4(mix(texture(DiffuseSampler, uv).rgb, col, BttIntensity), 1.0);
}
