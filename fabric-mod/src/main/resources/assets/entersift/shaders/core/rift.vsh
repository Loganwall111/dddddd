#version 330
#extension GL_ARB_separate_shader_objects : require

// 0.17 Enter the Sift: rift interior / lens halo vertex shader.
// Vertex colour is NOT a colour here. It carries rift data:
//   r, g = position on the rift face (0..1, interpolated per pixel)
//   b    = rift type ((type + 0.5) / 8)
//   a    = fade (growth / distance)

#include <minecraft:fog.glsl>
#include <minecraft:projection.glsl>
#include <minecraft:dynamictransforms.glsl>

layout(location = 0) in vec3 Position;
layout(location = 1) in vec4 Color;

layout(location = 0) out vec4 riftData;
layout(location = 1) out vec3 viewPos;
layout(location = 2) out float sphericalVertexDistance;
layout(location = 3) out float cylindricalVertexDistance;

void main() {
    vec4 view = ModelViewMat * vec4(Position, 1.0);
    gl_Position = ProjMat * view;
    riftData = Color;
    viewPos = view.xyz;
    sphericalVertexDistance = fog_spherical_distance(Position);
    cylindricalVertexDistance = fog_cylindrical_distance(Position);
}
