#version 120

#include "/lib/util.glsl"

uniform sampler2D texture;
uniform sampler2D lightmap;
uniform vec3 cameraPosition;
uniform vec3 sunPosition;
uniform vec3 moonPosition;
uniform float frameTimeCounter;
uniform float rainStrength;
uniform float wetness;
uniform int worldTime;
uniform int isEyeInWater;

varying vec2 texCoord;
varying vec2 lightCoord;
varying vec4 tint;
varying vec3 worldPos;
varying vec3 viewNormal;
varying float materialId;
varying float distanceToCamera;

/* DRAWBUFFERS:012 */

void main() {
    vec4 albedo = texture2D(texture, texCoord) * tint;
    if (albedo.a < 0.02) {
        discard;
    }

    vec2 light = texture2D(lightmap, lightCoord).xy;
    vec4 colour = albedo;

    // Sun and moon diffuse, with the mod's violet cast when reality is low. The mod's own client
    // writes the reality number into the fog colour, so the pack reads it back out here.
    vec3 sunDir = normalize(sunPosition);
    float diffuse = max(0.0, dot(viewNormal, sunDir));
    vec3 sunUp = sunPosition.y > 0.0 ? vec3(1.0, 0.94, 0.82) : vec3(0.55, 0.62, 0.85);
    colour.rgb *= mix(vec3(0.10, 0.11, 0.16), sunUp * 1.05, light.y);
    colour.rgb += sunUp * diffuse * light.y * 0.12 * (1.0 - rainStrength * 0.6);

    // Emissive blocks: everything the mod lights up stays lit, and gains a bloom-ready lift.
    if (materialId > 0.5) {
        colour.rgb *= 1.35;
    }

    // Wetness darkens and sheens the terrain during a dimensional storm.
    colour.rgb *= 1.0 - wetness * 0.25;

    // Underwater and in the fog dimensions, the ambient goes cold and violet.
    if (isEyeInWater == 1) {
        colour.rgb *= vec3(0.62, 0.78, 1.0);
    }

    gl_FragData[0] = colour;
    gl_FragData[1] = vec4(light, 0.0, 1.0);
    gl_FragData[2] = vec4(normalize(viewNormal) * 0.5 + 0.5, 1.0);
}
