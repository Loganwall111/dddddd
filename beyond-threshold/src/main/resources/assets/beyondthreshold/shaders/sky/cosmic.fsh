#version 150

// THE THRESHOLD SKY
// The truth the intro reveals: the overworld rests on the arm of a
// nameless colossus. Raymarched nebula, star field, its silhouette with
// two burning eyes, and a lensing black hole on a fixed sky anchor.

in vec3 vDir;
out vec4 fragColor;

uniform float BttTime;
uniform vec3 PalA;
uniform vec3 PalB;
uniform vec3 PalHorizon;
uniform vec3 PalGlow;
uniform float BttMode;
uniform float BttSeed;
uniform vec3 BttBHDir;
uniform float BttBHStrength;

float hash(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

float noise(vec3 x) {
    vec3 i = floor(x);
    vec3 f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(hash(i), hash(i + vec3(1.0, 0.0, 0.0)), f.x),
                   mix(hash(i + vec3(0.0, 1.0, 0.0)), hash(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
               mix(mix(hash(i + vec3(0.0, 0.0, 1.0)), hash(i + vec3(1.0, 0.0, 1.0)), f.x),
                   mix(hash(i + vec3(0.0, 1.0, 1.0)), hash(i + vec3(1.0, 1.0, 1.0)), f.x), f.y), f.z);
}

float fbm(vec3 p) {
    float a = 0.5;
    float s = 0.0;
    for (int i = 0; i < 5; i++) {
        s += a * noise(p);
        p = p * 2.03 + 11.1;
        a *= 0.55;
    }
    return s;
}

void main() {
    vec3 d = normalize(vDir);
    float t = BttTime;

    // deep-space base gradient
    vec3 col = mix(PalA * 0.22, PalB * 0.16, 0.5 + 0.5 * d.y);

    // swirling two-tone nebula
    vec3 np = d * 3.1 + vec3(t * 0.02, BttSeed * 6.28, 0.0);
    float n1 = fbm(np);
    float n2 = fbm(np * 1.9 + n1 * 1.4 + 7.3);
    col = mix(col, PalA * 1.7, smoothstep(0.35, 0.85, n2) * 0.55);
    col = mix(col, PalB * 1.9, smoothstep(0.5, 0.95, n1 * n2 + 0.25) * 0.4);

    // burning horizon
    float hz = pow(1.0 - abs(d.y), 6.0);
    col += PalHorizon * hz * (0.5 + 0.35 * n1);

    // star field with twinkle
    float st = hash(floor(d * 240.0));
    float star = smoothstep(0.998, 1.0, st) * (0.6 + 0.4 * sin(t * 3.0 + st * 40.0));
    col += vec3(star) * (0.7 + 0.6 * st);

    // the colossus: head + shoulders silhouette cradling the world
    vec3 hd = normalize(vec3(0.10, 0.30, -0.95));
    float aHead = 1.0 - dot(d, hd);
    float head = smoothstep(0.05, 0.02, aHead);
    vec3 sd = normalize(vec3(hd.x, hd.y - 0.30, hd.z));
    float shoulders = smoothstep(0.34, 0.12, 1.0 - dot(d, sd));
    float sil = max(head, shoulders * 0.92);
    col = mix(col, vec3(0.02, 0.01, 0.05), sil);
    // rim light breathing around the head
    float rim = smoothstep(0.075, 0.03, abs(aHead - 0.05)) * (1.0 - sil);
    col += PalGlow * rim * (0.45 + 0.2 * sin(t * 0.7));
    // two burning eyes
    vec3 e1 = normalize(hd + vec3(-0.032, 0.012, 0.02));
    vec3 e2 = normalize(hd + vec3(0.032, 0.012, 0.02));
    float eye = smoothstep(0.0016, 0.0004, 1.0 - dot(d, e1))
              + smoothstep(0.0016, 0.0004, 1.0 - dot(d, e2));
    float blink = 0.75 + 0.25 * sin(t * 0.9 + BttSeed * 9.0);
    col += PalGlow * eye * 2.4 * blink;

    // lensing black hole: void disk + photon ring + swirl
    vec3 bd = normalize(BttBHDir);
    float ba = 1.0 - dot(d, bd);
    float disk = smoothstep(0.02, 0.0, ba);
    float ring = smoothstep(0.014, 0.0, abs(ba - 0.035));
    float swirl = noise(vec3(atan(d.z, d.x) * 6.0, ba * 40.0, t * 0.6));
    col = mix(col, vec3(0.0), disk);
    col += (PalHorizon * 1.6 + PalGlow * swirl * 0.7) * ring * BttBHStrength;

    // dither away banding
    col += (hash(d * 512.0) - 0.5) * 0.015;

    fragColor = vec4(col, 1.0);
}
