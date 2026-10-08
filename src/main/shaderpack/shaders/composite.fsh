#version 120

uniform sampler2D colortex0;
uniform sampler2D depthtex0;
uniform float frameTimeCounter;
uniform float viewWidth;
uniform float viewHeight;
uniform int isEyeInWater;
varying vec2 texcoord;

float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
}

float noise2(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),
               mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x), f.y);
}

void main() {
    vec2 uv = texcoord;
    vec2 centered = uv - 0.5;
    float aspect = viewWidth / max(viewHeight, 1.0);
    vec2 lens = centered * vec2(aspect, 1.0);
    float radius = length(lens);
    float time = frameTimeCounter;

    // A low-amplitude moving gravitational lens: deliberately subtle in normal play.
    float ring = exp(-abs(radius - (0.19 + 0.012 * sin(time * 0.22))) * 72.0);
    float filament = noise2(lens * 34.0 + vec2(time * 0.035, -time * 0.02));
    float ripple = sin(radius * 72.0 - time * 1.7 + filament * 5.0) * 0.0017;
    vec2 radial = radius > 0.0001 ? lens / radius : vec2(0.0);
    vec2 warped = uv + radial * (ripple + ring * 0.0028);

    float underwater = isEyeInWater > 0 ? 1.0 : 0.0;
    warped += underwater * vec2(
        sin(uv.y * 38.0 + time * 1.9),
        cos(uv.x * 31.0 - time * 1.5)
    ) * 0.0022;

    float depth = texture2D(depthtex0, uv).r;
    float skyMask = smoothstep(0.992, 1.0, depth);
    vec2 ca = radial * (0.00075 + ring * 0.00075);
    vec3 color;
    color.r = texture2D(colortex0, warped + ca).r;
    color.g = texture2D(colortex0, warped).g;
    color.b = texture2D(colortex0, warped - ca).b;

    // Sparse stars emerge only against the far sky; the game's actual world stays intact.
    vec2 starCell = floor(uv * vec2(viewWidth, viewHeight) / 3.0);
    float star = step(0.9975, hash21(starCell));
    float twinkle = 0.45 + 0.55 * sin(time * 2.0 + hash21(starCell + 17.0) * 6.2831);
    vec3 nebula = vec3(0.20, 0.055, 0.42) * ring * 0.10;
    vec3 coolEdge = vec3(0.10, 0.42, 0.75) * ring * 0.08;
    color += skyMask * (nebula + coolEdge + vec3(0.48, 0.72, 1.0) * star * twinkle * 0.34);

    gl_FragColor = vec4(color, 1.0);
}
