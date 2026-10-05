#version 150

// MANDELA EFFECT // AURORA BOREALIS
// Curtains of polar light rip across the upper sky over a cold,
// star-punched night grade.

uniform sampler2D DiffuseSampler;
in vec2 texCoord;
out vec4 fragColor;

uniform float BttTime;
uniform float BttIntensity;
uniform vec2 BttRes;

float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9, 78.2))) * 43758.5453); }
float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x),
               mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}
float fbm(vec2 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 4; i++) { v += a * noise(p); p *= 2.11; a *= 0.5; }
    return v;
}

void main() {
    vec2 uv = texCoord;
    float t = BttTime * 4.0;

    vec3 scene = texture(DiffuseSampler, uv).rgb;
    // cold night grade
    float l = dot(scene, vec3(0.299, 0.587, 0.114));
    vec3 night = mix(vec3(0.02, 0.04, 0.09), vec3(0.10, 0.18, 0.30), l) + scene * 0.25;

    // aurora curtains in the top half
    float sky = smoothstep(0.45, 0.75, uv.y);
    float x = uv.x * 6.0;
    float curtain = 0.0;
    for (int i = 0; i < 3; i++) {
        float fi = float(i);
        float wave = fbm(vec2(x * (1.3 + fi * 0.4) + t * (0.25 + fi * 0.1), fi * 7.7 - t * 0.15));
        float band = uv.y - (0.62 + fi * 0.09) - wave * 0.22;
        float c = exp(-abs(band) * (9.0 - fi * 2.0));
        c *= 0.6 + 0.4 * noise(vec2(x * 8.0, t + fi * 3.0));   // vertical rays
        vec3 acol = mix(vec3(0.1, 1.0, 0.45), vec3(0.45, 0.2, 1.0),
                clamp(wave + band * 2.0 + fi * 0.3, 0.0, 1.0));
        curtain += c;
        night += acol * c * 0.9 * sky;
    }

    // stars
    float st = step(0.998, hash(floor(uv * BttRes / 2.5)));
    night += st * sky * (0.6 + 0.4 * sin(t * 6.0 + hash(floor(uv * 90.0)) * 6.28));

    vec3 col = mix(scene, night, BttIntensity * max(sky * 0.9 + 0.25, 0.4));
    fragColor = vec4(col, 1.0);
}
