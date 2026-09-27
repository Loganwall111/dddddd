package dev.logan.entersift.client;

import com.mojang.blaze3d.vertex.PoseStack;
import com.mojang.blaze3d.vertex.VertexConsumer;
import dev.logan.entersift.SiftContent;
import net.fabricmc.fabric.api.client.rendering.v1.level.LevelRenderEvents;
import net.minecraft.client.Minecraft;
import net.minecraft.client.renderer.rendertype.RenderType;
import net.minecraft.client.renderer.rendertype.RenderTypes;
import net.minecraft.client.renderer.texture.OverlayTexture;
import net.minecraft.resources.Identifier;

/**
 * Vanilla (no-Iris) Sift sky: slow curtains of translucent rectangular aurora shards, like the
 * reference skies, plus a distant animated threshold that pixelates in and out overhead.
 * Drawn camera-relative with a full-bright emissive translucent type, so it follows the player.
 */
public final class SiftSkyLayer {
    private static final int LIGHT = 0x00F000F0;
    private static final Identifier SHARD = SiftContent.id("textures/environment/sky_shard.png");
    private static final Identifier PORTAL = SiftContent.id("textures/environment/sky_portal.png");
    private static final int SHARDS = 110;
    private static final float[][] PALETTE = {
        {0.55f, 1.0f, 0.85f}, {0.62f, 0.93f, 1.0f}, {0.95f, 1.0f, 1.0f}, {0.52f, 0.95f, 0.72f}, {1.0f, 0.62f, 0.82f}};
    private static final float[][] SEEDS = new float[SHARDS][6];

    static {
        java.util.Random r = new java.util.Random(0x51F7L);
        for (float[] s : SEEDS) for (int i = 0; i < s.length; i++) s[i] = r.nextFloat();
    }

    private SiftSkyLayer() {}

    public static void register() {
        LevelRenderEvents.COLLECT_SUBMITS.register(context -> {
            Minecraft mc = Minecraft.getInstance();
            if (mc.level == null || !mc.level.dimension().identifier().equals(SiftContent.id("the_sift"))) return;
            float t = (float) ((System.nanoTime() / 1.0e9) % 100000.0);
            PoseStack pose = context.poseStack();
            RenderType shards = RenderTypes.entityTranslucentEmissive(SHARD);
            context.submitNodeCollector().submitCustomGeometry(pose, shards, (p, vc) -> drawShards(p, vc, t));
            RenderType portal = RenderTypes.entityTranslucentEmissive(PORTAL);
            context.submitNodeCollector().submitCustomGeometry(pose, portal, (p, vc) -> drawPortal(p, vc, t));
        });
    }

    private static void drawShards(PoseStack.Pose pose, VertexConsumer vc, float t) {
        final float radius = 62f;
        for (int i = 0; i < SHARDS; i++) {
            float[] s = SEEDS[i];
            int curtain = i % 5;
            // Curtains: bands of shards that wave in elevation, drifting slowly around the sky.
            float az = (float) (s[0] * Math.PI * 2 + t * (0.006f + 0.004f * s[1]) + curtain * 1.2566f);
            float el = 0.42f + curtain * 0.12f + 0.16f * (float) Math.sin(az * 3 + curtain + t * 0.05f) + (s[2] - 0.5f) * 0.12f;
            el = Math.max(0.28f, Math.min(1.35f, el));
            float cx = (float) (Math.cos(el) * Math.cos(az)) * radius;
            float cy = (float) Math.sin(el) * radius;
            float cz = (float) (Math.cos(el) * Math.sin(az)) * radius;
            float w = 3.5f + s[3] * 8f, h = w * (0.55f + s[4] * 1.3f);
            float roll = (s[5] - 0.5f) * 0.9f + (float) Math.sin(t * 0.1f + i) * 0.08f;
            float alpha = 0.18f + 0.34f * (0.5f + 0.5f * (float) Math.sin(t * (0.25f + s[1] * 0.4f) + i * 2.1f));
            float[] c = PALETTE[(i * 7 + curtain) % PALETTE.length];
            quad(pose, vc, cx, cy, cz, w, h, roll, c[0], c[1], c[2], alpha, 0, 0, 1, 1);
        }
    }

