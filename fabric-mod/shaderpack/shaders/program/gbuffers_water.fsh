#version 120
// Dungeons II water: clear teal pools with sun glints, and waterfalls (vertical water faces)
// covered in rushing white foam streaks that churn where they hit the pool below.
#define SIFT_WATERFALL_FOAM 0.8 // [0.0 0.4 0.8 1.0]
uniform sampler2D texture;
uniform sampler2D lightmap;
uniform float frameTimeCounter;
varying vec2 texcoord;
varying vec2 lmcoord;
varying vec4 glcolor;
varying vec3 worldPos;
varying vec3 worldNormal;
varying float isWater;
float h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float n21(vec2 p) {
    vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y);
}
/* DRAWBUFFERS:0 */
void main() {
    vec4 color = texture2D(texture, texcoord) * glcolor;
    vec3 light = texture2D(lightmap, lmcoord).rgb;
    if (isWater > 0.5) {
        float t = frameTimeCounter;
        float vertical = 1.0 - abs(worldNormal.y);
        // Waterfall: streaks stretched vertically, scrolling down fast.
        float across = worldPos.x * abs(worldNormal.z) + worldPos.z * abs(worldNormal.x);
        float streak = n21(vec2(across * 6.0, worldPos.y * 0.9 + t * 5.5)) * 0.65
                     + n21(vec2(across * 14.0, worldPos.y * 2.2 + t * 9.0)) * 0.35;
        float foam = vertical * smoothstep(0.42, 0.78, streak) * SIFT_WATERFALL_FOAM;
        // Pools: gentle ripples, clearer teal tint, bright glints.
        float ripple = n21(worldPos.xz * 1.7 + vec2(t * 0.6, t * 0.4)) * n21(worldPos.xz * 3.1 - t * 0.5);
        float glint = (1.0 - vertical) * smoothstep(0.55, 0.75, ripple) * 0.35;
        color.rgb = mix(color.rgb, color.rgb * vec3(0.75, 1.05, 1.1), 0.5);
        color.rgb = mix(color.rgb, vec3(0.93, 0.98, 1.0), foam) + glint;
        color.a = mix(color.a, 0.92, max(foam, vertical * 0.35 * SIFT_WATERFALL_FOAM));
    }
    color.rgb *= light;
    gl_FragData[0] = color;
}
