// 0.17 Sift lit pass (like gbuffers_plain, with the same subtle SIFT_DIM_FOG biome fog) that also writes
// the lightmap (colortex1) and world normal (colortex2) for the Sift composite's shadows and lighting.
// SIFT_PASS: 0 = world geometry (receives shadows), 1 = hand (never shadowed).
uniform sampler2D texture;
uniform sampler2D lightmap;
uniform vec4 entityColor;
uniform vec3 fogColor;
uniform float far;
varying vec2 texcoord;
varying vec2 lmcoord;
varying vec4 glcolor;
varying float viewDist;
varying vec3 worldNormal;
/* DRAWBUFFERS:012 */
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
    gl_FragData[1] = vec4(lmcoord, 0.0, 1.0);
#if SIFT_PASS == 1
    gl_FragData[2] = vec4(worldNormal * 0.5 + 0.5, 0.0);
#else
    gl_FragData[2] = vec4(worldNormal * 0.5 + 0.5, 1.0);
#endif
}
