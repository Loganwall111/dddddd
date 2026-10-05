#version 150

// A knife-cut in the membrane: jagged white-hot edges, chromatic
// fringe, and a swirling other-side glimpse seeded per dimension.

in vec2 vUv;
out vec4 fragColor;

uniform float BttTime;
uniform float BttSeed;
uniform float BttOpen;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x),
               mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}
float fbm(vec2 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 4; i++) { v += a * noise(p); p *= 2.17; a *= 0.5; }
    return v;
}

vec3 otherSide(vec2 uv, float t) {
    float a = atan(uv.y, uv.x) + t * 0.4;
    float r = length(uv);
    float sw = fbm(vec2(a * 2.0 + 3.0 / max(r, 0.2), r * 5.0 - t * 0.5) + BttSeed * 17.0);
    vec3 c = 0.5 + 0.5 * cos(6.28318 * (sw + BttSeed + vec3(0.0, 0.33, 0.67)));
    c *= 0.4 + 0.8 * sw;
    c += vec3(1.0) * pow(sw, 5.0);
    return c;
}

void main() {
    vec2 uv = vUv;
    float t = BttTime;
    if (BttOpen <= 0.01) discard;

    float jag = (fbm(vec2(uv.y * 7.0, BttSeed * 40.0)) - 0.5) * 0.5;
    float width = BttOpen * (0.16 + 0.45 * (1.0 - uv.y * uv.y));
    float edge = abs(uv.x) + jag * width;

    float inside = 1.0 - smoothstep(width * 0.85, width, edge);
    float rim = smoothstep(width + 0.10, width, edge) - inside;

    vec3 col = otherSide(vec2(uv.x / max(width, 0.05), uv.y), t);
    // chromatic fringe on the cut
    col.r += rim * 0.9;
    col.b += rim * 0.7;
    col += vec3(1.0, 0.98, 0.9) * rim * 1.6;

    float alpha = clamp(inside + rim * 1.4, 0.0, 1.0);
    if (alpha < 0.01) discard;
    fragColor = vec4(col, alpha);
}
