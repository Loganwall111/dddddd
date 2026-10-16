package dev.logan.entersift.client;

import com.mojang.blaze3d.vertex.PoseStack;
import com.mojang.blaze3d.vertex.VertexConsumer;
import dev.logan.entersift.SiftContent;
import net.fabricmc.fabric.api.client.rendering.v1.level.LevelRenderEvents;
import net.minecraft.client.Minecraft;
import net.minecraft.resources.Identifier;
import net.minecraft.world.phys.Vec3;

/**
 * 0.22 Master Architecture Override: Walkable 3D Warp Corridor (entersift:rift_tunnel).
 *
 * At Tick 60 of the transition gate (under 100% solid orange lens flare), the player is seamlessly
 * teleported into this 3D walkthrough warp corridor while the orange HUD fades out to 0.0.
 *
 * All spherical/radial geometry has been completely replaced with pure 3D voxel geometry:
 *  - A subdivided 6-faced voxel skybox enclosure driven by the core/tunnel shader (blinding white-gold
 *    core down +Z, fiery orange/red rings, and cosmic orange + teal/cyan streaks).
 *  - Scrolling hollow rectangular cosmic voxel rings framing the walkable hallway.
 *  - 120 glowing 3D voxel blocks/streaks positioned on a rectangular corridor grid rushing past the viewer.
 */
public final class SiftTunnel {
    private SiftTunnel() {}

    static final Identifier TUNNEL_DIM = SiftContent.id("rift_tunnel");
    private static final int GRID = 16, PARTICLES = 120, VOXEL_RINGS = 14;
    private static final float HALF_BOX = 28f, AXIS_X = 0.5f, AXIS_Y = 65.6f;

    public static void register() {
        SiftRenderTypes.initialize();
        LevelRenderEvents.COLLECT_SUBMITS.register(context -> {
            Minecraft mc = Minecraft.getInstance();
            if (mc.level == null || !mc.level.dimension().identifier().equals(TUNNEL_DIM)) return;
            if (SiftRenderTypes.irisShadowPass()) return;
            Vec3 cam = context.levelState().cameraRenderState.pos;
            float seconds = (float) ((System.nanoTime() / 1.0e9) % 3600.0);
            boolean gpu = SiftBudget.riftShader; // 0.18.2: also under Iris packs
            PoseStack pose = context.poseStack();
            pose.pushPose(); // balanced
            try {
                var out = context.submitNodeCollector();
                if (gpu) out.submitCustomGeometry(pose, SiftRenderTypes.TUNNEL, (p, vc) -> voxelSkybox(p, vc, false, seconds));
                else out.submitCustomGeometry(pose, SiftRenderTypes.SKY, (p, vc) -> voxelSkybox(p, vc, true, seconds));
                out.submitCustomGeometry(pose, SiftRenderTypes.GLOW, (p, vc) -> {
                    voxelRings(p, vc, cam, seconds);
                    particles(p, vc, cam, seconds);
                });
            } finally {
                pose.popPose();
            }
        });
    }

    /**
     * Subdivided 6-faced 3D voxel box enclosure around the camera (zero spherical radial equations).
     * GPU mode encodes the normalized direction vector in the vertex colour; CPU mode uses a voxel ramp.
     */
    private static void voxelSkybox(PoseStack.Pose p, VertexConsumer vc, boolean cpu, float t) {
        for (int face = 0; face < 6; face++) {
            for (int u = 0; u < GRID; u++) {
                float u0 = (u / (float) GRID) * 2f - 1f;
                float u1 = ((u + 1) / (float) GRID) * 2f - 1f;
                for (int v = 0; v < GRID; v++) {
                    float v0 = (v / (float) GRID) * 2f - 1f;
                    float v1 = ((v + 1) / (float) GRID) * 2f - 1f;
                    int idx = face * GRID + u;
                    emitBoxVertex(p, vc, cubePoint(face, u0, v0), cpu, t, idx);
                    emitBoxVertex(p, vc, cubePoint(face, u1, v0), cpu, t, idx + 1);
                    emitBoxVertex(p, vc, cubePoint(face, u1, v1), cpu, t, idx + 1);
                    emitBoxVertex(p, vc, cubePoint(face, u0, v1), cpu, t, idx);
                }
            }
        }
    }

