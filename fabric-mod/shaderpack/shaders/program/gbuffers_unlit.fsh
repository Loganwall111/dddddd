#version 120
uniform sampler2D texture;
varying vec2 texcoord;
varying vec4 glcolor;
/* DRAWBUFFERS:0 */
void main() {
    gl_FragData[0] = texture2D(texture, texcoord) * glcolor;
}
