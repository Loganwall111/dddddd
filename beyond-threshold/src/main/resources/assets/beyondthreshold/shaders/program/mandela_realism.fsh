#version 150

// MANDELA EFFECT // ABSOLUTE REALISM
// A deliberately *visible* cinematic grade: rich contrast, saturated
// life, warm highlights / cool shadows split-toning, bloom, sharpen,
// film grain, vignette and lens fringing. It must look AAA at a glance.

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

    // lens fringing at the edges
    float cr = texture(DiffuseSampler, uv + cc * r2 * 0.08).r;
    float cg = texture(DiffuseSampler, uv).g;
    float cb = texture(DiffuseSampler, uv - cc * r2 * 0.08).b;
    vec3 col = vec3(cr, cg, cb);

    // crisp micro-sharpen
    vec3 blur = vec3(0.0);
    blur += texture(DiffuseSampler, uv + vec2(1.25, 0.0) / BttRes).rgb;
    blur += texture(DiffuseSampler, uv - vec2(1.25, 0.0) / BttRes).rgb;
    blur += texture(DiffuseSampler, uv + vec2(0.0, 1.25) / BttRes).rgb;
    blur += texture(DiffuseSampler, uv - vec2(0.0, 1.25) / BttRes).rgb;
    blur *= 0.25;
    col += (col - blur) * 0.7;

    // bloom: 12-tap bright pass, wide soft radius
    vec3 b = vec3(0.0);
    for (int i = 0; i < 12; i++) {
        float a = float(i) * 0.5235988;
        vec2 off = vec2(cos(a), sin(a)) * (9.0 / BttRes);
        b += max(texture(DiffuseSampler, uv + off).rgb - 0.5, 0.0);
    }
    b /= 12.0;
    col += b * 0.75;

    // vivid saturation + punchy contrast
    float l = luma(col);
    col = mix(vec3(l), col, 1.42);
    col = (col - 0.5) * 1.18 + 0.5;

    // split toning: golden sun on highlights, teal air in shadows
    float lw = clamp(luma(col), 0.0, 1.0);
    col = mix(col, col * vec3(0.86, 1.05, 1.10), (1.0 - lw) * 0.55);
    col = mix(col, col * vec3(1.10, 1.02, 0.88), lw * 0.60);

    col = aces(col * 1.18);

    // cinematic vignette + fine grain
    col *= 1.0 - r2 * 0.85;
    float grain = fract(sin(dot(uv * BttRes + BttTime * 60.0, vec2(12.9898, 78.233))) * 43758.5453);
    col += (grain - 0.5) * 0.03;

    fragColor = vec4(mix(texture(DiffuseSampler, uv).rgb, col, BttIntensity), 1.0);
}
