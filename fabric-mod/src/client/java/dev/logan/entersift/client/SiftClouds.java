package dev.logan.entersift.client;

import com.mojang.blaze3d.vertex.PoseStack;
import com.mojang.blaze3d.vertex.VertexConsumer;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientLifecycleEvents;
import net.fabricmc.fabric.api.client.rendering.v1.level.LevelRenderEvents;
import net.minecraft.client.CloudStatus;
import net.minecraft.client.Minecraft;
import net.minecraft.world.phys.Vec3;

/**
 * 0.13 Overworld clouds in the Minecraft Dungeons style, for players WITHOUT a shader pack.
 *
 * Vanilla's cloud layer is flat-topped and its underside reads as a checkerboard of cells. These
 * clouds are puffy stepped voxel mounds instead: a noise field on a 6-block grid decides where a
 * cloud is and how tall each column is (4, 8, 12 or 16 blocks), and neighbouring columns share
 * faces, so every mound climbs in soft terraces. Only exposed faces are drawn:
 *
 *   tops     warm white
 *   sides    a vertical gradient from lavender at the base to white at the top
 *   bottoms  one flat, uniform lavender-grey (no per-cell shading, so no checkerboard)
 *
 * Everything is tinted by the Overworld clock (peach at dawn and dusk, deep blue at night) and fades
 * out toward the edge of the render distance. The field drifts slowly east.
 *
 * Vanilla clouds are switched OFF while ours are shown and the player's own setting is restored
 * when leaving the Overworld, when a shader pack is enabled (the Dungeons II pack draws its own
 * volumetric clouds) and when the game closes. If the player chose "Clouds: OFF", we draw nothing.
 */
public final class SiftClouds {
    private SiftClouds() {}

    private static final int CELL = 10; // 0.16: was 6 (up to ~150k vertices per frame, see SiftBudget)
    private static final float BASE_Y = 192f, LAYER = 4f, MAX_H = 24f; // 0.17: up to 6 terraces (24 blocks)

    private static CloudStatus saved;
    private static boolean holding;
    private static long packCheckAt;
    private static boolean pack;

    public static void register() {
        LevelRenderEvents.COLLECT_SUBMITS.register(context -> {
            Minecraft mc = Minecraft.getInstance();
            if (mc.level == null) { release(mc); return; }
            boolean overworld = mc.level.dimension().identifier().toString().equals("minecraft:overworld");
            long now = System.nanoTime();
            if (now - packCheckAt > 1_000_000_000L) { packCheckAt = now; pack = SiftRenderTypes.shaderPackInUse(); }
            if (!overworld || pack || !SiftBudget.overworldClouds) { release(mc); return; }
            if (!hold(mc)) return;

            float partial = context.levelState().worldPartialTicks;
            float tick = (float) (mc.level.getOverworldClockTime() % 24000L) + partial;
            float seconds = (float) ((System.nanoTime() / 1.0e9) % 100000.0);
            int chunks = mc.options.renderDistance().get();
            float range = Math.min(chunks * 16f, 192f);
            Vec3 cam = context.levelState().cameraRenderState.pos;
            PoseStack pose = context.poseStack();
            pose.pushPose();
            try {
                context.submitNodeCollector().submitCustomGeometry(pose, SiftRenderTypes.CLOUDS,
                    (p, vc) -> clouds(p, vc, cam, range, tick, seconds));
            } finally {
                pose.popPose();
            }
        });
        ClientLifecycleEvents.CLIENT_STOPPING.register(mc -> {
            if (holding) { release(mc); mc.options.save(); }
        });
    }

    /** Hides vanilla clouds, remembering the player's setting. Returns false if they chose OFF themselves. */
    private static boolean hold(Minecraft mc) {
        CloudStatus current = mc.options.cloudStatus().get();
        if (!holding) { saved = current; holding = true; }
        else if (current != CloudStatus.OFF) saved = current; // the player changed it while we held it
        if (saved == CloudStatus.OFF) return false;
        if (current != CloudStatus.OFF) mc.options.cloudStatus().set(CloudStatus.OFF);
        return true;
    }

    private static void release(Minecraft mc) {
        if (!holding) return;
        holding = false;
        if (saved != null && saved != CloudStatus.OFF && mc.options.cloudStatus().get() == CloudStatus.OFF)
            mc.options.cloudStatus().set(saved);
    }

    // ------------------------------------------------------------------ geometry

    private static int height(int i, int j, float morph) {
        // 0.17 (Dungeons ref): bigger, rounder masses. Lower frequency; the height climbs toward the middle
        // of each mass in 4-block terraces, so a cloud reads as one soft heap rather than scattered blocks.
        float n = SiftSky.noise(i * 0.075f, j * 0.075f, 7.3f + morph)
            + 0.45f * SiftSky.noise(i * 0.19f, j * 0.19f, 1.7f + morph * 1.7f)
            + 0.18f * SiftSky.noise(i * 0.5f, j * 0.5f, 4.1f);
        if (n < 0.14f) return 0;
        return Math.min(6, 1 + (int) ((n - 0.14f) / 0.08f));
    }

