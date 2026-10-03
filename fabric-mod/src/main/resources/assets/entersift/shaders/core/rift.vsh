#version 330
#extension GL_ARB_separate_shader_objects : require

// The rift canvas is one world-positioned quad. Position arrives camera-relative and world-oriented
// (the entity pose is applied on the CPU), so it is the view ray the fragment shader samples.
// A 0.004 tremor and a low-frequency bow are the only geometric motion; the silhouette is a shader.

#include <minecraft:fog.glsl>
#include <minecraft:projection.glsl>
#include <minecraft:dynamictransforms.glsl>

layout(location = 0) in vec3 Position;
layout(location = 1) in vec4 Color;

layout(location = 0) out vec4 riftData;
layout(location = 1) out vec3 worldRay;
layout(location = 2) out float sphericalVertexDistance;
layout(location = 3) out float cylindricalVertexDistance;

void main() {
    float tremor = 0.004 * sin(GameTime * 900.0 + Position.y * 5.0 + Position.x * 3.0);
    float edge = length(Color.rg - vec2(0.5));
    float bow = sin(Position.y * 1.9 + GameTime * 40.0) * 0.035 * edge;
    vec3 pos = Position + vec3(bow, 0.0, tremor);
    gl_Position = ProjMat * ModelViewMat * vec4(pos, 1.0);
    riftData = Color;
    worldRay = pos;
    sphericalVertexDistance = fog_spherical_distance(pos);
    cylindricalVertexDistance = fog_cylindrical_distance(pos);
}
