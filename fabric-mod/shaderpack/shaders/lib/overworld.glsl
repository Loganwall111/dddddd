// 0.24 "Minecraft Dungeons II" Overworld (Images 4, 23, 24, 25):
// - Crisp cerulean-blue zenith fading to a warm golden-peach horizon
// - Multi-tiered 3D stepped voxel cumulus clouds with warm peach-ivory sunlit tops and cool periwinkle undersides
// - Saturated periwinkle-indigo cliff shadows, warm golden-apricot sunlight, and lush golden-lime foliage
#define SIFT_CLOUDS 0.85 // [0.0 0.35 0.65 0.85 1.0]
#define SIFT_CLOUD_STEPS 28 // [16 20 28 40]
#define SIFT_CLOUD_BLOCKINESS 0.7 // [0.0 0.35 0.7 1.0]
#include "/lib/voxel_clouds.glsl"

const float CLOUD_BASE = 186.0;
const float CLOUD_TOP = 236.0;

float cloudDensity(vec3 p, float t) {
    vec2 wind = vec2(t * 2.4, t * 0.9);
    vec2 q = p.xz + wind;
    vec2 cell = floor(q / 8.0) * 8.0 + 4.0;
    float blocky = cloudFbm(cell * 0.0065);
    float smooth_ = cloudFbm(q * 0.0065);
    float coverage = mix(smooth_, blocky, SIFT_CLOUD_BLOCKINESS);
    float h = (p.y - CLOUD_BASE) / (CLOUD_TOP - CLOUD_BASE);
    float topH = smoothstep(0.48, 0.82, coverage);
    float shape = smoothstep(0.0, 0.06, h) * (1.0 - smoothstep(topH - 0.12, topH, h));
    float detail = 0.75 + 0.25 * cloudNoise(q * 0.09 + p.y * 0.05);
    return max(coverage - 0.5, 0.0) * 4.0 * shape * detail;
}

vec3 overworldClouds(vec3 original, vec3 dir, float t, float dayTicks) {
    float cycle = cos((dayTicks - 6000.0) / 24000.0 * 6.2831853);
    float day = smoothstep(-0.3, 0.2, cycle);
    float dusk = pow(1.0 - abs(cycle), 6.0);
    // Dungeons II sky grading (Images 4, 24): rich azure-cerulean zenith, warm peach-ivory horizon.
    float horizon = pow(1.0 - clamp(dir.y, 0.0, 1.0), 4.5);
    original = mix(original, vec3(0.76, 0.86, 0.98), horizon * 0.42 * day);
    original = mix(original, vec3(1.00, 0.85, 0.72), pow(horizon, 2.4) * 0.32 * day); // warm peach-gold horizon
    original = mix(original, original * vec3(0.74, 0.88, 1.16), (1.0 - horizon) * 0.30 * day);
    if (dir.y < 0.015 || SIFT_CLOUDS <= 0.0) return original;

    vec3 sunDir = normalize(mat3(gbufferModelViewInverse) * normalize(sunPosition));
    vec3 lightDir = day > 0.5 ? sunDir : -sunDir;
    // Warm peach-ivory sunlit cloud tops + cool periwinkle-slate undersides (Images 4, 24)
    vec3 sunCol = mix(vec3(0.24, 0.30, 0.48) * 0.58, mix(vec3(1.36, 1.28, 1.18), vec3(1.42, 0.82, 0.52), dusk), day);
    vec3 shadowCol = mix(vec3(0.05, 0.07, 0.14), vec3(0.56, 0.66, 0.90), day);
    vec3 skyAmb = mix(vec3(0.08, 0.10, 0.18), vec3(0.70, 0.80, 0.98), day);

    return voxelClouds(original, dir, lightDir, t, CLOUD_BASE, sunCol * 0.82 + vec3(0.10), shadowCol * 1.08, skyAmb, SIFT_CLOUDS, 0.0);
}

// Dungeons II Overworld colour grade (Images 4, 23, 24, 25):
// - Cool periwinkle-indigo shadows on stone cliffs (Image 23, 24)
// - Warm golden-peach sunlight on highlights
// - Lush golden-lime boost on sunlit grass and foliage (Image 4, 24, 25)
vec3 dungeonsGrade(vec3 c) {
    float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
    c = mix(vec3(l), c, 1.28);
    // Lush golden-lime foliage highlight boost (Images 4, 23, 24, 25)
    float greenMask = clamp((c.g - max(c.r, c.b)) * 2.8, 0.0, 1.0);
    c = mix(c, c * vec3(1.06, 1.14, 0.84), greenMask * smoothstep(0.18, 0.65, l) * 0.55);
    // Periwinkle-blue shadows -> warm golden-peach highlights
    c = mix(c * vec3(0.84, 0.92, 1.18), c * vec3(1.08, 1.02, 0.90), smoothstep(0.14, 0.78, l));
    c = (c - 0.45) * 1.08 + 0.45;
    return max(c, 0.0);
}
