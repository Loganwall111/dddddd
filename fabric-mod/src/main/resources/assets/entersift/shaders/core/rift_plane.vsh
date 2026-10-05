#version 330
#extension GL_ARB_separate_shader_objects : require

// 0.41 screen-space rift plane (official recipe, item 2). One flat quad per rift; ALL of the
// presentation (jagged cross mask, hollow debris shells, white outlines, lensing, vortex) happens
// in the fragment shader. The vertex stage only converts 3D clip space to 2D screen coordinates
// and forwards the per-vertex rift data.

#include <minecraft:fog.glsl>
#include <minecraft:projection.glsl>
#include <minecraft:dynamictransforms.glsl>

layout(location = 0) in vec3 Position;
layout(location = 1) in vec4 Color;

layout(location = 0) out vec4 riftData;
layout(location = 1) out vec3 worldRay;
layout(location = 2) out float sphericalVertexDistance;
layout(location = 3) out float cylindricalVertexDistance;
layout(location = 4) out vec2 screenPos;

void main() {
    gl_Position = ProjMat * ModelViewMat * vec4(Position, 1.0);
    // Recipe item 2: clip space -> normalized 2D screen coordinates for the fragment lens pass.
    screenPos = gl_Position.xy / max(gl_Position.w, 0.00001) * 0.5 + 0.5;
    riftData = Color;
    worldRay = Position;
    sphericalVertexDistance = fog_spherical_distance(Position);
    cylindricalVertexDistance = fog_cylindrical_distance(Position);
}
