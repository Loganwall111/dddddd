#version 150

// The Reality Scanner's readout, drawn over the world.
//
// A survey tool should not look like a weapon: this is a wireframe grid projected onto everything
// the player can see, a sweep line that runs up the frame, and a tint that tells the player what
// the reading means without them having to read a number. The Void Lens uses the same pass with
// different parameters — it is the same instrument, pointed at something else.

uniform float Time;
uniform float Strength;
uniform float Reality;
uniform float Mode;

in vec2 texCoord;
in vec4 vertexColor;
out vec4 fragColor;

float hash21(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
}

void main() {
    vec2 uv = texCoord;
    float strength = clamp(Strength, 0.0, 1.0);

    // Perspective grid: the further up the screen, the tighter the lines get, which sells the idea
    // that the grid is on the ground rather than on the glass.
    float depth = 1.0 / max(0.06, uv.y);
    float gridX = abs(fract((uv.x - 0.5) * depth * 1.6) - 0.5);
    float gridY = abs(fract(depth * 0.55 + Time * 0.02) - 0.5);
    float grid = (1.0 - smoothstep(0.0, 0.02, gridX)) + (1.0 - smoothstep(0.0, 0.03, gridY));
    grid *= (1.0 - uv.y * 0.75);

    // Sweep line, running up the frame.
    float sweep = 1.0 - smoothstep(0.0, 0.035, abs(uv.y - fract(Time * 0.25)));
    float sweepGlow = (1.0 - smoothstep(0.0, 0.22, abs(uv.y - fract(Time * 0.25)))) * 0.25;

    // Reality tint: the scanner reports the world's condition through its own colour.
    vec3 tint;
    if (Reality > 0.8) {
        tint = vec3(0.35, 0.85, 1.0);
    } else if (Reality > 0.6) {
        tint = vec3(1.0, 0.85, 0.45);
    } else if (Reality > 0.4) {
        tint = vec3(1.0, 0.55, 0.30);
    } else if (Reality > 0.2) {
        tint = vec3(1.0, 0.35, 0.35);
    } else {
        tint = vec3(0.78, 0.45, 1.0);
    }

    // Lens mode reads the *other* side, so it is colder and adds a vignette that frames the view.
    if (Mode > 0.5) {
        tint = mix(tint, vec3(0.55, 0.62, 0.95), 0.6);
        float vignette = pow(length((uv - 0.5) * 1.7), 3.0);
        fragColor = vec4(tint * (grid * 0.35 + sweepGlow) + vec3(0.02, 0.02, 0.06) * vignette,
                         clamp((grid * 0.25 + sweep * 0.5 + sweepGlow) * strength, 0.0, 1.0));
        return;
    }

    // A very faint wash so the whole frame is visibly "in the scanner", not just the lines.
    float wash = 0.06;
    float alpha = clamp((grid * 0.35 + sweep * 0.6 + sweepGlow) * strength + wash * strength, 0.0, 1.0);
    vec3 colour = tint * (grid * 0.5 + sweep * 0.9 + sweepGlow) + tint * wash;

    // Flicker, because a field instrument with a bad power cell should flicker.
    float flicker = 0.85 + 0.15 * hash21(vec2(floor(Time * 12.0), 1.0));
    fragColor = vec4(colour * flicker, alpha * flicker);
}
