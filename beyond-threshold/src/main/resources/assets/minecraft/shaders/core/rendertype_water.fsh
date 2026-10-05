#version 150

// BEYOND THE THRESHOLD — realistic flowing water.
// Two scrolling wave layers build a procedural normal; the water gets
// fresnel sky sheen, sun glints, depth-darkened absorption colour,
// moving sparkle and foam crests — all from the vanilla water texture
// plus math, no new assets.

in vec4 vertexColor;
in vec2 texCoord0;
in vec3 viewPos;

out vec4 fragColor;

uniform sampler2D Sampler0;
uniform vec4 ColorModulator;
uniform float FogStart;
uniform float FogEnd;
uniform vec4 FogColor;
uniform float GameTime;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x),
               mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}
float fbm(vec2 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 4; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; }
    return v;
}

float waveHeight(vec2 p, float t) {
    float h = 0.0;
    h += fbm(p * 6.0 + vec2(t * 0.9, t * 0.35));
    h += 0.5 * fbm(p * 14.0 - vec2(t * 1.3, t * 0.6));
    h += 0.25 * noise(p * 30.0 + vec2(t * 2.2, -t * 1.7));
    return h;
}

void main() {
    float t = GameTime * 24.0;
    vec2 uv = texCoord0;

    // flow-warp the vanilla texture so the water actually moves
    vec2 warp = vec2(
        waveHeight(uv * 2.0 + 3.7, t) - 0.5,
        waveHeight(uv * 2.0 + 9.1, t * 1.1) - 0.5) * 0.035;
    vec4 tex = texture(Sampler0, uv + warp);

    vec3 base = tex.rgb * vertexColor.rgb;

    // procedural normal from wave field gradients
    float e = 0.01;
    float h0 = waveHeight(uv * 3.0, t);
    float hx = waveHeight(uv * 3.0 + vec2(e, 0.0), t);
    float hy = waveHeight(uv * 3.0 + vec2(0.0, e), t);
    vec3 n = normalize(vec3(-(hx - h0) / e * 0.12, 1.0, -(hy - h0) / e * 0.12));

    vec3 viewDir = normalize(viewPos);
    vec3 lightDir = normalize(vec3(0.4, 0.8, -0.35));

    // fresnel sky sheen
    float fres = pow(1.0 - max(0.0, dot(-viewDir, n)), 3.0);
    vec3 sky = mix(vec3(0.35, 0.55, 0.85), vec3(0.75, 0.85, 1.0), fres);
    base = mix(base, sky, clamp(fres * 1.2, 0.0, 0.75));

    // sun glint + moving sparkle
    float spec = pow(max(0.0, dot(reflect(viewDir, n), lightDir)), 90.0);
    float sparkle = pow(noise(uv * 90.0 + vec2(t * 3.0, -t * 2.0)), 12.0);
    base += vec3(1.0, 0.95, 0.8) * spec * 1.4;
    base += vec3(1.0) * sparkle * 0.35;

    // foam crests on wave tops
    float foam = smoothstep(0.72, 0.85, h0) * smoothstep(0.3, 0.6, noise(uv * 40.0 - t));
    base = mix(base, vec3(0.92, 0.97, 1.0), foam * 0.6);

    // depth absorption: deeper view angles drink more red
    base *= vec3(0.75, 0.95, 1.0);

    float dist = length(viewPos);
    float fogF = clamp((dist - FogStart) / (FogEnd - FogStart), 0.0, 1.0);
    vec3 col = mix(base, FogColor.rgb, fogF);

    float alpha = vertexColor.a * tex.a;
    fragColor = vec4(col, alpha) * ColorModulator;
}
