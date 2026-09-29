#version 120
// 0.13 plain textured pass for the Sift (and the root set used by the Nether/End): vanilla texture x
// vertex colour x lightmap. Before 0.13 these folders had no textured programs, so Iris fell back to
// gbuffers_basic (vertex colour only) and the whole Sift turned white under the pack.
varying vec2 texcoord;
varying vec2 lmcoord;
varying vec4 glcolor;
varying float viewDist;
void main() {
    vec4 view = gl_ModelViewMatrix * gl_Vertex;
    gl_Position = gl_ProjectionMatrix * view;
    viewDist = length(view.xyz);
    texcoord = (gl_TextureMatrix[0] * gl_MultiTexCoord0).xy;
    lmcoord = (gl_TextureMatrix[1] * gl_MultiTexCoord1).xy;
    glcolor = gl_Color;
}
