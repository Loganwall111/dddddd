#version 120

#include "/lib/util.glsl"
#include "/lib/water.glsl"

uniform mat4 gbufferModelViewInverse;
uniform vec3 cameraPosition;
uniform float frameTimeCounter;

varying vec2 texCoord;
varying vec2 lightCoord;
varying vec4 tint;
varying vec3 worldPos;
varying vec3 waveNormalOut;
varying float distanceToCamera;

void main() {
    texCoord = (gl_TextureMatrix[0] * gl_MultiTexCoord0).xy;
    lightCoord = (gl_TextureMatrix[1] * gl_MultiTexCoord1).xy;
    tint = gl_Color;

    vec4 viewPos = gl_ModelViewMatrix * gl_Vertex;
    vec3 world = (gbufferModelViewInverse * viewPos).xyz + cameraPosition;
    worldPos = world;
    waveNormalOut = waveNormal(world, frameTimeCounter, WATER_WAVE_STRENGTH);
    distanceToCamera = length(viewPos.xyz);

    // The surface itself is displaced: the waves are geometry, not just a normal map.
    vec3 displaced = gl_Vertex.xyz;
    gl_Position = gl_ProjectionMatrix * gl_ModelViewMatrix * vec4(displaced, 1.0);
    gl_Position = ftransform();
}
