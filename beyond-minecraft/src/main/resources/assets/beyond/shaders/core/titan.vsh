#version 150

// The Living World Titan. Every vertex of the colossus was cut from a block of the world it stands
// in, and every vertex carries its own skinning data in the colour channels:
//
//   red   - how strongly its bone pulls it (0 at the joint, 1 at the far end)
//   green - which bone it belongs to, as bone / 8
//   blue  - 1 when the voxel is one of the eyes, so the fragment shader can refuse to shade it
//   alpha - the face's baked shade (up faces bright, side faces dimmer, underside darkest)
//
// The pose itself is purely sinusoidal and lives here, so the mesh is uploaded once and the whole
// body walks, breathes and turns its head without a single byte being re-uploaded.

in vec3 Position;
in vec2 UV0;
in vec4 Color;

uniform mat4 ModelViewMat;
uniform mat4 ProjMat;
uniform mat4 TitanModel;
uniform vec4 Bone0;
uniform vec4 Bone1;
uniform vec4 Bone2;
uniform vec4 Bone3;
uniform vec4 Bone4;
uniform vec4 Bone5;
uniform vec3 Axis0;
uniform vec3 Axis1;
uniform vec3 Axis2;
uniform vec3 Axis3;
uniform vec3 Axis4;
uniform vec3 Axis5;
uniform float Time;

out vec2 texCoord;
out vec4 skin;
out vec3 worldPos;

vec3 hinge(vec3 point, vec3 pivot, vec3 axis, float angle) {
    vec3 offset = point - pivot;
    float c = cos(angle);
    float s = sin(angle);
    return pivot + offset * c + cross(axis, offset) * s + axis * dot(axis, offset) * (1.0 - c);
}

void main() {
    int bone = int(Color.g * 8.0 + 0.5);
    float pull = Color.r;
    // Each bone runs its own phase so the colossus never marches in lockstep with itself.
    float beat = sin(Time * 1.05 + float(bone) * 1.7);
    vec3 pivot = Bone0.xyz;
    vec3 axis = Axis0;
    float swing = Bone0.w;
    if (bone == 1) { pivot = Bone1.xyz; axis = Axis1; swing = Bone1.w; }
    else if (bone == 2) { pivot = Bone2.xyz; axis = Axis2; swing = Bone2.w; }
    else if (bone == 3) { pivot = Bone3.xyz; axis = Axis3; swing = Bone3.w; }
    else if (bone == 4) { pivot = Bone4.xyz; axis = Axis4; swing = Bone4.w; }
    else if (bone == 5) { pivot = Bone5.xyz; axis = Axis5; swing = Bone5.w; }
    vec3 posed = hinge(Position, pivot, normalize(axis), beat * swing * pull);
    vec3 local = mix(Position, posed, pull);
    worldPos = (TitanModel * vec4(local, 1.0)).xyz;
    gl_Position = ProjMat * ModelViewMat * vec4(worldPos, 1.0);
    texCoord = UV0;
    skin = Color;
}
