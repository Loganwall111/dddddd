#version 150

// BEYOND THE THRESHOLD — the eye's grip.
// Reality quantises into growing pixels, columns rain green code,
// the world dissolves into the matrix and reassembles on the other side.

uniform sampler2D DiffuseSampler;
in vec2 texCoord;
out vec4 fragColor;

uniform float BttTime;
uniform float BttIntensity;
uniform vec2 BttRes;

float hash(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
}

float glyph(vec2 p, float seed) {
    vec2 cell = floor(p);
    vec2 f = fract(p);
    float h = hash(cell + seed);
    if (h < 0.45) return 0.0;
    float bar = step(0.25, f.x) * step(f.x, 0.75);
    float rows = step(0.7, hash(cell + floor(f.y * 4.0) + seed));
    return bar * rows;
}

void main() {
    vec2 uv = texCoord;
    float t = BttTime * 60.0;
    float k = clamp(BttIntensity, 0.0, 1.0);

    // per-column code rain
    float colId = floor(uv.x * 90.0);
    float speed = 0.5 + hash(vec2(colId, 7.0)) * 1.5;
    float rainY = uv.y * 24.0 - t * speed;
    float g = glyph(vec2(colId, rainY), colId) * step(hash(vec2(colId, floor(rainY))), 0.85);
    float trail = fract(rainY) * 0.5 + 0.5;

    // growing pixelation
    float px = mix(512.0, 14.0, k * k);
    vec2 puv = floor(uv * px) / px + 0.5 / px;
    // columns slip downwards as the grip tightens
    puv.y -= k * k * 0.25 * hash(vec2(floor(uv.x * px), 3.0));
    vec3 scene = texture(DiffuseSampler, clamp(puv, 0.0, 1.0)).rgb;

    // green code overlay
    vec3 code = vec3(0.15, 1.0, 0.45) * g * trail;

    vec3 col = scene;
    col = mix(col, scene * vec3(0.3, 1.0, 0.5) * 0.6 + code, k * 0.75);
    col += code * k * 0.6;

    // scanlines + flicker
    col *= 1.0 - 0.12 * k * (0.5 + 0.5 * sin(uv.y * BttRes.y * 1.5 + t * 8.0));

    // dissolve to black at full grip
    float edge = hash(floor(uv * px));
    col = mix(col, vec3(0.0), smoothstep(0.75, 1.0, k * (0.6 + 0.4 * edge)));

    fragColor = vec4(col, 1.0);
}
