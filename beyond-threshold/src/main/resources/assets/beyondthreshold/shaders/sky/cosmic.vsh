#version 150

in vec3 Position;
uniform mat4 RotMat;
uniform mat4 ProjMat;
out vec3 vDir;

void main() {
    vDir = (RotMat * vec4(Position, 1.0)).xyz;
    gl_Position = ProjMat * vec4(Position, 1.0);
}
