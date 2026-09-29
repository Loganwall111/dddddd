#version 120
// The Sift is rendered entirely by the Enter the Sift mod: this pack is a pure passthrough there.
uniform sampler2D colortex0;
varying vec2 texcoord;
void main() {
    gl_FragData[0] = texture2D(colortex0, texcoord);
}
