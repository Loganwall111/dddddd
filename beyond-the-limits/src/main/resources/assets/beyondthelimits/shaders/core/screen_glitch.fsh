#version 150

// The interference pass: everything the world does to the player's own perception.
//
// This is an overlay, not a post-process. It cannot read the frame — that would require owning the
// world framebuffer, which a mod must never assume it has (Iris, Sodium and other mods all take
// turns owning it). So instead of distorting the image, it lays down the *evidence* of distortion:
// horizontal tear bands, chromatic ghosting, scanline wash, darkening, and per-mode shapes. Drawn
// late, over everything, it reads the same way at a fraction of the cost and with none of the
// collisions.
//
// Modes are supplied by PostEffects: 1 noclip, 2 rift wash, 3 storm, 4 observer, 5 black sun,
// 6 dementia spike, 7 mirror, 8 memory, 9 raw flash, 10 evolution.

uniform float Time;
uniform float Mode;
uniform float Strength;
uniform float Reality;
uniform float Dementia;
uniform float Progress;
uniform float Band;
uniform float Shake;

in vec2 texCoord;
in vec4 vertexColor;
out vec4 fragColor;

float hash21(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
}

float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), u.x),
               mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), u.x), u.y);
}

void main() {
    vec2 uv = texCoord;
    // The whole pass is nudged by the shake value, which is what makes a hit feel like it moved.
    uv += vec2(noise(vec2(Time * 9.0, 0.0)) - 0.5, noise(vec2(0.0, Time * 11.0)) - 0.5) * Shake * 0.05;

    float strength = clamp(Strength, 0.0, 1.0) * clamp(vertexColor.a, 0.0, 1.0);
    vec3 colour = vec3(0.0);
    float alpha = 0.0;

    // Tear bands: horizontal strips that jump sideways. Present in every mode, scaled by Band.
    float bandRow = floor(uv.y * 46.0 + Time * 3.0);
    float tearChance = hash21(vec2(bandRow, floor(Time * 6.0)));
    float tear = step(0.86 - Band * 0.35, tearChance);
    float tearOffset = (hash21(vec2(bandRow, 7.0)) - 0.5) * 0.12 * Band;

    // Chromatic ghosting: the same band, drawn three times in red, green and blue, offset.
    vec3 ghost = vec3(0.0);
    ghost.r = noise(vec2(uv.x + tearOffset + 0.004, uv.y * 90.0));
    ghost.g = noise(vec2(uv.x + tearOffset, uv.y * 90.0));
    ghost.b = noise(vec2(uv.x + tearOffset - 0.004, uv.y * 90.0));
    ghost = pow(ghost, vec3(3.0)) * tear;
    colour += ghost * vec3(0.9, 0.85, 1.0) * 1.4;
    alpha += length(ghost) * 0.9;

    // Scanline wash and a rolling refresh bar.
    float scan = 0.5 + 0.5 * sin(uv.y * 900.0 + Time * 20.0);
    float roll = smoothstep(0.0, 0.08, abs(fract(uv.y - Time * 0.12) - 0.5));
    colour += vec3(0.06, 0.08, 0.10) * (1.0 - scan) * strength;
    alpha += (1.0 - scan) * 0.10 * strength + (1.0 - roll) * 0.05 * strength;

    // Per-mode body colour and shape.
    vec3 tint = vec3(0.55, 0.35, 0.85);
    float body = 0.35;

    if (Mode < 1.5) {
        // NOCLIP: falling out of the world. Violet wash, heavy bands, the frame closing in.
        tint = vec3(0.62, 0.20, 0.95);
        body = 0.42;
        float rush = pow(1.0 - uv.y, 2.0) * 0.4;
        colour += tint * rush;
        alpha += rush * strength;
    } else if (Mode < 2.5) {
        // RIFT WASH: stepping through a tear. White-violet blowout that fades with Progress.
        tint = vec3(0.85, 0.70, 1.0);
        body = 0.75 * (1.0 - Progress);
    } else if (Mode < 3.5) {
        // STORM: rain on the lens and lightning in the clouds.
        tint = vec3(0.45, 0.55, 0.85);
        body = 0.20;
        float lightning = step(0.985, hash21(vec2(floor(Time * 3.0), 4.0)));
        colour += vec3(0.8, 0.85, 1.0) * lightning * 0.5;
        alpha += lightning * 0.4;
    } else if (Mode < 4.5) {
        // OBSERVER: something is looking at you. The edges darken, and the dark has a shape.
        tint = vec3(0.02, 0.0, 0.04);
        body = 0.55;
        vec2 centre = vec2(0.5 + 0.22 * sin(Time * 0.13), 0.62);
        float gaze = 1.0 - smoothstep(0.02, 0.30, length((uv - centre) * vec2(1.0, 1.6)));
        colour += vec3(0.9, 0.1, 0.15) * gaze * 0.25;
        alpha += gaze * 0.35 * strength;
    } else if (Mode < 5.5) {
        // BLACK SUN: everything falls toward a point that is not the sun.
        tint = vec3(0.0, 0.0, 0.0);
        body = 0.62;
        float pull = 1.0 - smoothstep(0.05, 0.85, length(uv - vec2(0.5, 0.72)));
        colour += vec3(0.9, 0.25, 0.12) * pow(1.0 - pull, 3.0) * 0.5;
        alpha += (1.0 - pull) * 0.2 * strength;
    } else if (Mode < 6.5) {
        // DEMENTIA SPIKE: the world forgets itself for a moment. Heavy noise, purple bias.
        tint = vec3(0.45, 0.15, 0.75);
        body = 0.30 + Dementia * 0.5;
        float doubt = noise(uv * 40.0 + Time * 2.0);
        colour += vec3(0.5, 0.2, 0.8) * doubt * 0.4 * Dementia;
        alpha += doubt * 0.25 * Dementia;
    } else if (Mode < 7.5) {
        // MIRROR: the frame inhales toward the centre and comes back silver.
        tint = vec3(0.75, 0.82, 0.92);
        body = 0.30;
        vec2 mirrored = vec2(abs(uv.x - 0.5) * 2.0, uv.y);
        float seam = 1.0 - smoothstep(0.0, 0.06, abs(uv.x - 0.5));
        colour += vec3(0.9, 0.95, 1.0) * seam * 0.4;
        alpha += seam * 0.3 * strength;
    } else if (Mode < 8.5) {
        // MEMORY: gold motes drifting, and a warm light that does not come from anywhere.
        tint = vec3(1.0, 0.85, 0.45);
        body = 0.18;
        float mote = step(0.992, noise(uv * 30.0 + Time * 0.6));
        colour += vec3(1.0, 0.9, 0.6) * mote * 0.9;
        alpha += mote * 0.5 * strength;
    } else if (Mode < 9.5) {
        // RAW FLASH: a detonation, a death, a warhead. Almost all white.
        tint = vec3(1.0);
        body = 1.0;
        colour += vec3(1.0, 0.96, 0.9);
    } else {
        // EVOLUTION: the mobs have learned. Sickly green, and a heartbeat.
        tint = vec3(0.35, 0.85, 0.35);
        body = 0.22;
        float pulse = pow(0.5 + 0.5 * sin(Time * 2.4), 4.0);
        colour += vec3(0.4, 0.9, 0.4) * pulse * 0.35;
        alpha += pulse * 0.20 * strength;
    }

    colour += tint * body;
    alpha += body * 0.75;

    // Reality damage is always present underneath: a violet cast, turbulence, and a vignette that
    // closes in as the world gets worse.
    float damage = clamp(1.0 - Reality, 0.0, 1.0);
    float turbulence = noise(uv * 12.0 + Time * 0.7) * damage;
    colour += vec3(0.28, 0.05, 0.45) * turbulence * 0.35;
    alpha += turbulence * 0.20 * damage;

    float vignette = pow(length((uv - 0.5) * vec2(1.0, 1.0)) * 1.55, 2.5);
    colour += vec3(0.05, 0.0, 0.08) * vignette;
    alpha += vignette * (0.35 * damage + 0.15 * Dementia);

    alpha *= strength;

    // A faint grain everywhere the pass is active, so even a weak effect is visibly *not* the game.
    float grain = (hash21(uv * 2048.0 + Time) - 0.5) * 0.05 * strength;
    fragColor = vec4(clamp(colour + grain, 0.0, 1.0), clamp(alpha, 0.0, 1.0));
}
