#version 120
// 0.12: unlit vertex colour, written straight to colortex0 (no lightmap, no fog). The mod already
// bakes its lighting and fade into the colours, so any change here would distort the Sift sky.
varying vec4 glcolor;
/* DRAWBUFFERS:0 */
void main() {
    if (glcolor.a < 0.002) discard;
    gl_FragData[0] = glcolor;
}
