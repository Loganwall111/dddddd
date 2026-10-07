#version 120
// Sun shadow map pass (overworld only).
#include "/lib/distort.glsl"
varying vec2 texcoord;
varying vec4 glcolor;
void main() {
    gl_Position = ftransform();
    gl_Position.xyz = distortShadow(gl_Position.xyz);
    texcoord = (gl_TextureMatrix[0] * gl_MultiTexCoord0).xy;
    glcolor = gl_Color;
}
