// "Dungeons II" overworld: raymarched volumetric cumulus in a world-space slab (y 190-240).
// Clouds are built from chunky 8-block voxel columns with soft noise, like the chunky puffy
// clouds in the Dungeons II footage: warm sunlit tops, blue-grey undersides, silver linings.
#define SIFT_CLOUDS 0.85 // [0.0 0.35 0.65 0.85 1.0]
#define SIFT_SHAFTS 0.3 // [0.0 0.15 0.25 0.3 0.4]
#define SIFT_CLOUD_STEPS 28 // [16 20 28 40]
#define SIFT_CLOUD_BLOCKINESS 0.7 // [0.0 0.35 0.7 1.0]
uniform vec3 cameraPosition;

float cloudHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float cloudNoise(vec2 p) {
    vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(cloudHash(i), cloudHash(i + vec2(1, 0)), f.x), mix(cloudHash(i + vec2(0, 1)), cloudHash(i + vec2(1, 1)), f.x), f.y);
}
float cloudFbm(vec2 p) { return cloudNoise(p) * 0.55 + cloudNoise(p * 2.03) * 0.28 + cloudNoise(p * 4.1) * 0.17; }

const float CLOUD_BASE = 190.0;
const float CLOUD_TOP = 240.0;

float cloudDensity(vec3 p, float t) {
    vec2 wind = vec2(t * 2.4, t * 0.9);
    vec2 q = p.xz + wind;
    // Chunky voxel coverage mixed with smooth coverage (SIFT_CLOUD_BLOCKINESS).
    vec2 cell = floor(q / 8.0) * 8.0 + 4.0;
    float blocky = cloudFbm(cell * 0.0065);
    float smooth_ = cloudFbm(q * 0.0065);
    float coverage = mix(smooth_, blocky, SIFT_CLOUD_BLOCKINESS);
    float h = (p.y - CLOUD_BASE) / (CLOUD_TOP - CLOUD_BASE);
    // Cumulus profile: flat bottoms, heaped tops where coverage is thick.
    float topH = smoothstep(0.48, 0.82, coverage);
    float shape = smoothstep(0.0, 0.06, h) * (1.0 - smoothstep(topH - 0.12, topH, h));
    float detail = 0.75 + 0.25 * cloudNoise(q * 0.09 + p.y * 0.05);
    return max(coverage - 0.5, 0.0) * 4.0 * shape * detail;
}

vec3 overworldClouds(vec3 original, vec3 dir, float t, float dayTicks) {
    float cycle = cos((dayTicks - 6000.0) / 24000.0 * 6.2831853);
    float day = smoothstep(-0.3, 0.2, cycle);
    float dusk = pow(1.0 - abs(cycle), 6.0);
    // Dungeons-style sky grading: deep blue zenith, bright hazy horizon.
    float horizon = pow(1.0 - clamp(dir.y, 0.0, 1.0), 6.0);
    original = mix(original, vec3(0.80, 0.88, 0.98), horizon * 0.35 * day);
    original = mix(original, original * vec3(0.78, 0.9, 1.12), (1.0 - horizon) * 0.25 * day);
    if (dir.y < 0.015 || SIFT_CLOUDS <= 0.0) return original;

    vec3 sunDir = normalize(mat3(gbufferModelViewInverse) * normalize(sunPosition));
    vec3 lightDir = day > 0.5 ? sunDir : -sunDir;
    vec3 sunCol = mix(vec3(0.22, 0.28, 0.45) * 0.55, mix(vec3(1.25, 1.18, 1.05), vec3(1.4, 0.8, 0.5), dusk), day);
    vec3 shadowCol = mix(vec3(0.05, 0.07, 0.13), vec3(0.50, 0.58, 0.74), day);
    vec3 skyAmb = mix(vec3(0.08, 0.1, 0.18), vec3(0.72, 0.82, 0.96), day);

    vec3 eye = cameraPosition;
    float t0 = max((CLOUD_BASE - eye.y) / dir.y, 0.0);
    float t1 = (CLOUD_TOP - eye.y) / dir.y;
    if (t1 <= 0.0) return original;
    t1 = min(t1, t0 + 600.0);
    float steps = float(SIFT_CLOUD_STEPS);
    float stepLen = (t1 - t0) / steps;
    float jitter = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
    float cosTheta = dot(dir, lightDir);
    // Henyey-Greenstein forward scatter (silver linings) + a little back scatter.
    float g = 0.6;
    float phase = mix((1.0 - g * g) / pow(1.0 + g * g - 2.0 * g * cosTheta, 1.5), 1.0, 0.55) * 0.35;

    float transmittance = 1.0;
    vec3 scattered = vec3(0.0);
    for (int i = 0; i < 40; i++) {
        if (float(i) >= steps || transmittance < 0.03) break;
        vec3 p = eye + dir * (t0 + (float(i) + jitter) * stepLen);
        float d = cloudDensity(p, t);
        if (d <= 0.001) continue;
        float sigma = d * 0.045;
        // Two-tap light march toward the sun for self shadowing.
        float od = cloudDensity(p + lightDir * 7.0, t) * 7.0 + cloudDensity(p + lightDir * 18.0, t) * 11.0;
        float lightT = exp(-od * 0.045 * 1.6);
        float powder = 1.0 - exp(-d * 2.0);
        float h = clamp((p.y - CLOUD_BASE) / (CLOUD_TOP - CLOUD_BASE), 0.0, 1.0);
        vec3 ambient = mix(shadowCol, skyAmb, h);
        vec3 lum = sunCol * lightT * phase * (0.6 + 0.8 * powder) * 2.2 + ambient * 0.85;
        float absorb = 1.0 - exp(-sigma * stepLen);
        scattered += transmittance * absorb * lum;
        transmittance *= exp(-sigma * stepLen);
    }
    // Distant clouds melt into the horizon haze.
    float fade = exp(-t0 / 2600.0) * smoothstep(0.015, 0.09, dir.y);
    float amount = (1.0 - transmittance) * fade * SIFT_CLOUDS;
    vec3 cloud = scattered / max(1.0 - transmittance, 1e-3);
    return mix(original, cloud, amount);
}

// Cinematic grade: saturated greens/blues, warm highlights, cool shadows.
vec3 dungeonsGrade(vec3 c) {
    float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
    c = mix(vec3(l), c, 1.2);
    c = mix(c * vec3(0.93, 0.98, 1.08), c * vec3(1.06, 1.02, 0.94), smoothstep(0.2, 0.8, l));
    c = c * c * (3.0 - 2.0 * c) * 0.25 + c * 0.75; // gentle S-curve
    return c;
}
