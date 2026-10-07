#version 120
// Dungeons II water: clear teal pools that mirror the sky (Fresnel), a sharp sun glint on
// rippled normals, and waterfalls (vertical water faces) covered in rushing white foam.
#define SIFT_WATERFALL_FOAM 0.8 // [0.0 0.4 0.8 1.0]
#define SIFT_REFLECTIONS 0.85 // [0.0 0.5 0.85 1.0]
uniform sampler2D texture;
uniform sampler2D lightmap;
uniform float frameTimeCounter;
uniform mat4 gbufferModelView;
uniform mat4 gbufferModelViewInverse;
uniform vec3 sunPosition;
uniform vec3 skyColor;
uniform vec3 fogColor;
uniform int worldTime;
uniform float rainStrength;
varying vec2 texcoord;
varying vec2 lmcoord;
varying vec4 glcolor;
varying vec3 worldPos;
varying vec3 worldNormal;
varying vec3 viewPos;
varying float isWater;
float h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float n21(vec2 p) {
    vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y);
}
float waves(vec2 p, float t) {
    return n21(p * 0.9 + vec2(t * 0.55, t * 0.35)) * 0.6 + n21(p * 2.3 - vec2(t * 0.4, -t * 0.7)) * 0.4;
}
/* DRAWBUFFERS:0 */
void main() {
    vec4 color = texture2D(texture, texcoord) * glcolor;
    vec3 light = texture2D(lightmap, lmcoord).rgb;
    if (isWater < 0.5) {
        // Stained glass, ice, slime etc.: plain lit translucency.
        color.rgb *= light;
        gl_FragData[0] = color;
        return;
    }
    float t = frameTimeCounter;
    float vertical = 1.0 - abs(worldNormal.y);
    float sky = clamp((lmcoord.y - 0.03) / 0.94, 0.0, 1.0);
    float cycle = cos((mod(float(worldTime), 24000.0) - 6000.0) / 24000.0 * 6.2831853);
    float day = smoothstep(-0.3, 0.2, cycle);

    // Rippled normal from a noise height field (pools only; waterfalls use foam instead).
    vec2 p = worldPos.xz;
    float e = 0.08;
    float h0 = waves(p, t);
    vec3 n = normalize(vec3((h0 - waves(p + vec2(e, 0.0), t)) * 0.6, 1.0, (h0 - waves(p + vec2(0.0, e), t)) * 0.6));
    vec3 worldN = mix(n, worldNormal, vertical);
    vec3 nView = normalize(mat3(gbufferModelView) * worldN);
    vec3 v = normalize(-viewPos);
    float fresnel = 0.03 + 0.97 * pow(1.0 - clamp(dot(nView, v), 0.0, 1.0), 5.0);

    // Sky reflection: horizon haze -> deep blue zenith, like the Dungeons sky.
    vec3 r = reflect(-v, nView);
    vec3 rWorld = mat3(gbufferModelViewInverse) * r;
    float up = clamp(rWorld.y, 0.0, 1.0);
    vec3 reflection = mix(fogColor * 1.1, skyColor * vec3(0.85, 0.95, 1.1), pow(up, 0.45));
    // Sun glint (sharp) + soft sheen.
    vec3 sunDir = normalize(sunPosition);
    float spec = pow(max(dot(r, sunDir), 0.0), 350.0) * 6.0 + pow(max(dot(r, sunDir), 0.0), 24.0) * 0.25;
    reflection += vec3(1.0, 0.92, 0.78) * spec * day * (1.0 - rainStrength);

    // Base: clearer, teal Dungeons water.
    color.rgb = mix(color.rgb, color.rgb * vec3(0.7, 1.05, 1.08), 0.55) * light;
    float refl = fresnel * SIFT_REFLECTIONS * sky * (1.0 - vertical);
    color.rgb = mix(color.rgb, reflection, clamp(refl, 0.0, 0.9));
    color.rgb += vec3(1.0, 0.95, 0.85) * spec * day * sky * (1.0 - vertical) * 0.6;
    color.a = mix(color.a * 0.85, 1.0, clamp(refl, 0.0, 0.7));

    // Waterfall: streaks stretched vertically, scrolling down fast.
    float across = worldPos.x * abs(worldNormal.z) + worldPos.z * abs(worldNormal.x);
    float streak = n21(vec2(across * 6.0, worldPos.y * 0.9 + t * 5.5)) * 0.65
                 + n21(vec2(across * 14.0, worldPos.y * 2.2 + t * 9.0)) * 0.35;
    float foam = vertical * smoothstep(0.42, 0.78, streak) * SIFT_WATERFALL_FOAM;
    color.rgb = mix(color.rgb, vec3(0.93, 0.98, 1.0) * max(light, vec3(0.35)), foam);
    color.a = mix(color.a, 0.92, max(foam, vertical * 0.3 * SIFT_WATERFALL_FOAM));
    gl_FragData[0] = color;
}
