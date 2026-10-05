#version 150

// BEYOND THE THRESHOLD — the true sky.
// mode 0 (overworld): the nameless colossus. Its head and shoulders loom
// over the horizon, its arms are the horizon, and you are standing on its
// skin. A lensing black hole hangs above.
// mode 1+: procedural dimension skies: membrane grids, floating voxel
// isles, aurora veils, all seeded.

in vec3 vDir;
out vec4 fragColor;

uniform float BttTime;
uniform float BttMode;
uniform float BttSeed;
uniform vec3 PalA;
uniform vec3 PalB;
uniform vec3 PalHorizon;
uniform vec3 PalGlow;
uniform vec3 BttBHDir;
uniform float BttBHStrength;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float hash1(float n) { return fract(sin(n * 12.9898) * 43758.5453); }
float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x),
               mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}
float fbm(vec2 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 5; i++) { v += a * noise(p); p *= 2.07; a *= 0.5; }
    return v;
}

mat2 rot2(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }

void main() {
    vec3 d = normalize(vDir);
    float t = BttTime;

    // ---------- deep space base ----------
    vec2 suv = vec2(atan(d.z, d.x), asin(clamp(d.y, -1.0, 1.0)));
    vec3 col = mix(vec3(0.008, 0.006, 0.02), PalA * 0.25, smoothstep(-0.4, 0.6, d.y));

    // stars
    vec2 sgrid = suv * vec2(160.0, 100.0);
    float sh = hash(floor(sgrid));
    float star = smoothstep(0.996, 1.0, sh) * (0.6 + 0.4 * sin(t * 3.0 + sh * 90.0));
    col += star * vec3(0.9, 0.95, 1.0);

    // ---------- lensing warp around the black hole ----------
    vec3 B = normalize(BttBHDir);
    float ba = length(d - B);
    float ein = 0.10 * BttBHStrength;
    vec2 bendDir = normalize(d.xy - B.xy + 1e-5);
    vec3 dw = normalize(d + vec3(bendDir, 0.0) * (ein * ein / max(ba, 0.02)) * 0.6);

    // ---------- nebula (warped) ----------
    vec2 nuv = vec2(atan(dw.z, dw.x), asin(clamp(dw.y, -1.0, 1.0)));
    float neb = fbm(nuv * 3.0 + vec2(t * 0.05, -t * 0.02) + BttSeed * 7.0);
    neb += 0.5 * fbm(nuv * 7.0 - t * 0.03);
    vec3 nebCol = mix(PalA, PalB, smoothstep(0.35, 0.75, neb));
    col += nebCol * neb * neb * 0.9;

    // ---------- black hole ----------
    float x = ba / ein;
    float coreM = 1.0 - smoothstep(0.30, 0.40, x);
    float ringM = exp(-abs(x - 1.1) * 7.0);
    float swirlA = atan(dot(d - B, normalize(cross(B, vec3(0, 1, 0)))), dot(d - B, B));
    vec3 diskCol = mix(PalHorizon, vec3(1.0, 0.95, 0.85), ringM);
    diskCol = mix(diskCol, PalGlow, 0.5 + 0.5 * sin(swirlA * 3.0 + t * 0.7));
    col += diskCol * ringM * 1.6 * BttBHStrength;
    col += PalHorizon * 0.25 * BttBHStrength / (1.0 + x * x * x * x);
    col = mix(col, vec3(0.0), coreM);

    // ---------- horizon fire ----------
    float hor = pow(1.0 - abs(d.y), 4.0);
    col += PalHorizon * hor * 0.55;

    // ---------- the colossus (mode 0) ----------
    if (BttMode < 0.5) {
        vec3 H = normalize(vec3(0.14, 0.20, -0.97));          // head
        vec3 S = normalize(vec3(0.10, -0.05, -0.99));         // shoulders
        vec3 A1 = normalize(vec3(-0.85, 0.01, -0.53));        // left arm
        vec3 A2 = normalize(vec3(0.92, 0.00, -0.40));         // right arm

        float head = length(d - H);
        float shoulder = length((d - S) * vec3(1.0, 2.8, 1.0));
        float arm1 = length((d - A1) * vec3(1.0, 3.4, 1.6));
        float arm2 = length((d - A2) * vec3(1.0, 3.4, 1.6));
        float body = min(min(head - 0.24, shoulder - 0.55), min(arm1 - 0.30, arm2 - 0.30));
        float mask = 1.0 - smoothstep(-0.01, 0.02, body);

        // skin: dark flesh of the void with nebula veins
        vec3 skin = vec3(0.015, 0.010, 0.030)
                + PalA * fbm(suv * 14.0) * 0.22
                + PalGlow * pow(fbm(suv * 30.0 + t * 0.02), 3.0) * 0.5;
        float rim = smoothstep(0.05, 0.0, abs(body)) ;
        skin += PalGlow * rim * 0.9;

        // eyes of the watcher: two burning points on the head
        vec3 E1 = normalize(H + vec3(-0.075, 0.02, 0.0));
        vec3 E2 = normalize(H + vec3(0.075, 0.02, 0.0));
        float blink = 0.6 + 0.4 * smoothstep(0.97, 1.0, sin(t * 0.11));
        float eye = exp(-pow(length(d - E1) * 55.0, 2.0)) + exp(-pow(length(d - E2) * 55.0, 2.0));
        skin += PalGlow * eye * 3.0 * blink + vec3(1.0) * eye * blink;

        col = mix(col, skin, mask);
    } else {
        // ---------- procedural dimension membrane ----------
        float grid = abs(fract(suv.x * 18.0 + BttSeed) - 0.5) + abs(fract(suv.y * 12.0) - 0.5);
        float line = smoothstep(0.06, 0.0, grid);
        col += PalGlow * line * 0.12 * (0.5 + 0.5 * sin(t + suv.y * 20.0));

        // floating voxel isles
        vec2 ig = suv * vec2(26.0, 16.0);
        vec2 cell = floor(ig);
        float h = hash(cell + BttSeed * 31.0);
        if (h > 0.955) {
            vec2 f = fract(ig) - 0.5;
            float isl = step(max(abs(f.x), abs(f.y)), 0.16 + 0.1 * hash(cell + 2.0));
            float top = step(f.y, -0.02);
            vec3 icol = mix(PalB, PalHorizon, top) * (0.5 + 0.5 * h * 7.0);
            col = mix(col, icol, isl * smoothstep(-0.7, -0.2, d.y));
        }

        // aurora veils
        float aur = exp(-abs(d.y - 0.35 - 0.15 * noise(vec2(suv.x * 4.0 + t * 0.1, t * 0.05))) * 6.0);
        col += mix(PalB, PalGlow, 0.5 + 0.5 * sin(suv.x * 6.0 + t * 0.3)) * aur * 0.5;
    }

    // gentle dither to avoid banding
    col += (hash(suv * 913.0) - 0.5) / 255.0;

    fragColor = vec4(col, 1.0);
}
