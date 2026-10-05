#version 150

// MANDELA EFFECT // ABSOLUTE REALISM
// Cinematic grade: filmic tonemap, micro-sharpen, bloom, sun warmth,
// film grain, lens vignette and gentle chromatic fringing.

uniform sampler2D DiffuseSampler;
in vec2 texCoord;
out vec4 fragColor;

uniform float BttTime;
uniform float BttIntensity;
uniform vec2 BttRes;

vec3 aces(vec3 x) {
    return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
}

float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }

void main() {
    vec2 uv = texCoord;
    vec2 cc = uv - 0.5;
    float r2 = dot(cc, cc);

    // gentle lens fringing
    float cr = texture(DiffuseSampler, uv + cc * r2 * 0.06).r;
    float cg = texture(DiffuseSampler, uv).g;
    float cb = texture(DiffuseSampler, uv - cc * r2 * 0.06).b;
    vec3 col = vec3(cr, cg, cb);

    // micro sharpen
    vec3 blur = vec3(0.0);
    blur += texture(DiffuseSampler, uv + vec2(1.5, 0.0) / BttRes).rgb;
    blur += texture(DiffuseSampler, uv - vec2(1.5, 0.0) / BttRes).rgb;
    blur += texture(DiffuseSampler, uv + vec2(0.0, 1.5) / BttRes).rgb;
    blur += texture(DiffuseSampler, uv - vec2(0.0, 1.5) / BttRes).rgb;
    blur *= 0.25;
    col += (col - blur) * 0.55;

    // bloom: cheap 8-tap bright pass
    vec3 b = vec3(0.0);
    for (int i = 0; i < 8; i++) {
        float a = float(i) * 0.7853981;
        vec2 off = vec2(cos(a), sin(a)) * (6.0 / BttRes);
        vec3 s = texture(DiffuseSampler, uv + off).rgb;
        b += max(s - 0.55, 0.0);
    }
    b /= 8.0;
    col += b * 0.6;

    // warm sun grade + saturation
    float l = luma(col);
    col = mix(vec3(l), col, 1.22);
    col *= vec3(1.06, 1.0, 0.94);
    col = aces(col * 1.12);

    // vignette + grain
    col *= 1.0 - r2 * 0.55;
    float grain = fract(sin(dot(uv * BttRes + BttTime * 60.0, vec2(12.9898, 78.233))) * 43758.5453);
    col += (grain - 0.5) * 0.035;

    fragColor = vec4(mix(texture(DiffuseSampler, uv).rgb, col, BttIntensity), 1.0);
}
