#version 330
#extension GL_ARB_separate_shader_objects : require

// 0.18 Enter the Sift: warp-tunnel sphere around the camera (rift tunnel dimension).
// Vertex colour carries the world direction of the vertex from the camera: rgb = dir * 0.5 + 0.5.

#include <minecraft:fog.glsl>
#include <minecraft:projection.glsl>
#include <minecraft:dynamictransforms.glsl>

layout(location = 0) in vec3 Position;
layout(location = 1) in vec4 Color;

layout(location = 0) out vec4 dirData;

void main() {
    gl_Position = ProjMat * ModelViewMat * vec4(Position, 1.0);
    dirData = Color;
}
