// Water surface simulation, shared by gbuffers_water and composite.
// Two travelling wave trains plus ripple noise: cheap, and it reads as moving water in a still frame
// because the normals disagree with each other across the surface.

vec3 waveNormal(vec3 worldPos, float time, float intensity) {
    vec2 p = worldPos.xz * 0.55;
    float wave1 = sin(p.x * 1.1 + time * 1.4) * cos(p.y * 0.9 - time * 1.1);
    float wave2 = sin(p.x * 0.5 - p.y * 0.7 + time * 0.8);
    float ripple = fbm2(p * 2.6 + vec2(time * 0.25, time * 0.18), 3) - 0.5;
    float dx = cos(p.x * 1.1 + time * 1.4) * 1.1 * cos(p.y * 0.9 - time * 1.1)
             + cos(p.x * 0.5 - p.y * 0.7 + time * 0.8) * 0.5
             + ripple * 2.0;
    float dy = -sin(p.x * 1.1 + time * 1.4) * sin(p.y * 0.9 - time * 1.1) * 0.9
             + cos(p.x * 0.5 - p.y * 0.7 + time * 0.8) * -0.7
             + ripple * 1.6;
    return normalize(vec3(-dx * intensity, 1.0, -dy * intensity));
}

// Water fades from clear to opaque by depth, as it does in nature and in the mod's pool rooms.
vec3 waterAbsorption(vec3 colour, float depth, vec3 absorb) {
    return colour * exp(-depth * absorb);
}
