#version 150

// The rift.
//
// A tear is drawn as concentric rings, and this shader decides what is inside them. The ring
// fraction arrives in texCoord.x (0 at the core, 1 at the outer rim) and the angle in texCoord.y,
// so everything here is written in polar space: the core is a rotating throat, the mid ring is
// a band of dragged light, and the rim dissolves to nothing where the geometry ends — which is
// what stops a rift from looking like a decal and starts it looking like a hole.

uniform float Time;
uniform float Seed;
uniform float Variant;
uniform float Intensity;
uniform float Reality;
uniform float Seamless;
uniform float Age;

in vec2 texCoord;
in vec4 vertexColor;
out vec4 fragColor;

float hash11(float p) {
    p = fract(p * 0.1031);
    p *= p + 33.33;
    p *= p + p;
    return fract(p);
}

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

float fbm(vec2 p) {
    float total = 0.0;
    float amplitude = 0.5;
    for (int i = 0; i < 5; i++) {
        total += noise(p) * amplitude;
        p *= 2.07;
        amplitude *= 0.5;
    }
    return total;
}

// Per-variant palette. These are the colours of the world on the other side of the tear.
vec3 paletteFor(float variant, float depth) {
    if (variant < 0.5) {
        // Overworld shard: violet through to white-hot at the core.
        return mix(vec3(0.35, 0.09, 0.72), vec3(0.95, 0.86, 1.0), depth);
    } else if (variant < 1.5) {
        // Backrooms: the sick yellow of a room with no windows.
        return mix(vec3(0.62, 0.55, 0.24), vec3(1.0, 0.96, 0.72), depth);
    } else if (variant < 2.5) {
        // Foglands: drained grey-white.
        return mix(vec3(0.55, 0.60, 0.62), vec3(0.97, 0.99, 1.0), depth);
    } else if (variant < 3.5) {
        // Codescape: terminal green on black.
        return mix(vec3(0.02, 0.35, 0.12), vec3(0.35, 1.0, 0.45), depth);
    } else if (variant < 4.5) {
        // Mirrorworld: cold silver.
        return mix(vec3(0.42, 0.48, 0.58), vec3(0.92, 0.96, 1.0), depth);
    }
    // Collision: two worlds at once, red and black.
    return mix(vec3(0.35, 0.03, 0.03), vec3(1.0, 0.42, 0.18), depth);
}

void main() {
    float rim = clamp(texCoord.x, 0.0, 1.0);
    float angle = texCoord.y * 3.14159265;
    float seed = Seed * 6.2831853;

    // Everything turns, and the turn rate rises as reality falls: an unstable world tears faster.
    float spin = Time * (0.35 + (1.0 - Reality) * 1.1);
    float radial = rim * 6.0 - spin * 0.8 + seed;

    // The throat: noise dragged into a spiral, which is what reads as "space is being pulled in".
    vec2 polar = vec2(angle * 2.2 + radial, rim * 5.0 - spin * 0.5 + seed);
    float swirl = fbm(polar + vec2(fbm(polar * 0.7) * 1.4, 0.0));
    float throat = smoothstep(0.15, 0.95, swirl + (1.0 - rim) * 0.45);

    // Bands dragged around the rim at different speeds — the light of the other side, smeared.
    float band = 0.5 + 0.5 * sin(radial * 2.3 + swirl * 5.0 + seed * 3.0);

    // Torn rim: the tear is not a circle, it is a cut, and the cut is jagged.
    float jag = fbm(vec2(angle * 3.0 + seed * 4.0, Time * 0.35));
    float rimFade = 1.0 - smoothstep(0.72 + jag * 0.18, 1.0, rim);

    // Seamless gates are doorways rather than wounds: steadier, brighter, less torn.
    float steadiness = mix(1.0, 0.45, Seamless);
    float tearing = mix(1.0, 0.35, Seamless);

    float depth = clamp(throat * 0.6 + band * 0.4, 0.0, 1.0);
    vec3 colour = paletteFor(Variant, depth);

    // A hot white core, the part of a rift that behaves like light.
    colour += vec3(0.55, 0.42, 0.90) * pow(max(0.0, 1.0 - rim * 2.6), 3.0) * (1.0 - Seamless * 0.4);

    // Flicker: rifts are not steady objects.
    float flicker = 0.85 + 0.15 * sin(Time * (3.0 + Seed * 4.0) + seed);
    float alpha = vertexColor.a * Intensity * rimFade * flicker * steadiness * (0.55 + 0.7 * depth);

    // Young rifts are thin and tight; old ones have had time to spread.
    alpha *= mix(0.55, 1.0, clamp(Age * 2.0, 0.0, 1.0));

    // The very outside edge vanishes completely, so no quad boundary is ever visible.
    alpha *= 1.0 - smoothstep(0.94, 1.0, rim);

    colour *= mix(1.0, 0.75, tearing * (1.0 - jag));
    fragColor = vec4(colour * vertexColor.rgb, clamp(alpha, 0.0, 1.0));
}
