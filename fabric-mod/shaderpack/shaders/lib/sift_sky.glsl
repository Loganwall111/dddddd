// Sift sky ("Sift supreme" blueprint, inverted cycle):
//   day   = mint-cyan sky/fog (#39A59E-#5BBFB7), cyan #00F2FF + pearl aurora, pink/pearl god rays
//   night = amber-gold / peach (#DE7E7A-#C96253) with crimson #B8506D and dusty-rose #A64B56 pillars
// The panoramas (tools/sky_panorama.py) carry the painted detail. On top of them this adds a slow
// noise warp, rainbow light rays fanning out from the sun whose hues drift with the time of day,
// and a curtain shimmer. The backdrop is drawn in every direction (also below the horizon), so the
// vanilla sky never shows through; siftHaze() gives terrain the same colour for a seamless horizon.
#define SIFT_CURTAIN_DRIFT 0.5 // [0.0 0.25 0.5 1.0]
#define SIFT_SKY_RIFTS 0.6 // [0.0 0.3 0.6 1.0]
#define SIFT_RAINBOW_RAYS 0.6 // [0.0 0.3 0.6 0.9]
uniform sampler2D siftDaySky;
uniform sampler2D siftNightSky;

float siftDaylight(float dayTicks) {
    return smoothstep(-0.25, 0.45, cos((mod(dayTicks, 24000.0) - 6000.0) / 24000.0 * 6.2831853));
}
float siftHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float siftNoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(siftHash(i), siftHash(i + vec2(1.0, 0.0)), f.x), mix(siftHash(i + vec2(0.0, 1.0)), siftHash(i + vec2(1.0)), f.x), f.y);
}
vec3 siftRainbow(float h) { return clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0); }

// Flat colour of the sky near the horizon in this direction (used for terrain haze).
vec3 siftHaze(float dayTicks) {
    return mix(vec3(0.85, 0.47, 0.44), vec3(0.30, 0.70, 0.67), siftDaylight(dayTicks));
}

vec3 siftSky(vec3 direction, vec3 sunDir, float dayTicks, float seconds) {
    float daylight = siftDaylight(dayTicks);
    float time = seconds * SIFT_CURTAIN_DRIFT;
    vec2 uv = vec2(atan(direction.z, direction.x) / 6.2831853 + 0.5, acos(clamp(direction.y, -1.0, 1.0)) / 3.1415927);
    // Noise warp: the painted sky breathes slowly instead of sitting still.
    vec2 warp = vec2(siftNoise(uv * vec2(9.0, 5.0) + time * 0.02), siftNoise(uv * vec2(7.0, 4.0) - time * 0.015)) - 0.5;
    vec2 uvD = vec2(fract(uv.x + time * 0.0006 + warp.x * 0.006), clamp(uv.y + warp.y * 0.004, 0.001, 0.999));
    vec2 uvN = vec2(fract(uv.x + time * 0.0012 + warp.x * 0.008 + 0.004 * sin(uv.y * 9.0 + time * 0.3)), uvD.y);
    vec3 day = texture2D(siftDaySky, uvD).rgb;
    vec3 night = texture2D(siftNightSky, uvN).rgb;
    // Curtain shimmer: flat panes brighten in travelling bands.
    float shimmer = 0.5 + 0.5 * sin(uv.x * 40.0 - time * 0.8 + uv.y * 6.0);
    day += max(day - vec3(0.36, 0.75, 0.72), 0.0) * shimmer * 0.5;
    vec3 sky = mix(night, day, daylight);

    // Rainbow light rays radiating from the sun (moon side at night), hues drifting through the day.
    vec3 axis = normalize(sunDir.y > -0.05 ? sunDir : -sunDir);
    vec3 side = normalize(cross(axis, abs(axis.y) > 0.95 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0)));
    vec3 upv = cross(side, axis);
    float angle = atan(dot(direction, upv), dot(direction, side));
    float toward = dot(direction, axis);
    float fan = pow(0.5 + 0.5 * sin(angle * 18.0 + time * 0.07 + siftNoise(vec2(angle * 3.0, time * 0.05)) * 2.5), 6.0);
    fan *= smoothstep(-0.2, 0.9, toward) * smoothstep(-0.25, 0.05, direction.y);
    float hue = fract(angle / 6.2831853 * 2.0 + mod(dayTicks, 24000.0) / 24000.0 + time * 0.004);
    vec3 dayRay = mix(siftRainbow(hue), vec3(1.0, 0.84, 0.92), 0.35);       // pastel rainbow + pink/pearl
    vec3 nightRay = mix(vec3(0.72, 0.31, 0.43), vec3(0.65, 0.29, 0.34), siftNoise(vec2(angle * 5.0, 1.0))); // crimson / dusty rose
    sky += mix(nightRay * 0.8, dayRay, daylight) * fan * SIFT_RAINBOW_RAYS * 0.45;
    // Soft sun glow.
    sky += mix(vec3(1.0, 0.72, 0.5), vec3(1.0, 0.95, 0.9), daylight) * pow(max(toward, 0.0), 24.0) * 0.5;

    // Decorative distant sky tear: not a traversable portal or a live destination view.
    vec2 p = direction.xz / max(direction.y + 0.18, 0.18);
    vec2 q = p - vec2(1.3, -0.6); q.x += 0.025 * sin(time * 0.025 + q.y * 8.0);
    float shape = min(max(abs(q.x) - 0.34, abs(q.y) - 0.17), max(abs(q.x) - 0.11, abs(q.y) - 0.32));
    float rim = 1.0 - smoothstep(0.004, 0.018, abs(shape));
    float inside = 1.0 - smoothstep(-0.01, 0.004, shape);
    float visibility = SIFT_SKY_RIFTS * smoothstep(0.2, 0.4, direction.y);
    vec3 tear = mix(vec3(0.16, 0.75, 0.82), vec3(0.95, 0.35, 0.55), 0.5 + 0.5 * sin(q.x * 18.0 + q.y * 11.0 + time * 0.03));
    sky = mix(sky, tear, inside * visibility * 0.6) + vec3(1.0) * rim * visibility * 0.8;
    return sky;
}
