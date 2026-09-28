// Cubed volumetric clouds (Minecraft Dungeons style): a voxel grid of 12x6x12-block cells in a
// world-space slab, traversed with an exact 3D DDA. Every hit is a real cube face with flat
// per-face shading (warm lit tops, blue-grey undersides), self shadowing from the neighbouring
// cube toward the light, a silver rim on back-lit edges, and distance fade into the horizon.
#ifndef SIFT_VOXEL_CLOUDS
#define SIFT_VOXEL_CLOUDS 1
uniform vec3 cameraPosition;
float cloudHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float cloudNoise(vec2 p) {
    vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(cloudHash(i), cloudHash(i + vec2(1.0, 0.0)), f.x), mix(cloudHash(i + vec2(0.0, 1.0)), cloudHash(i + vec2(1.0, 1.0)), f.x), f.y);
}
float cloudFbm(vec2 p) { return cloudNoise(p) * 0.55 + cloudNoise(p * 2.03) * 0.28 + cloudNoise(p * 4.1) * 0.17; }

const vec3 VOXEL = vec3(12.0, 6.0, 12.0);
const float VOXEL_LAYERS = 8.0;

// Is voxel cell c (integer-valued) solid? Flat bottoms, heaped stepped tops where coverage is thick.
bool cloudCell(vec3 c, float coverageBias) {
    if (c.y < 0.0 || c.y >= VOXEL_LAYERS) return false;
    float cov = cloudFbm(c.xz * 0.085) + coverageBias;
    if (cov < 0.53) return false;
    float base = floor(cloudHash(c.xz * 0.37) * 1.6);
    float height = 1.0 + floor((cov - 0.53) * 26.0);
    return c.y >= base && c.y < base + height;
}

// original = background colour; returns clouds composited over it.
// lit/shade/ambient = palette; slabBase = world y of the lowest layer.
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
    vec3 wind = vec3(seconds * 1.6, 0.0, seconds * 0.6);
    vec3 pc = (eye + dir * (tEnter + 0.01) + wind - vec3(0.0, slabBase, 0.0)) / VOXEL;
    vec3 dc = dir / VOXEL;
    vec3 cell = floor(pc);
    vec3 stp = sign(dc);
    vec3 inv = 1.0 / max(abs(dc), vec3(1e-5));
    vec3 tMax = (stp * (cell - pc) + max(stp, 0.0)) * inv; // parametric distance to next boundary
    vec3 normal = vec3(0.0, -stp.y, 0.0);
    float tCell = 0.0;
    for (int i = 0; i < 72; i++) {
        if (cloudCell(cell, coverageBias)) {
            float dist = tEnter + tCell;
            vec3 hitW = eye + dir * dist + wind - vec3(0.0, slabBase, 0.0);
            vec3 local = fract(hitW / VOXEL);
            // Flat face shading.
            float ndl = dot(normal, lightDir);
            vec3 col = mix(shade, lit, clamp(ndl * 0.5 + 0.5, 0.0, 1.0));
            if (normal.y > 0.5) col = mix(col, lit * 1.08, 0.6);        // sunlit tops
            if (normal.y < -0.5) col = mix(col, shade * 0.9, 0.7);      // blue-grey undersides
            col += ambient * 0.25;
            // Self shadow: a solid neighbour toward the light darkens this face.
            vec3 toward = cell + normal + vec3(0.0, lightDir.y > 0.2 ? 1.0 : 0.0, 0.0);
            if (normal.y < 0.5 && cloudCell(toward, coverageBias)) col *= 0.78;
            // Soft edge darkening near the bottom of side faces (fake AO) + silver rim when back-lit.
            if (abs(normal.y) < 0.5) col *= 0.86 + 0.14 * smoothstep(0.0, 0.6, local.y);
            vec2 faceUV = abs(normal.x) > 0.5 ? local.zy : (abs(normal.z) > 0.5 ? local.xy : local.xz);
            float edge = 1.0 - smoothstep(0.0, 0.08, min(min(faceUV.x, 1.0 - faceUV.x), min(faceUV.y, 1.0 - faceUV.y)));
            float back = pow(max(dot(dir, lightDir), 0.0), 4.0);
            col += lit * edge * (0.08 + back * 0.5);
            float fade = exp(-dist / 1900.0) * smoothstep(0.0, 0.06, abs(dir.y));
            return mix(original, col, clamp(0.96 * fade * amountScale, 0.0, 1.0));
        }
        // Step to the next cell (exact DDA).
        if (tMax.x < tMax.y && tMax.x < tMax.z) { tCell = tMax.x; tMax.x += inv.x; cell.x += stp.x; normal = vec3(-stp.x, 0.0, 0.0); }
        else if (tMax.y < tMax.z) { tCell = tMax.y; tMax.y += inv.y; cell.y += stp.y; normal = vec3(0.0, -stp.y, 0.0); }
        else { tCell = tMax.z; tMax.z += inv.z; cell.z += stp.z; normal = vec3(0.0, 0.0, -stp.z); }
        if (cell.y < -0.5 || cell.y > VOXEL_LAYERS - 0.5 || tEnter + tCell > 2400.0) break;
    }
    return original;
}
#endif
