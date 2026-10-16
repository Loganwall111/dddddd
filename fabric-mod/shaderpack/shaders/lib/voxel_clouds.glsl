// 0.24 Cubed Volumetric Clouds (Minecraft Dungeons II Overworld style: Images 4, 23, 24, 25).
// A 3D voxel grid of 10x5x10-block cells traversed with an exact 3D DDA.
// Clouds have both stepped 3D voxel tops AND stepped 3D voxel undersides (smoothly tiered by
// coverage so thicker cores hang lower while outer fringes step up, never a checkerboard),
// warm peach-ivory sunlit tops, lavender-periwinkle shadowed side faces, and cool slate-blue undersides.
#ifndef SIFT_VOXEL_CLOUDS
#define SIFT_VOXEL_CLOUDS 1
uniform vec3 cameraPosition;
float cloudHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float cloudNoise(vec2 p) {
    vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(cloudHash(i), cloudHash(i + vec2(1.0, 0.0)), f.x), mix(cloudHash(i + vec2(0.0, 1.0)), cloudHash(i + vec2(1.0, 1.0)), f.x), f.y);
}
float cloudFbm(vec2 p) { return cloudNoise(p) * 0.55 + cloudNoise(p * 2.03) * 0.28 + cloudNoise(p * 4.1) * 0.17; }

const vec3 VOXEL = vec3(10.0, 5.0, 10.0);
const float VOXEL_LAYERS = 10.0;

// Smooth 3D stepped voxel cumulus profile (Images 4, 24): thick centers step down at the base and heap high on top.
bool cloudCell(vec3 c, float coverageBias) {
    if (c.y < 0.0 || c.y >= VOXEL_LAYERS) return false;
    float cov = cloudFbm(c.xz * 0.082) + coverageBias;
    if (cov < 0.52) return false;
    float baseStep = floor(clamp((0.66 - cov) * 12.0, 0.0, 2.0));
    float topStep  = 2.0 + floor((cov - 0.52) * 28.0);
    return c.y >= baseStep && c.y < min(VOXEL_LAYERS, topStep);
}

vec3 voxelClouds(vec3 original, vec3 dir, vec3 lightDir, float seconds, float slabBase,
                 vec3 lit, vec3 shade, vec3 ambient, float amountScale, float coverageBias) {
    if (amountScale <= 0.0) return original;
    float slabTop = slabBase + VOXEL.y * VOXEL_LAYERS;
    vec3 eye = cameraPosition;
    if (eye.y < slabBase && dir.y < 0.01) return original;
    if (eye.y > slabTop && dir.y > -0.01) return original;
    float tEnter = 0.0;
    if (eye.y < slabBase) tEnter = (slabBase - eye.y) / dir.y;
    else if (eye.y > slabTop) tEnter = (slabTop - eye.y) / dir.y;
    if (tEnter > 2600.0) return original;
    vec3 wind = vec3(seconds * 1.4, 0.0, seconds * 0.55);
    vec3 pc = (eye + dir * (tEnter + 0.01) + wind - vec3(0.0, slabBase, 0.0)) / VOXEL;
    vec3 dc = dir / VOXEL;
    vec3 cell = floor(pc);
    vec3 stp = sign(dc);
    vec3 inv = 1.0 / max(abs(dc), vec3(1e-5));
    vec3 tMax = (stp * (cell - pc) + max(stp, 0.0)) * inv;
    vec3 normal = vec3(0.0, -stp.y, 0.0);
    float tCell = 0.0;
    for (int i = 0; i < 80; i++) {
        if (cloudCell(cell, coverageBias)) {
            float dist = tEnter + tCell;
            vec3 hitW = eye + dir * dist + wind - vec3(0.0, slabBase, 0.0);
            vec3 local = fract(hitW / VOXEL);
            float ndl = dot(normal, lightDir);
            // Crisp per-face flat shading (Images 4, 24): warm ivory-peach lit faces, periwinkle-blue shaded faces
            vec3 col = mix(shade, lit, clamp(ndl * 0.52 + 0.48, 0.0, 1.0));
            if (normal.y > 0.5) col = mix(col, lit * 1.12, 0.68);
            if (normal.y < -0.5) col = mix(shade, ambient, 0.22) * 0.88;
            col += ambient * 0.22;
            vec3 toward = cell + normal + vec3(0.0, lightDir.y > 0.2 ? 1.0 : 0.0, 0.0);
            if (normal.y < 0.5 && cloudCell(toward, coverageBias)) col *= 0.78;
            if (abs(normal.y) < 0.5) col *= 0.82 + 0.18 * smoothstep(0.0, VOXEL.y * 4.0, hitW.y);
            vec2 faceUV = abs(normal.x) > 0.5 ? local.zy : (abs(normal.z) > 0.5 ? local.xy : local.xz);
            float edge = abs(normal.y) < 0.5 ? smoothstep(0.88, 1.0, faceUV.y) : 0.0;
            float back = pow(max(dot(dir, lightDir), 0.0), 4.0);
            col += lit * edge * (0.10 + back * 0.55);
            float fade = exp(-dist / 2000.0) * smoothstep(0.0, 0.055, abs(dir.y));
            return mix(original, col, clamp(0.97 * fade * amountScale, 0.0, 1.0));
        }
        if (tMax.x < tMax.y && tMax.x < tMax.z) { tCell = tMax.x; tMax.x += inv.x; cell.x += stp.x; normal = vec3(-stp.x, 0.0, 0.0); }
        else if (tMax.y < tMax.z) { tCell = tMax.y; tMax.y += inv.y; cell.y += stp.y; normal = vec3(0.0, -stp.y, 0.0); }
        else { tCell = tMax.z; tMax.z += inv.z; cell.z += stp.z; normal = vec3(0.0, 0.0, -stp.z); }
        if (cell.y < -0.5 || cell.y > VOXEL_LAYERS - 0.5 || tEnter + tCell > 2400.0) break;
    }
    return original;
}
#endif
