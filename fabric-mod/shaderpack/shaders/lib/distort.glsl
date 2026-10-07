// Shared shadow-map distortion (more resolution near the player). Used by shadow.vsh and composite.
vec3 distortShadow(vec3 p) {
    float f = length(p.xy) * 0.88 + 0.12;
    return vec3(p.xy / f, p.z * 0.2);
}
