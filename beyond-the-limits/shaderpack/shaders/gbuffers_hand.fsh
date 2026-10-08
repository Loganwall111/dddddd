#version 120

uniform sampler2D texture;

varying vec2 texCoord;
varying vec4 tint;

/* DRAWBUFFERS:0 */

void main() {
    vec4 colour = texture2D(texture, texCoord) * tint;
    if (colour.a < 0.02) discard;
    gl_FragData[0] = colour;
}
