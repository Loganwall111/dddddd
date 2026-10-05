#version 150

// MANDELA EFFECT // FLOATING BLOBS
// The world melts into glossy metaball membranes, each region a
// different dream palette.

uniform sampler2D DiffuseSampler;
in vec2 texCoord;
out vec4 fragColor;

uniform float BttTime;
uniform float BttIntensity;
uniform vec2 BttRes;
uniform float BttSeed;

float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9, 78.2) + BttSeed)) * 43758.5453); }
float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x),
               mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}
float fbm(vec2 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 5; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; }
    return v;
}

vec3 palette(float h) {
    return 0.5 + 0.5 * cos(6.28318 * (h + vec3(0.0, 0.33, 0.67)));
}

void main() {
    vec2 uv = texCoord;
    float t = BttTime * 6.0;

    float m = fbm(uv * 4.0 + vec2(t * 0.1, -t * 0.07));
    m += 0.35 * fbm(uv * 9.0 - t * 0.12);
    float blobs = smoothstep(0.48, 0.55, m);

    vec3 scene = texture(DiffuseSampler, uv + (m - 0.5) * 0.05 * BttIntensity).rgb;

    float region = floor(m * 7.0) / 7.0;
    vec3 blobCol = palette(region + BttSeed) * (0.55 + 0.45 * m);
    // glossy rim light
    float rim = smoothstep(0.42, 0.5, m) - smoothstep(0.5, 0.6, m);
    blobCol += rim * vec3(1.0) * 0.8;
    // fake specular highlight per blob
    blobCol += pow(max(0.0, 1.0 - abs(m - 0.62) * 6.0), 3.0) * 0.6;

    vec3 col = mix(scene, blobCol, blobs * BttIntensity);
    col = mix(col, col * col * 1.4 + 0.08, 0.25 * BttIntensity);

    fragColor = vec4(col, 1.0);
}
