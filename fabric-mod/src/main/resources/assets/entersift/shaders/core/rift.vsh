#version 330
#extension GL_ARB_separate_shader_objects : require

// 0.20 Enter the Sift rift shader (clean slate).
// Position arrives camera-relative and world-oriented (the entity pose is applied on the CPU), so it IS
// the world-space view ray of the vertex. The fragment shader uses it to sample the destination by view
// direction: the window moves only with the camera's yaw and pitch and is seamless across every quad.
// Window vertices carry data in their colour: r, g = rift face position (0..1), b = view code (/16).

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
