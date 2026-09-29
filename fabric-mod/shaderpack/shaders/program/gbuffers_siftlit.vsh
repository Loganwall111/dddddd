#version 120
// 0.17 Sift lit pass: gbuffers_plain plus the world normal, so the Sift composite can light and shadow it.
uniform mat4 gbufferModelViewInverse;
varying vec2 texcoord;
varying vec2 lmcoord;
varying vec4 glcolor;
varying float viewDist;
varying vec3 worldNormal;
void main() {
    vec4 view = gl_ModelViewMatrix * gl_Vertex;
    gl_Position = gl_ProjectionMatrix * view;
    viewDist = length(view.xyz);
    texcoord = (gl_TextureMatrix[0] * gl_MultiTexCoord0).xy;
    lmcoord = (gl_TextureMatrix[1] * gl_MultiTexCoord1).xy;
    glcolor = gl_Color;
    worldNormal = normalize(mat3(gbufferModelViewInverse) * (gl_NormalMatrix * gl_Normal));
}
