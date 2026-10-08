#version 120

#include "/lib/util.glsl"

uniform vec3 skyColor;
uniform vec3 fogColor;
uniform float frameTimeCounter;
uniform float rainStrength;
uniform int worldTime;
uniform vec3 cameraPosition;

varying vec4 tint;

/* DRAWBUFFERS:0 */

// The pack's own horizon: the mod replaces the sky entirely when an event is running, so this is
// what shows through in the moments between events. It is deliberately close to vanilla and shifted
// violet, because the mod's sky pass is the star and this is the bed it fades back into.
void main() {
    vec3 colour = mix(skyColor, fogColor, 0.15);
    float day = smoothstep(0.0, 1.0, float(worldTime) / 24000.0);

    // Stars that only exist at night, in the same arrangement the mod's sky uses.
    vec3 direction = normalize(cameraPosition);
    float star = 0.0;
    if (day < 0.45 || day > 0.55) {
        vec2 cell = floor(vec2(atan(direction.z, direction.x), direction.y) * 40.0);
        float present = hash12x(cell);
        if (present > 0.92) {
            star = (present - 0.92) * 12.0;
        }
    }

    colour += vec3(0.9, 0.92, 1.0) * star * (1.0 - rainStrength);
    colour = mix(colour, vec3(luma(colour)) * vec3(0.7, 0.55, 0.95), 0.18);

    gl_FragData[0] = vec4(colour, 1.0);
}
