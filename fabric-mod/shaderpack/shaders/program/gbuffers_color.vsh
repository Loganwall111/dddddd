#version 120
// 0.12: position + colour passes (the Enter the Sift sky dome, aurora and rift frames, plus vanilla
// basic/line geometry). Iris maps the mod's pipelines here through its API.
varying vec4 glcolor;
void main() {
    gl_Position = ftransform();
    glcolor = gl_Color;
}