    /** A 10x6 mosaic threshold high overhead; cells pixelate in from the rim and dissolve again. */
    private static void drawPortal(PoseStack.Pose pose, VertexConsumer vc, float t) {
        final int cols = 10, rows = 6;
        float cycle = (t % 60f) / 60f; // 0..1 over a minute
        float grow = cycle < 0.5f ? cycle * 2 : 2 - cycle * 2;
        float az = 0.9f + t * 0.002f, el = 1.05f, radius = 70f;
        float cx = (float) (Math.cos(el) * Math.cos(az)) * radius, cy = (float) Math.sin(el) * radius, cz = (float) (Math.cos(el) * Math.sin(az)) * radius;
        float cell = 2.2f;
        for (int y = 0; y < rows; y++) for (int x = 0; x < cols; x++) {
            float rim = Math.min(Math.min(x, cols - 1 - x) / (cols / 2f), Math.min(y, rows - 1 - y) / (rows / 2f));
            float jitter = (float) ((Math.sin(x * 12.9898 + y * 78.233) * 43758.5453) % 1.0);
            float show = grow * 1.3f - (rim + Math.abs(jitter) * 0.3f);
            if (show <= 0) continue;
            float a = Math.min(1f, show * 3f) * 0.85f;
            float ox = (x - cols / 2f + 0.5f) * cell, oy = (y - rows / 2f + 0.5f) * cell;
            float u0 = x / (float) cols, v0 = y / (float) rows;
            // Offset within the plane facing the camera centre.
            float[] r = right(cx, cy, cz), up = up(cx, cy, cz, r);
            quad(pose, vc, cx + r[0] * ox + up[0] * oy, cy + r[1] * ox + up[1] * oy, cz + r[2] * ox + up[2] * oy,
                cell * 1.02f, cell * 1.02f, 0f, 1f, 1f, 1f, a, u0, v0, u0 + 1f / cols, v0 + 1f / rows);
        }
    }

    private static float[] right(float x, float y, float z) {
        float rx = -z, rz = x, len = (float) Math.sqrt(rx * rx + rz * rz) + 1e-4f;
        return new float[]{rx / len, 0, rz / len};
    }

    private static float[] up(float x, float y, float z, float[] r) {
        float len = (float) Math.sqrt(x * x + y * y + z * z);
        float nx = x / len, ny = y / len, nz = z / len;
        return new float[]{r[1] * nz - r[2] * ny, r[2] * nx - r[0] * nz, r[0] * ny - r[1] * nx};
    }

    private static void quad(PoseStack.Pose pose, VertexConsumer vc, float cx, float cy, float cz, float w, float h, float roll,
                             float r, float g, float b, float a, float u0, float v0, float u1, float v1) {
        float[] right = right(cx, cy, cz), up = up(cx, cy, cz, right);
        float cr = (float) Math.cos(roll), sr = (float) Math.sin(roll);
        float[] ax = {right[0] * cr + up[0] * sr, right[1] * cr + up[1] * sr, right[2] * cr + up[2] * sr};
        float[] ay = {up[0] * cr - right[0] * sr, up[1] * cr - right[1] * sr, up[2] * cr - right[2] * sr};
        float hw = w / 2, hh = h / 2;
        float[][] corners = {{-hw, -hh, u0, v1}, {hw, -hh, u1, v1}, {hw, hh, u1, v0}, {-hw, hh, u0, v0}};
        for (float[] k : corners) {
            vc.addVertex(pose, cx + ax[0] * k[0] + ay[0] * k[1], cy + ax[1] * k[0] + ay[1] * k[1], cz + ax[2] * k[0] + ay[2] * k[1])
                .setColor(r, g, b, a).setUv(k[2], k[3]).setOverlay(OverlayTexture.NO_OVERLAY).setLight(LIGHT)
                .setNormal(pose, 0f, 1f, 0f);
        }
    }
}
