#version 120
uniform sampler2D texture;
varying vec2 texcoord;
varying vec4 glcolor;
void main() {
    vec4 color = texture2D(texture, texcoord) * glcolor;
    if (color.a < 0.1) discard; // leaves and grass cast dappled, cut-out shadows
    gl_FragData[0] = color;
}
