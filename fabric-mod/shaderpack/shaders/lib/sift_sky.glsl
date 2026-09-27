// Original procedural sky inspired by the supplied ribbon-sky references.
// World-direction anchored, not a flat screen overlay. No textures or assets copied.
#define SIFT_RIBBONS 0.8 // [0.0 0.35 0.6 0.8 1.0]
#define SIFT_SKY_SPEED 0.5 // [0.0 0.25 0.5 1.0]
vec3 siftSky(vec3 direction, float dayTicks, float seconds) {
    float phase = (mod(dayTicks, 24000.0) - 6000.0) / 24000.0 * 6.2831853;
    float daylight = smoothstep(-0.25, 0.45, cos(phase));
    float altitude = max(direction.y, 0.0);
    float dusk = pow(1.0 - abs(cos(phase)), 5.0);
    vec3 horizon = mix(vec3(0.045, 0.055, 0.135), vec3(0.50, 0.73, 0.74), daylight);
    vec3 zenith = mix(vec3(0.012, 0.020, 0.075), vec3(0.19, 0.52, 0.59), daylight);
    vec3 sky = mix(horizon, zenith, pow(altitude, 0.48));
    sky += vec3(0.14, 0.04, 0.10) * dusk * pow(1.0 - altitude, 3.0);
    // Projection onto a high sky plane: smooth, continuous and independent of camera translation.
    vec2 p = direction.xz / max(direction.y + 0.18, 0.18);
    float time = seconds * 0.025 * SIFT_SKY_SPEED;
    vec3 ribbons = vec3(0.0);
    for (int i = 0; i < 5; i++) {
        float fi = float(i);
        float angle = fi * 0.47;
        vec2 q = mat2(cos(angle), -sin(angle), sin(angle), cos(angle)) * p;
        float fold = sin(q.x * 0.73 + time + fi * 1.7)
                   + 0.32 * sin(q.x * 1.8 - time * 0.7 + fi);
        float centre = (fi - 2.0) * 1.05 + fold * 0.60;
        float distanceToRibbon = abs(q.y - centre);
        float body = exp(-distanceToRibbon * distanceToRibbon * 12.0);
        float fringe = exp(-distanceToRibbon * distanceToRibbon * 75.0);
        float folds = 0.65 + 0.35 * sin(q.x * 4.0 + fold * 2.0 + fi);
        vec3 tint = mix(vec3(0.08, 0.90, 0.72), vec3(0.64, 0.30, 0.53), smoothstep(1.6, 4.0, fi));
        ribbons += tint * (body * 0.35 + fringe * 0.28) * folds;
    }
    sky += ribbons * SIFT_RIBBONS * smoothstep(0.015, 0.18, direction.y)
        * mix(0.85, 0.65, daylight);
    // Stable sparse stars; no frame-random flashing or lightning strobe.
    vec3 cell = floor(direction * 360.0);
    float hash = fract(sin(dot(cell, vec3(127.1, 311.7, 74.7))) * 43758.5453);
    float star = smoothstep(0.9987, 1.0, hash) * (1.0 - daylight);
    sky += vec3(0.52, 0.79, 0.85) * star * smoothstep(0.0, 0.3, direction.y);
    return sky;
}
