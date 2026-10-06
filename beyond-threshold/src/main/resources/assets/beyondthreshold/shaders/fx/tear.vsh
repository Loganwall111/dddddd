#version 150

in vec3 Position;
uniform mat4 RotMat;
uniform mat4 ProjMat;
uniform vec3 Rel;
uniform float Scale;
out vec2 vUv;

void main() {
    vUv = Position.xy;
    vec3 view = (RotMat * vec4(Rel, 1.0)).xyz + vec3(Position.xy * Scale, 0.0);
    gl_Position = ProjMat * vec4(view, 1.0);
}
