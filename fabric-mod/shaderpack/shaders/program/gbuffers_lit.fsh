// SIFT_PASS: 0 = world geometry (receives shadows), 1 = hand (never shadowed/blurred).
uniform sampler2D texture;
uniform sampler2D lightmap;
uniform vec4 entityColor;
varying vec2 texcoord;
varying vec2 lmcoord;
varying vec4 glcolor;
varying vec3 worldNormal;
/* DRAWBUFFERS:012 */
void main() {
    vec4 color = texture2D(texture, texcoord) * glcolor;
    if (color.a < 0.1) discard;
#ifdef SIFT_ENTITY
    color.rgb = mix(color.rgb, entityColor.rgb, entityColor.a); // hurt flash
#endif
    color.rgb *= texture2D(lightmap, lmcoord).rgb;
    gl_FragData[0] = color;
    gl_FragData[1] = vec4(lmcoord, 0.0, 1.0);
#if SIFT_PASS == 1
    gl_FragData[2] = vec4(worldNormal * 0.5 + 0.5, 0.0);
#else
    gl_FragData[2] = vec4(worldNormal * 0.5 + 0.5, 1.0);
#endif
}
