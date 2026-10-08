#version 120

#include "/lib/util.glsl"

uniform sampler2D colortex0;
uniform float frameTimeCounter;
uniform float viewWidth;
uniform float viewHeight;

varying vec2 texcoord;

// The last pass: bloom, tonemapping, grain and the gentle chromatic aberration that makes a frame
// look photographed rather than rendered.

vec3 bloom(vec2 uv, float radius) {
    vec3 total = vec3(0.0);
    float weight = 0.0;
    for (int x = -4; x <= 4; x++) {
        for (int y = -4; y <= 4; y++) {
            vec2 offset = vec2(float(x), float(y)) / vec2(viewWidth, viewHeight) * radius;
            float kernel = 1.0 - length(vec2(float(x), float(y))) / 6.0;
            if (kernel <= 0.0) continue;
            vec3 sample = texture2D(colortex0, uv + offset).rgb;
            total += max(vec3(0.0), sample - 0.75) * kernel;
            weight += kernel;
        }
    }
    return total / max(weight, 0.0001);
}

void main() {
    vec2 uv = texcoord;

    // Chromatic aberration: the channels are sampled at slightly different radii.
    vec2 centre = uv - 0.5;
    float aberration = 0.0016 + 0.0024 * length(centre);
    vec3 colour;
    colour.r = texture2D(colortex0, uv + centre * aberration).r;
    colour.g = texture2D(colortex0, uv).g;
    colour.b = texture2D(colortex0, uv - centre * aberration).b;

    colour += bloom(uv, 2.5) * BLOOM_STRENGTH;
    colour = tonemap(colour * 1.05);

    // Grain, which the eye reads as film rather than as noise.
    float grain = (hash12x(uv * 2048.0 + frameTimeCounter) - 0.5) * GRAIN_STRENGTH;
    colour += grain;

    // A vignette that closes in when the world is loud.
    float vignette = pow(length(centre) * 1.4, 2.4);
    colour *= 1.0 - vignette * 0.35;

    gl_FragData[0] = vec4(colour, 1.0);
}
