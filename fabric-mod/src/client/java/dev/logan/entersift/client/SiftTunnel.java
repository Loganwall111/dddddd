package dev.logan.entersift.client;

import com.mojang.blaze3d.vertex.PoseStack;
import com.mojang.blaze3d.vertex.VertexConsumer;
import dev.logan.entersift.SiftContent;
import net.fabricmc.fabric.api.client.rendering.v1.level.LevelRenderEvents;
import net.minecraft.client.Minecraft;
import net.minecraft.resources.Identifier;
import net.minecraft.world.phys.Vec3;

/**
 * 0.18 rift tunnel view (trailer ref IMG_5844): inside entersift:rift_tunnel the player walks through a
 * warp burst, not a block hallway. The hallway itself is invisible barriers. Around the camera sits a
 * sphere drawn by the core/tunnel shader: a white-pink core down the tunnel (+Z), yellow and orange
 * rings, a red body and radial streaks (some teal / green) rushing outward. About 120 glowing square
 * particles fly at the viewer.
 *
 * Under an Iris shader pack (which replaces unregistered pipelines) a CPU-coloured sphere is drawn instead.
 */
public final class SiftTunnel {
    private SiftTunnel() {}

    static final Identifier TUNNEL_DIM = SiftContent.id("rift_tunnel");
    private static final int AZ = 48, EL = 32, PARTICLES = 120;
    private static final float RADIUS = 28f, AXIS_X = 0.5f, AXIS_Y = 65.6f;

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
                if (gpu) out.submitCustomGeometry(pose, SiftRenderTypes.TUNNEL, (p, vc) -> sphere(p, vc, false, seconds));
                else out.submitCustomGeometry(pose, SiftRenderTypes.SKY, (p, vc) -> sphere(p, vc, true, seconds));
                out.submitCustomGeometry(pose, SiftRenderTypes.GLOW, (p, vc) -> particles(p, vc, cam, seconds));
            } finally {
                pose.popPose();
            }
        });
    }

    /** Tessellated sphere; GPU mode encodes the direction in the vertex colour, CPU mode a colour ramp. */
    private static void sphere(PoseStack.Pose p, VertexConsumer vc, boolean cpu, float t) {
        float[][][] d = new float[AZ + 1][EL + 1][];
        for (int i = 0; i <= AZ; i++) for (int j = 0; j <= EL; j++) {
            double az = i / (double) AZ * Math.PI * 2, el = (j / (double) EL - 0.5) * Math.PI;
            // Pole along +Z (the tunnel axis) so the burst centre is finely tessellated.
            d[i][j] = new float[]{(float) (Math.cos(el) * Math.cos(az)), (float) (Math.cos(el) * Math.sin(az)), (float) Math.sin(el)};
        }
        for (int i = 0; i < AZ; i++) for (int j = 0; j < EL; j++) {
            v(p, vc, d[i][j], cpu, t, i);
            v(p, vc, d[i + 1][j], cpu, t, i + 1);
            v(p, vc, d[i + 1][j + 1], cpu, t, i + 1);
            v(p, vc, d[i][j + 1], cpu, t, i);
        }
    }

    private static void v(PoseStack.Pose p, VertexConsumer vc, float[] d, boolean cpu, float t, int i) {
        if (!SiftBudget.take(vc)) return;
        float x = d[0] * RADIUS, y = d[1] * RADIUS, z = d[2] * RADIUS;
        if (!cpu) { vc.addVertex(p, x, y, z).setColor(d[0] * 0.5f + 0.5f, d[1] * 0.5f + 0.5f, d[2] * 0.5f + 0.5f, 1f); return; }
        float ang = (float) (Math.acos(Math.max(-1f, Math.min(1f, d[2]))) / Math.PI);
        float[] c = ramp(ang);
        float band = 0.5f + 0.5f * (float) Math.sin(1f / (ang + 0.03f) * 0.7f - t * 4f);
        float streak = (i * 7 % 5 == 0) ? 0.25f : 0f;
        float teal = (i % 11 == 3) ? 0.6f : 0f;
        float r = c[0] + band * 0.12f + streak, g = c[1] + band * 0.06f + streak * 0.8f, b = c[2] + streak * 0.5f;
        r = r * (1 - teal) + 0.3f * teal; g = g * (1 - teal) + 0.95f * teal; b = b * (1 - teal) + 0.78f * teal;
        vc.addVertex(p, x, y, z).setColor(Math.min(1f, r), Math.min(1f, g), Math.min(1f, b), 1f);
    }

    private static float[] ramp(float ang) {
        float[][] stops = {{0f, 1f, 0.95f, 0.96f}, {0.06f, 1f, 0.86f, 0.36f}, {0.14f, 1f, 0.52f, 0.14f}, {0.3f, 0.86f, 0.12f, 0.1f}, {0.8f, 0.36f, 0.03f, 0.06f}};
        for (int k = 1; k < stops.length; k++) if (ang <= stops[k][0]) {
            float f = (ang - stops[k - 1][0]) / (stops[k][0] - stops[k - 1][0]);
            return new float[]{lerp(stops[k - 1][1], stops[k][1], f), lerp(stops[k - 1][2], stops[k][2], f), lerp(stops[k - 1][3], stops[k][3], f)};
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
     * Additive camera-facing squares on a cylinder around the tunnel axis, rushing toward -Z at about
     * 12 blocks per second, relative to the camera. They loop over 44 blocks, fading in far away and
     * out just behind the viewer.
     */
    private static void particles(PoseStack.Pose p, VertexConsumer vc, Vec3 cam, float t) {
        float[][] palette = {{1f, 1f, 1f}, {1f, 0.9f, 0.5f}, {1f, 0.6f, 0.25f}, {0.4f, 1f, 0.85f}, {1f, 0.45f, 0.35f}};
        float ox = AXIS_X - (float) cam.x, oy = AXIS_Y - (float) cam.y;
        for (int k = 0; k < PARTICLES; k++) {
            float ang = hash(k, 1) * 6.2831853f, rad = 1.2f + 6.5f * hash(k, 2);
            float speed = 10f + 6f * hash(k, 3);
            float z = 40f - ((t * speed + hash(k, 4) * 44f) % 44f); // 40 ahead down to -4 behind
            float x = ox + (float) Math.cos(ang) * rad, y = oy + (float) Math.sin(ang) * rad;
            float fade = Math.min(1f, (40f - z) / 8f) * Math.min(1f, (z + 4f) / 3f);
            if (fade <= 0.01f) continue;
            float q = 0.05f + 0.07f * hash(k, 5);
            float[] c = palette[(int) (hash(k, 6) * palette.length) % palette.length];
            // Squares stretched along Z, facing the camera sideways: two crossed quads.
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
