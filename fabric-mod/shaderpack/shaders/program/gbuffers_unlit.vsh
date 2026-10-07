#version 120
// Unlit emissive/sky passes (sun, moon, glowing eyes, beacon beams, enchant glint).
varying vec2 texcoord;
varying vec4 glcolor;
void main() {
    gl_Position = ftransform();
    texcoord = (gl_TextureMatrix[0] * gl_MultiTexCoord0).xy;
    glcolor = gl_Color;
}
