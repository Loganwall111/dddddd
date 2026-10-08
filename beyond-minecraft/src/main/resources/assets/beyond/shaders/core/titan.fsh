#version 150

// The Living World Titan, fragment stage. The surface is the world's own texture atlas sampled at the
// block the voxel was cut from, lit by a real face normal (derived from the deformed world position,
// so the lighting follows the animation instead of the rest pose), with the eyes exempt from all of
// it: the eyes are pure, unshaded, full-strength red whatever the sun, fog or lightmap are doing.

uniform sampler2D Sampler0;
uniform float Time;

in vec2 texCoord;
in vec4 skin;
in vec3 worldPos;

out vec4 fragColor;

void main() {
    vec4 texel = texture(Sampler0, texCoord);
    // A voxel carries the world's own texture. Where the atlas has nothing to give — an animated or
    // missing sprite — the body still stands: it falls back to its baked face shade rather than
    // vanishing, because an invisible colossus is a bug and a plain one is not.
    vec3 base = texel.a < .1 ? vec3(.62) : texel.rgb;
    vec3 normal = normalize(cross(dFdx(worldPos), dFdy(worldPos)));
    vec3 sun = normalize(vec3(-.42, .78, .31));
    float lift = max(dot(normal, sun), 0.0);
    float sky = .40 + .32 * max(normal.y, 0.0);
    vec3 stone = base * skin.a * (sky + lift * .78);
    // A body this big carries its own weather: a slow breath of light moves across the blocks.
    stone *= .95 + .05 * sin(Time * .6 + worldPos.y * .02);
    // The eyes are the one part of the world that the light does not touch.
    vec3 eye = vec3(1.0, 0.0, 0.0) * (0.86 + 0.14 * sin(Time * 2.3));
    fragColor = vec4(skin.b > .5 ? eye : stone, 1.0);
}
