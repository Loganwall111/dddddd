#version 120

#include "/lib/util.glsl"

uniform mat4 gbufferModelView;
uniform mat4 gbufferModelViewInverse;
uniform vec3 cameraPosition;
uniform float frameTimeCounter;
uniform int isEyeInWater;

attribute vec4 mc_Entity;

varying vec2 texCoord;
varying vec2 lightCoord;
varying vec4 tint;
varying vec3 worldPos;
varying vec3 viewNormal;
varying float materialId;
varying float distanceToCamera;

void main() {
    texCoord = (gl_TextureMatrix[0] * gl_MultiTexCoord0).xy;
    lightCoord = (gl_TextureMatrix[1] * gl_MultiTexCoord1).xy;
    tint = gl_Color;
    gl_Position = ftransform();

    vec4 viewPos = gl_ModelViewMatrix * gl_Vertex;
    worldPos = (gbufferModelViewInverse * viewPos).xyz + cameraPosition;
    viewNormal = normalize(gl_NormalMatrix * gl_Normal);
    distanceToCamera = length(viewPos.xyz);

    // mc_Entity.x carries the block id a shaderpack can react to; the mod's emissive blocks are
    // declared in shaders.properties so they glow here as well as in the game.
    materialId = mc_Entity.x;
}
