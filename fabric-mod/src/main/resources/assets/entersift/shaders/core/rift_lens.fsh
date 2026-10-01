#version 330
#extension GL_ARB_separate_shader_objects : require
#include <minecraft:globals.glsl>
#include <minecraft:dynamictransforms.glsl>

uniform sampler2D Sampler0;
layout(location = 0) in vec4 riftData;
layout(location = 1) in vec3 worldRay;
layout(location = 2) in float sphericalVertexDistance;
layout(location = 3) in float cylindricalVertexDistance;
layout(location = 0) out vec4 fragColor;

void main() {
    vec2 p = riftData.rg * 2.0 - 1.0;
    float radius = length(p);
    float envelope = (1.0-smoothstep(0.65,1.0,radius)) * smoothstep(0.0,0.25,radius);
    if (envelope < 0.002) discard;
    vec2 size = vec2(textureSize(Sampler0,0));
    vec2 uv = gl_FragCoord.xy / size;
    float time = GameTime * 1200.0;
    // Bend actual opaque world pixels behind the rift, not a tinted rectangle.
    vec2 offset = vec2(sin(p.y*10.0-time*1.4), cos(p.x*8.0+time)) * 8.0 * envelope / size;
    vec2 inset = vec2(1.0) / size;
    vec3 color = texture(Sampler0, clamp(uv+offset,inset,1.0-inset)).rgb;
    fragColor = vec4(color, envelope * 0.65) * ColorModulator;
}
