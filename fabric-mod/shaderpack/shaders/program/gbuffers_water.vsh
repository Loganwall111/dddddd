#version 120
// Water pass: passes world position/normal so the fragment stage can find falling water.
attribute vec4 mc_Entity;
uniform mat4 gbufferModelViewInverse;
uniform vec3 cameraPosition;
varying vec2 texcoord;
varying vec2 lmcoord;
varying vec4 glcolor;
varying vec3 worldPos;
varying vec3 worldNormal;
varying float isWater;
void main() {
    gl_Position = ftransform();
    texcoord = (gl_TextureMatrix[0] * gl_MultiTexCoord0).xy;
    lmcoord = (gl_TextureMatrix[1] * gl_MultiTexCoord1).xy;
    glcolor = gl_Color;
    vec4 viewPos = gl_ModelViewMatrix * gl_Vertex;
    worldPos = (gbufferModelViewInverse * viewPos).xyz + cameraPosition;
    worldNormal = normalize(mat3(gbufferModelViewInverse) * (gl_NormalMatrix * gl_Normal));
    isWater = mc_Entity.x > 10000.5 && mc_Entity.x < 10001.5 ? 1.0 : 0.0;
}