    private static float[] cubePoint(int face, float u, float v) {
        return switch (face) {
            case 0 -> new float[]{ u,  v,  1f}; // +Z (tunnel forward core)
            case 1 -> new float[]{-u,  v, -1f}; // -Z (behind)
            case 2 -> new float[]{ 1f, v, -u};  // +X (right wall)
            case 3 -> new float[]{-1f, v,  u};  // -X (left wall)
            case 4 -> new float[]{ u,  1f, -v}; // +Y (ceiling)
            default -> new float[]{ u, -1f, v}; // -Y (floor)
        };
    }

    private static void emitBoxVertex(PoseStack.Pose p, VertexConsumer vc, float[] pt, boolean cpu, float t, int i) {
        if (!SiftBudget.take(vc)) return;
        float x = pt[0] * HALF_BOX, y = pt[1] * HALF_BOX, z = pt[2] * HALF_BOX;
        float len = (float) Math.sqrt(pt[0] * pt[0] + pt[1] * pt[1] + pt[2] * pt[2]);
        float dx = pt[0] / len, dy = pt[1] / len, dz = pt[2] / len;
        if (!cpu) {
            vc.addVertex(p, x, y, z).setColor(dx * 0.5f + 0.5f, dy * 0.5f + 0.5f, dz * 0.5f + 0.5f, 1f);
            return;
        }
        // Rectangular Chebyshev distance from the +Z tunnel axis (zero spherical trig)
        float rectDist = dz > 0f ? Math.max(Math.abs(dx), Math.abs(dy)) * 0.45f : 0.45f + (1f - (dz + 1f) * 0.5f) * 0.55f;
        float[] c = ramp(rectDist);
        float band = 0.5f + 0.5f * (float) Math.sin(1f / (rectDist + 0.04f) * 0.7f - t * 4f);
        float streak = (i * 7 % 5 == 0) ? 0.25f : 0f;
        float teal = (i % 11 == 3) ? 0.6f : 0f;
        float r = c[0] + band * 0.12f + streak, g = c[1] + band * 0.06f + streak * 0.8f, b = c[2] + streak * 0.5f;
        r = r * (1 - teal) + 0.3f * teal; g = g * (1 - teal) + 0.95f * teal; b = b * (1 - teal) + 0.78f * teal;
        vc.addVertex(p, x, y, z).setColor(Math.min(1f, r), Math.min(1f, g), Math.min(1f, b), 1f);
    }

    private static float[] ramp(float dist) {
        float[][] stops = {
            {0.00f, 1.00f, 0.96f, 0.94f},
            {0.06f, 1.00f, 0.86f, 0.36f},
            {0.14f, 1.00f, 0.52f, 0.14f},
            {0.30f, 0.86f, 0.12f, 0.10f},
            {0.80f, 0.36f, 0.03f, 0.06f}
        };
        for (int k = 1; k < stops.length; k++) if (dist <= stops[k][0]) {
            float f = (dist - stops[k - 1][0]) / (stops[k][0] - stops[k - 1][0]);
            return new float[]{
                lerp(stops[k - 1][1], stops[k][1], f),
                lerp(stops[k - 1][2], stops[k][2], f),
                lerp(stops[k - 1][3], stops[k][3], f)
            };
        }
        return new float[]{0.36f, 0.03f, 0.06f};
    }

    private static float lerp(float a, float b, float f) { return a + (b - a) * f; }

    private static float hash(int a, int b) {
        long h = a * 0x9E3779B97F4A7C15L + b * 0xBF58476D1CE4E5B9L + 0x7A11L;
        h ^= h >>> 31; h *= 0x7FB5D329728EA185L; h ^= h >>> 27;
        return (h >>> 40) / (float) (1L << 24);
    }

