#version 120

#include "/lib/util.glsl"

uniform sampler2D texture;
uniform sampler2D lightmap;
uniform vec3 sunPosition;
uniform float frameTimeCounter;
uniform int entityId;

varying vec2 texCoord;
varying vec2 lightCoord;
varying vec4 tint;
varying vec3 viewNormal;

/* DRAWBUFFERS:02 */

void main() {
    vec4 albedo = texture2D(texture, texCoord) * tint;
    if (albedo.a < 0.02) discard;

    vec2 light = texture2D(lightmap, lightCoord).xy;
    vec3 sunDir = normalize(sunPosition);
    float diffuse = max(0.0, dot(viewNormal, sunDir));
    vec3 colour = albedo.rgb * mix(vec3(0.12, 0.13, 0.18), vec3(1.0, 0.96, 0.90), light.y);
    colour += vec3(1.0, 0.96, 0.90) * diffuse * 0.10;

    // The mod's Backrooms residents and the black sun's fragments are lit from inside: an entity
    // that emits nothing is an entity the player cannot be afraid of in an unlit corridor.
    if (entityId >= 0) {
        colour *= 1.1;
    }

    gl_FragData[0] = vec4(colour, albedo.a);
    gl_FragData[2] = vec4(normalize(viewNormal) * 0.5 + 0.5, 1.0);
}
