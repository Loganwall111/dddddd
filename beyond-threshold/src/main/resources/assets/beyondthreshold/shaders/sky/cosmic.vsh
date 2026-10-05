#version 150

in vec3 Position;
uniform mat4 RotMat;
uniform mat4 ProjMat;
out vec3 vDir;

void main() {
    vDir = normalize(Position);
    gl_Position = ProjMat * RotMat * vec4(Position * 240.0, 1.0);
}