    /**
     * Scrolling cosmic hollow rectangular voxel rings framing the walkable warp corridor.
     */
    private static void voxelRings(PoseStack.Pose p, VertexConsumer vc, Vec3 cam, float t) {
        float ox = AXIS_X - (float) cam.x, oy = AXIS_Y - (float) cam.y;
        float[][] ringPalette = {
            {1.00f, 0.72f, 0.24f}, // Golden-orange
            {1.00f, 0.38f, 0.10f}, // Blazing orange-red
            {0.22f, 0.92f, 0.88f}, // Electric cyan-teal
            {1.00f, 0.94f, 0.80f}  // White-gold core
        };
        float span = 42f;
        for (int r = 0; r < VOXEL_RINGS; r++) {
            float z = 38f - ((t * 9.5f + r * (span / VOXEL_RINGS)) % span);
            float fade = Math.min(1f, (38f - z) / 7f) * Math.min(1f, (z + 4f) / 3.5f);
            if (fade <= 0.02f) continue;
            float rx = 2.8f + (r % 3) * 0.45f;
            float ry = 2.4f + (r % 2) * 0.35f;
            float thick = 0.14f;
            float[] c = ringPalette[r % ringPalette.length];
            float alpha = 0.42f * fade;
            // Top & bottom horizontal voxel bars of the hollow rectangular ring
            quadZ(p, vc, ox - rx, oy + ry - thick, ox + rx, oy + ry, z, c, alpha);
            quadZ(p, vc, ox - rx, oy - ry, ox + rx, oy - ry + thick, z, c, alpha);
            // Left & right vertical voxel bars of the hollow rectangular ring
            quadZ(p, vc, ox - rx, oy - ry + thick, ox - rx + thick, oy + ry - thick, z, c, alpha);
            quadZ(p, vc, ox + rx - thick, oy - ry + thick, ox + rx, oy + ry - thick, z, c, alpha);
        }
    }

    private static void quadZ(PoseStack.Pose p, VertexConsumer vc, float x0, float y0, float x1, float y1, float z, float[] c, float a) {
        col(p, vc, x0, y0, z, c, a);
        col(p, vc, x1, y0, z, c, a);
        col(p, vc, x1, y1, z, c, a);
        col(p, vc, x0, y1, z, c, a);
    }

    /**
     * Additive 3D square voxel particles positioned along the rectangular corridor walls, floor, and ceiling
     * (zero cylindrical/radial trig), rushing toward -Z relative to the camera.
     */
    private static void particles(PoseStack.Pose p, VertexConsumer vc, Vec3 cam, float t) {
        float[][] palette = {{1f, 1f, 1f}, {1f, 0.9f, 0.5f}, {1f, 0.6f, 0.25f}, {0.4f, 1f, 0.85f}, {1f, 0.45f, 0.35f}};
        float ox = AXIS_X - (float) cam.x, oy = AXIS_Y - (float) cam.y;
        for (int k = 0; k < PARTICLES; k++) {
            int wall = k & 3;
            float u = (hash(k, 1) * 2f - 1f);
            float dist = 1.6f + 5.8f * hash(k, 2);
            float rx = (wall == 0 ? -dist : (wall == 1 ? dist : u * dist));
            float ry = (wall == 2 ? -dist : (wall == 3 ? dist : u * dist));
            float speed = 10f + 6f * hash(k, 3);
            float z = 40f - ((t * speed + hash(k, 4) * 44f) % 44f); // 40 ahead down to -4 behind
            float x = ox + rx, y = oy + ry;
            float fade = Math.min(1f, (40f - z) / 8f) * Math.min(1f, (z + 4f) / 3f);
            if (fade <= 0.01f) continue;
            float q = 0.05f + 0.07f * hash(k, 5);
            float[] c = palette[(int) (hash(k, 6) * palette.length) % palette.length];
            // 3D voxel streaks stretched along Z: two crossed quads
            float len = q * 6f;
            quad(p, vc, x - q, y, z - len, x + q, y, z + len, c, 0.8f * fade, true);
            quad(p, vc, x, y - q, z - len, x, y + q, z + len, c, 0.8f * fade, false);
        }
    }

    private static void quad(PoseStack.Pose p, VertexConsumer vc, float x0, float y0, float z0, float x1, float y1, float z1, float[] c, float a, boolean flat) {
        if (flat) {
            col(p, vc, x0, y0, z0, c, a); col(p, vc, x1, y0, z0, c, a); col(p, vc, x1, y1, z1, c, a); col(p, vc, x0, y1, z1, c, a);
        } else {
            col(p, vc, x0, y0, z0, c, a); col(p, vc, x0, y1, z0, c, a); col(p, vc, x1, y1, z1, c, a); col(p, vc, x1, y0, z1, c, a);
        }
    }

    private static void col(PoseStack.Pose p, VertexConsumer vc, float x, float y, float z, float[] c, float a) {
        if (!SiftBudget.take(vc)) return;
        vc.addVertex(p, x, y, z).setColor(c[0], c[1], c[2], a);
    }
}
