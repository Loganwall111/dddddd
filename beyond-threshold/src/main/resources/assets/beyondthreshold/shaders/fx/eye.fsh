#version 150

// The Watcher: a gigantic human eye. Wet sclera, veining, a cosmic
// iris that tracks you, a pupil that dilates as it takes you.

in vec2 vUv;
out vec4 fragColor;

uniform float BttTime;
uniform float BttStage;
uniform vec3 BttLook;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x),
               mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}
float fbm(vec2 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 4; i++) { v += a * noise(p); p *= 2.13; a *= 0.5; }
    return v;
}

void main() {
    vec2 uv = vUv;
    float m = length(uv * vec2(1.0, 1.55));
    float alpha = 1.0 - smoothstep(0.92, 1.0, m);
    if (alpha < 0.01) discard;
    float t = BttTime;

    // sclera
    vec3 col = vec3(0.93, 0.92, 0.90);
    // veining, denser at the corners
    float vein = pow(fbm(uv * 9.0 + vec2(t * 0.05, 0.0)), 2.2);
    col = mix(col, vec3(0.62, 0.10, 0.10), vein * smoothstep(0.25, 0.9, m) * 0.8);
    // wet shading under the lids
    col *= 1.0 - smoothstep(0.55, 1.0, m) * 0.45;

    // iris tracks the player
    vec2 ic = -BttLook.xy * 0.22;
    float ir = length(uv - ic);
    float irisM = 1.0 - smoothstep(0.335, 0.36, ir);

    float a2 = atan((uv - ic).y, (uv - ic).x);
    float fibres = 0.5 + 0.5 * sin(a2 * 42.0 + fbm(vec2(a2 * 3.0, ir * 8.0)) * 6.0);
    vec3 irisCol = mix(vec3(0.10, 0.45, 0.55), vec3(0.35, 0.12, 0.60),
            0.5 + 0.5 * sin(a2 * 2.0 + t * 0.4));
    irisCol *= 0.55 + 0.75 * fibres;
    irisCol += vec3(0.6, 0.9, 1.0) * pow(fibres, 6.0) * 0.7;
    // limbal ring
    irisCol = mix(irisCol, vec3(0.02), smoothstep(0.28, 0.35, ir));

    // pupil dilates with the stages
    float pr = 0.10 + 0.05 * BttStage + 0.02 * sin(t * 2.0);
    float pupil = 1.0 - smoothstep(pr, pr + 0.02, ir);
    vec3 eyeCol = mix(irisCol, vec3(0.0), pupil);
    // a galaxy inside the pupil while it grabs you
    eyeCol += vec3(0.4, 0.2, 0.9) * pupil * fbm((uv - ic) * 30.0 - t) * BttStage * 0.6;

    col = mix(col, eyeCol, irisM);

    // specular highlight
    float spec = exp(-pow(length(uv - vec2(-0.14, 0.20)) * 9.0, 2.0));
    col += spec * 1.2;

    // glow rim when hostile
    float rim = smoothstep(0.80, 1.0, m);
    col += vec3(0.55, 0.2, 1.0) * rim * (0.6 + BttStage);

    fragColor = vec4(col, alpha);
}
