// Utility library shared by every program in this pack.
// The options block lives here rather than in each program so that the pack has one place where the
// shader GUI's settings are declared, and shaders.properties can name them all.

#define WATER_WAVE_STRENGTH 0.35 // [0.15 0.25 0.35 0.55 0.8]
#define REALITY_DISTORTION 0.35 // [0.0 0.15 0.35 0.6 1.0]
#define GODRAY_STRENGTH 0.55 // [0.0 0.25 0.55 0.85 1.2]
#define BLOOM_STRENGTH 0.35 // [0.0 0.15 0.35 0.6 0.9]
#define GRAIN_STRENGTH 0.022 // [0.0 0.01 0.022 0.04 0.07]

// OptiFine and Iris both understand #include; paths are relative to the shaderpack root.

#define PI 3.14159265359
#define TAU 6.28318530718

float hash11(float p) {
    p = fract(p * 0.1031);
    p *= p + 33.33;
    p *= p + p;
    return fract(p);
}

float hash13(vec3 p3) {
    p3 = fract(p3 * 0.1031);
    p3 += dot(p3, p3.zyx + 31.32);
    return fract((p3.x + p3.y) * p3.z);
}

float hash12x(vec2 p) {
    return hash13(vec3(p, 0.0));
}

float noise2(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash12x(i), hash12x(i + vec2(1.0, 0.0)), u.x),
               mix(hash12x(i + vec2(0.0, 1.0)), hash12x(i + vec2(1.0, 1.0)), u.x), u.y);
}

float fbm2(vec2 p, int octaves) {
    float total = 0.0;
    float amplitude = 0.5;
    float norm = 0.0;
    for (int i = 0; i < 6; i++) {
        if (i >= octaves) break;
        total += noise2(p) * amplitude;
        norm += amplitude;
        p *= 2.03;
        amplitude *= 0.5;
    }
    return total / max(norm, 0.0001);
}

float luma(vec3 colour) {
    return dot(colour, vec3(0.2126, 0.7152, 0.0722));
}

// ACES-style filmic curve: keeps highlights from clipping to white, which matters when half the
// mod's content is emissive.
vec3 tonemap(vec3 colour) {
    const float a = 2.51;
    const float b = 0.03;
    const float c = 2.43;
    const float d = 0.59;
    const float e = 0.14;
    return clamp((colour * (a * colour + b)) / (colour * (c * colour + d) + e), 0.0, 1.0);
}

// Radial lensing: the same arithmetic the mod's sky shader uses, applied to the finished frame.
vec2 lensOffset(vec2 uv, vec2 centre, float strength, float radius) {
    vec2 delta = uv - centre;
    float distance = length(delta);
    float falloff = smoothstep(radius, 0.0, distance);
    return delta * falloff * strength;
}
