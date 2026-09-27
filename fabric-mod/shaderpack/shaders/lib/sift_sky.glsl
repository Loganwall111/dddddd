// Sift sky, matched to the reference footage:
//   day   = warm orange / peach / rose ichor mist with hazy crimson pillars in the upper sky
//   night = luminous pale cyan-teal / mint fog with clean horizontal aurora curtains of flat panes
// The painted panoramas (tools/paint_skies.py) carry the detail; this adds slow drift, a shimmer
// on the curtains and the distant sky tear. The backdrop never goes dark: darkness comes from terrain.
#define SIFT_CURTAIN_DRIFT 0.5 // [0.0 0.25 0.5 1.0]
#define SIFT_SKY_RIFTS 0.6 // [0.0 0.3 0.6 1.0]
uniform sampler2D siftDaySky;
uniform sampler2D siftNightSky;
vec3 siftSky(vec3 direction, float dayTicks, float seconds) {
    float phase = (mod(dayTicks, 24000.0) - 6000.0) / 24000.0 * 6.2831853;
    float daylight = smoothstep(-0.25, 0.45, cos(phase));
    float altitude = max(direction.y, 0.0);
    // Fallback gradients (used where the texture is missing / below the horizon blend).
    vec3 dayHorizon = vec3(1.00, 0.84, 0.66), dayZenith = vec3(0.91, 0.55, 0.57);
    vec3 nightHorizon = vec3(0.84, 0.97, 0.91), nightZenith = vec3(0.52, 0.81, 0.82);
    vec3 base = mix(mix(nightHorizon, nightZenith, pow(altitude, 0.6)), mix(dayHorizon, dayZenith, pow(altitude, 0.6)), daylight);
    float time = seconds * SIFT_CURTAIN_DRIFT;
    vec2 uv = vec2(atan(direction.z, direction.x) / 6.2831853 + 0.5, acos(clamp(direction.y, -1.0, 1.0)) / 3.1415927);
    // Night curtains sweep slowly sideways; day pillars sway very gently.
    vec2 uvN = vec2(fract(uv.x + time * 0.0015 + 0.004 * sin(uv.y * 9.0 + time * 0.3)), uv.y);
    vec2 uvD = vec2(fract(uv.x + time * 0.0004 + 0.002 * sin(uv.y * 14.0 + time * 0.2)), uv.y);
    vec3 night = texture2D(siftNightSky, uvN).rgb;
    vec3 day = texture2D(siftDaySky, uvD).rgb;
    // Curtain shimmer: brighten the flat panes in travelling bands.
    float shimmer = 0.5 + 0.5 * sin(uv.x * 40.0 - time * 0.8 + uv.y * 6.0);
    night += max(night - nightHorizon * 0.9, 0.0) * shimmer * 0.6;
    vec3 sky = mix(night, day, daylight);
    sky = mix(base, sky, 0.92);
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
