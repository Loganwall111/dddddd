#version 120

#include "/lib/util.glsl"
#include "/lib/water.glsl"

uniform sampler2D texture;
uniform sampler2D lightmap;
uniform vec3 cameraPosition;
uniform vec3 sunPosition;
uniform float frameTimeCounter;
uniform float rainStrength;
uniform float far;

varying vec2 texCoord;
varying vec2 lightCoord;
varying vec4 tint;
varying vec3 worldPos;
varying vec3 waveNormalOut;
varying float distanceToCamera;

/* DRAWBUFFERS:0123 */

void main() {
    vec4 albedo = texture2D(texture, texCoord) * tint;
    vec2 light = texture2D(lightmap, lightCoord).xy;

    // Depth from the camera to the water surface drives the absorption, which is what makes the
    // Backrooms' pool rooms read as deep water rather than as a blue sheet.
    float depth = min(distanceToCamera / far, 1.0);
    vec3 deep = waterAbsorption(vec3(0.05, 0.16, 0.22), depth * 14.0, vec3(1.6, 0.9, 0.7));

    vec3 sunDir = normalize(sunPosition);
    float specular = pow(max(0.0, dot(waveNormalOut, sunDir)), 48.0);
    float fresnel = pow(1.0 - max(0.0, dot(waveNormalOut, normalize(-vec3(gl_FragCoord.xy, 1.0)))), 4.0);

    vec3 colour = mix(deep * 1.8, vec3(0.35, 0.62, 0.78), fresnel * 0.6);
    colour += vec3(1.0, 0.96, 0.86) * specular * (1.0 - rainStrength) * light.y;
    colour *= mix(0.25, 1.0, light.y);

    gl_FragData[0] = vec4(colour, albedo.a);
    gl_FragData[1] = vec4(light, 0.0, 1.0);
    gl_FragData[2] = vec4(waveNormalOut * 0.5 + 0.5, 1.0);
    gl_FragData[3] = vec4(fresnel, depth, 0.0, 1.0);
}