    private static void clouds(PoseStack.Pose p, VertexConsumer vc, Vec3 cam, float range, float tick, float seconds) {
        double drift = seconds * 0.9;                  // blocks east per second
        float morph = seconds * 0.0015f;               // the shapes slowly evolve
        double u = cam.x + drift;
        int ci = (int) Math.floor(u / CELL), cj = (int) Math.floor(cam.z / CELL);
        int n = (int) Math.ceil(range / CELL) + 1, size = 2 * n + 3;
        int[][] h = new int[size][size];
        for (int a = 0; a < size; a++)
            for (int b = 0; b < size; b++)
                h[a][b] = height(ci - n - 1 + a, cj - n - 1 + b, morph);

        // Clock tint: day, peach dawn/dusk and deep-blue night.
        double ang = (tick - 6000.0) / 24000.0 * Math.PI * 2;
        float sun = (float) Math.cos(ang);
        float day = smooth(-0.2f, 0.25f, sun), dusk = Math.max(0f, 1f - Math.abs(sun) / 0.3f);
        float[] peach = {1f, 0.70f, 0.56f};
        // 0.17 Dungeons look: bright white tops, sides fading down into a cool bluish grey, and a
        // shadowed blue-grey underside.
        float[] top = mix(mix(new float[]{0.22f, 0.25f, 0.38f}, new float[]{1f, 1f, 1f}, day), peach, dusk * 0.45f);
        float[] low = mix(mix(new float[]{0.13f, 0.15f, 0.27f}, new float[]{0.62f, 0.70f, 0.86f}, day), peach, dusk * 0.3f);
        float[] bottom = mix(mix(new float[]{0.10f, 0.11f, 0.21f}, new float[]{0.52f, 0.60f, 0.78f}, day), peach, dusk * 0.2f);

        float y0 = (float) (BASE_Y - cam.y);
        for (int a = 1; a < size - 1; a++) {
            for (int b = 1; b < size - 1; b++) {
                int level = h[a][b];
                if (level == 0) continue;
                float x0 = (float) ((ci - n - 1 + a) * (double) CELL - drift - cam.x), x1 = x0 + CELL;
                float z0 = (float) ((cj - n - 1 + b) * (double) CELL - cam.z), z1 = z0 + CELL;
                float cx = x0 + CELL / 2f, cz = z0 + CELL / 2f;
                float alpha = 1f - smooth(range * 0.62f, range, (float) Math.sqrt(cx * cx + cz * cz));
                if (alpha < 0.01f) continue;
                float y1 = y0 + level * LAYER;
                float[] topC = shade(low, top, level * LAYER);
                // Top and the flat, uniform underside.
                quad(p, vc, x0, y1, z0, x1, y1, z0, x1, y1, z1, x0, y1, z1, topC, topC, alpha);
                quad(p, vc, x0, y0, z0, x0, y0, z1, x1, y0, z1, x1, y0, z0, bottom, bottom, alpha);
                // Sides: only the part that rises above the neighbouring column.
                side(p, vc, h[a - 1][b], level, x0, z1, x0, z0, y0, low, top, alpha);   // west
                side(p, vc, h[a + 1][b], level, x1, z0, x1, z1, y0, low, top, alpha);   // east
                side(p, vc, h[a][b - 1], level, x0, z0, x1, z0, y0, low, top, alpha);   // north
                side(p, vc, h[a][b + 1], level, x1, z1, x0, z1, y0, low, top, alpha);   // south
            }
        }
    }

    private static void side(PoseStack.Pose p, VertexConsumer vc, int neighbour, int level,
                             float ax, float az, float bx, float bz, float y0, float[] low, float[] top, float alpha) {
        if (neighbour >= level) return;
        float from = neighbour * LAYER, to = level * LAYER;
        float[] cLow = shade(low, top, from), cHigh = shade(low, top, to);
        quad(p, vc, ax, y0 + from, az, bx, y0 + from, bz, bx, y0 + to, bz, ax, y0 + to, az, cLow, cHigh, alpha);
    }

    /** Side colour at a height above the cloud base: lavender at the bottom, white at the top. */
    private static float[] shade(float[] low, float[] top, float above) {
        // 0.17: the blue-grey shadow holds for the lower third, then brightens quickly to white.
        return mix(low, top, smooth(0f, MAX_H * 0.55f, above) * 0.9f + 0.1f);
    }

    /** Quad; the first two vertices get colour c0, the last two c1. */
    private static void quad(PoseStack.Pose p, VertexConsumer vc, float ax, float ay, float az, float bx, float by, float bz,
                             float cx, float cy, float cz, float dx, float dy, float dz, float[] c0, float[] c1, float a) {
        vert(p, vc, ax, ay, az, c0, a); vert(p, vc, bx, by, bz, c0, a);
        vert(p, vc, cx, cy, cz, c1, a); vert(p, vc, dx, dy, dz, c1, a);
    }

    private static void vert(PoseStack.Pose p, VertexConsumer vc, float x, float y, float z, float[] c, float a) {
        if (!SiftBudget.take(vc)) return; // 0.16: never exceed 16-bit quad indices in one batch
        if (!Float.isFinite(x + y + z)) { x = 0f; y = 0f; z = 0f; a = 0f; }
        vc.addVertex(p, x, y, z).setColor(Math.min(1f, c[0]), Math.min(1f, c[1]), Math.min(1f, c[2]), a);
    }

    private static float[] mix(float[] a, float[] b, float t) {
        return new float[]{a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t};
    }

    private static float smooth(float e0, float e1, float x) {
        float t = Math.max(0f, Math.min(1f, (x - e0) / (e1 - e0)));
        return t * t * (3 - 2 * t);
    }
}
