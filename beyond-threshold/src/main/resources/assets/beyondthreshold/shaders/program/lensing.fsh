#version 150

// BEYOND THE THRESHOLD — real gravitational lensing post pass.
// Up to four singularities bend the rendered frame: einstein-ring
// deflection, frame-dragging swirl, doppler-tinted accretion glow,
// chromatic aberration near the horizon and a pure-black core.

uniform sampler2D DiffuseSampler;
in vec2 texCoord;
out vec4 fragColor;

uniform float BttTime;
uniform float BttIntensity;
uniform vec2 BttRes;
uniform int BttHoleCount;
uniform vec4 BttHole0;
uniform vec4 BttHole1;
uniform vec4 BttHole2;
uniform vec4 BttHole3;

vec4 hole(int i) {
    if (i == 0) return BttHole0;
    if (i == 1) return BttHole1;
    if (i == 2) return BttHole2;
    return BttHole3;
}

mat2 rot2(float a) {
    float c = cos(a), s = sin(a);
    return mat2(c, -s, s, c);
}

void main() {
    vec2 uv = texCoord;
    float aspect = BttRes.x / max(BttRes.y, 1.0);

    vec2 bend = vec2(0.0);
    float glow = 0.0;
    float core = 0.0;
    float ring = 0.0;

    for (int i = 0; i < 4; i++) {
        if (i >= BttHoleCount) break;
        vec4 h = hole(i);
        if (h.z <= 0.001) continue;

        vec2 d = uv - h.xy;
        d.x *= aspect;
        float r = max(length(d), 1e-4);
        vec2 dir = d / r;

        float ein = max(h.w, 0.001);
        float str = h.z * BttIntensity;

        // schwarzschild-ish deflection: alpha ~ ein^2 / r
        float defl = (ein * ein * str) / r;
        // frame dragging swirl, strongest near the photon sphere
        float sw = str * 0.9 * ein / max(r, ein * 0.4);
        sw += 0.15 * str * sin(BttTime * 2.0 + r * 40.0) * ein / max(r, ein);
        dir = rot2(sw) * dir;

        bend += dir * min(defl, r * 0.92);

        // accretion glow + photon ring
        float x = r / ein;
        glow += str * 0.55 / (1.0 + x * x * x * x);
        ring += str * exp(-abs(x - 1.05) * 9.0);
        // event horizon
        core = max(core, 1.0 - smoothstep(ein * 0.30, ein * 0.42, r));
    }

    vec2 o = bend * 0.5;
    // chromatic splitting near the horizon
    float cr = texture(DiffuseSampler, clamp(uv - o * 1.18, 0.0, 1.0)).r;
    float cg = texture(DiffuseSampler, clamp(uv - o, 0.0, 1.0)).g;
    float cb = texture(DiffuseSampler, clamp(uv - o * 0.84, 0.0, 1.0)).b;
    vec3 col = vec3(cr, cg, cb);

    // doppler beaming: one side of the disk burns blue-white, the other deep orange
    vec3 diskCol = mix(vec3(1.0, 0.45, 0.12), vec3(0.75, 0.85, 1.0),
            0.5 + 0.5 * sin(atan(uv.y - 0.5, (uv.x - 0.5) * aspect) + BttTime * 0.4));
    col += glow * diskCol * 0.45;
    col += ring * vec3(1.0, 0.85, 0.6) * 0.9;
    col = mix(col, vec3(0.0), clamp(core, 0.0, 1.0));

    fragColor = vec4(col, 1.0);
}
