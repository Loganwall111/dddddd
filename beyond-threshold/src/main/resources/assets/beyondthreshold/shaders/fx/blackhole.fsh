#version 150

// The singularity billboard: photon ring, swirling accretion disk,
// doppler beaming and a true black core.

in vec2 vUv;
out vec4 fragColor;

uniform float BttTime;
uniform float BttCollapse;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x),
               mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}

void main() {
    float r = length(vUv);
    if (r > 1.0) discard;
    float t = BttTime;

    float core = 1.0 - smoothstep(0.26, 0.32, r);

    // accretion disk: swirling noise bands, flattened vertically
    vec2 duv = vUv * vec2(1.0, 2.6);
    float ang = atan(duv.y, duv.x);
    float swirl = noise(vec2(ang * 3.0 + t * 2.0 + 4.0 / max(r, 0.15), r * 9.0 - t * 0.6));
    float disk = smoothstep(0.30, 0.42, r) * (1.0 - smoothstep(0.62, 0.98, r));
    disk *= 0.55 + 0.9 * swirl;

    // doppler: approaching side blue-white, receding side ember
    float dop = 0.5 + 0.5 * sin(ang + t * 0.3);
    vec3 diskCol = mix(vec3(1.0, 0.42, 0.10), vec3(0.72, 0.85, 1.0), dop);
    diskCol = mix(diskCol, vec3(1.0, 0.93, 0.78), pow(swirl, 3.0));

    // photon ring
    float ring = exp(-abs(r - 0.34) * 26.0);
    // outer gravitational glow halo
    float halo = 0.30 / (1.0 + pow(r * 3.2, 4.0));

    vec3 col = diskCol * disk * 1.5 + vec3(1.0, 0.9, 0.7) * ring * 1.8 + vec3(1.0, 0.5, 0.2) * halo;

    float alpha = clamp(disk + ring + halo * 1.6, 0.0, 1.0);

    // collapse: expanding white detonation ring
    if (BttCollapse > 0.5) {
        float cr = fract(t * 1.7);
        float cRing = exp(-abs(r - cr) * 18.0);
        col += vec3(1.0) * cRing * 3.0;
        alpha = max(alpha, cRing);
        col += vec3(1.0, 0.8, 0.5) * 0.6;
    }

    col = mix(col, vec3(0.0), core);
    alpha = max(alpha, core);

    fragColor = vec4(col, alpha);
}
