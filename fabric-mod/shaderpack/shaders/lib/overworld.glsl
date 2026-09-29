// "Dungeons II" overworld: raymarched volumetric cumulus in a world-space slab (y 190-240).
// Clouds are built from chunky 8-block voxel columns with soft noise, like the chunky puffy
// clouds in the Dungeons II footage: warm sunlit tops, blue-grey undersides, silver linings.
#define SIFT_CLOUDS 0.85 // [0.0 0.35 0.65 0.85 1.0]
#define SIFT_CLOUD_STEPS 28 // [16 20 28 40]
#define SIFT_CLOUD_BLOCKINESS 0.7 // [0.0 0.35 0.7 1.0]
#include "/lib/voxel_clouds.glsl"

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
    original = mix(original, vec3(1.0, 0.84, 0.72), pow(horizon, 3.0) * 0.22 * day); // warm peach horizon
    original = mix(original, original * vec3(0.78, 0.9, 1.12), (1.0 - horizon) * 0.25 * day);
    if (dir.y < 0.015 || SIFT_CLOUDS <= 0.0) return original;

    vec3 sunDir = normalize(mat3(gbufferModelViewInverse) * normalize(sunPosition));
    vec3 lightDir = day > 0.5 ? sunDir : -sunDir;
    vec3 sunCol = mix(vec3(0.22, 0.28, 0.45) * 0.55, mix(vec3(1.32, 1.30, 1.26), vec3(1.4, 0.8, 0.5), dusk), day); // bright white tops
    vec3 shadowCol = mix(vec3(0.05, 0.07, 0.13), vec3(0.62, 0.66, 0.86), day); // lavender-blue undersides
    vec3 skyAmb = mix(vec3(0.08, 0.1, 0.18), vec3(0.72, 0.82, 0.96), day);

    return voxelClouds(original, dir, lightDir, t, CLOUD_BASE, sunCol * 0.8 + vec3(0.1), shadowCol * 1.1, skyAmb, SIFT_CLOUDS, 0.0);
}

// Cinematic grade: richer greens/blues, cool shadows, warm (not brighter) highlights.
vec3 dungeonsGrade(vec3 c) {
    float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
    c = mix(vec3(l), c, 1.25);
    // Blue shadows, warm highlights (Dungeons II overworld refs).
    c = mix(c * vec3(0.90, 0.97, 1.12), c * vec3(1.06, 1.01, 0.92), smoothstep(0.15, 0.8, l));
    // Gentle contrast around mid grey; highlights are handled by softClip.
    c = (c - 0.45) * 1.06 + 0.45;
    return max(c, 0.0);
}
