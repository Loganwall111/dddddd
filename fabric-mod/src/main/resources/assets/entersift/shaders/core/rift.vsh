#version 330
#extension GL_ARB_separate_shader_objects : require

// Rift core shader vertex stage. Position is transformed by the entity pose on the CPU and supplies
// a gentle 3D modulation direction to the animated membrane. Vertex colour carries rift face UVs and
// style/night bits; it does not represent a framebuffer copy or opaque destination view.

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
    gl_Position = ProjMat * ModelViewMat * vec4(Position, 1.0);
    riftData = Color;
    worldRay = Position;
    sphericalVertexDistance = fog_spherical_distance(Position);
    cylindricalVertexDistance = fog_cylindrical_distance(Position);
}
