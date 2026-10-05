#version 150

// MANDELA EFFECT // PSYCHEDELIC
// Domain-warped flow, rotating hue, radial echo trails.

uniform sampler2D DiffuseSampler;
in vec2 texCoord;
out vec4 fragColor;

uniform float BttTime;
uniform float BttIntensity;
uniform vec2 BttRes;

vec3 hueShift(vec3 c, float a) {
    const vec3 k = vec3(0.57735);
    float ca = cos(a), sa = sin(a);
    return c * ca + cross(k, c) * sa + k * dot(k, c) * (1.0 - ca);
}

float hash(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }
float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x),
               mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}

void main() {
    vec2 uv = texCoord;
    float t = BttTime * 8.0;

    vec2 w = vec2(noise(uv * 5.0 + t * 0.15), noise(uv * 5.0 - t * 0.11 + 7.0)) - 0.5;
    vec2 p = uv + w * 0.06 * BttIntensity;

    vec3 col = texture(DiffuseSampler, p).rgb;
    col = hueShift(col, t * 0.25 + noise(uv * 3.0 - t * 0.05) * 2.0 * BttIntensity);

    // radial echo trails
    vec2 c = uv - 0.5;
    vec3 echo = vec3(0.0);
    for (int i = 1; i <= 4; i++) {
        float s = 1.0 + float(i) * 0.035;
        vec3 e = texture(DiffuseSampler, 0.5 + c * s).rgb;
        echo += hueShift(e, float(i) * 0.7 + t * 0.3) * (0.28 / float(i));
    }
    col += echo * BttIntensity;

    col = pow(col, vec3(0.9));
    col *= 1.05 + 0.08 * sin(t * 3.0 + uv.y * 40.0);

    fragColor = vec4(mix(texture(DiffuseSampler, uv).rgb, col, BttIntensity), 1.0);
}
