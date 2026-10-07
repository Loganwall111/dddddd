// Dimension fog: the vanilla fog colour of the current biome (0.13 subtle per-biome purple / green /
// amber haze in the Sift), faded in over the last part of the render distance. SIFT_DIM_FOG = 0 turns it off.
uniform sampler2D texture;
uniform sampler2D lightmap;
uniform vec4 entityColor;
uniform vec3 fogColor;
uniform float far;
varying vec2 texcoord;
varying vec2 lmcoord;
varying vec4 glcolor;
varying float viewDist;
/* DRAWBUFFERS:0 */
void main() {
    vec4 color = texture2D(texture, texcoord) * glcolor;
    if (color.a < 0.1) discard;
#ifdef SIFT_ENTITY
    color.rgb = mix(color.rgb, entityColor.rgb, entityColor.a);
#endif
    color.rgb *= texture2D(lightmap, lmcoord).rgb;
    if (SIFT_DIM_FOG > 0.0) {
        float fog = smoothstep(far * 0.25, far * 1.0, viewDist) * SIFT_DIM_FOG;
        color.rgb = mix(color.rgb, fogColor, clamp(fog, 0.0, 1.0));
    }
    gl_FragData[0] = color;
}
