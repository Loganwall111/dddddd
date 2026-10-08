#version 120

#include "/lib/util.glsl"

uniform sampler2D texture;
uniform vec3 sunPosition;
uniform float frameTimeCounter;
uniform float rainStrength;

varying vec2 texCoord;
varying vec4 tint;

/* DRAWBUFFERS:0 */

void main() {
    vec4 albedo = texture2D(texture, texCoord) * tint;
    if (albedo.a < 0.02) discard;

    // The deck boils during a storm rather than merely darkening.
    float boil = fbm2(texCoord * 6.0 + frameTimeCounter * 0.02, 4);
    vec3 sunDir = normalize(sunPosition);
    float silver = pow(max(0.0, sunDir.y), 4.0);
    vec3 colour = albedo.rgb;
    colour = mix(colour, colour * vec3(0.55, 0.55, 0.70), rainStrength);
    colour += vec3(1.0, 0.95, 0.88) * silver * 0.25 * (1.0 - rainStrength);
    colour *= 0.9 + boil * 0.25;

    gl_FragData[0] = vec4(colour, albedo.a);
}
