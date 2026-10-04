package dev.logan.entersift.client;

import com.mojang.blaze3d.vertex.PoseStack;
import com.mojang.blaze3d.vertex.VertexConsumer;
import dev.logan.entersift.RiftPortalEntity;
import java.util.LinkedHashMap;
import java.util.Map;
import net.minecraft.client.renderer.SubmitNodeCollector;
import net.minecraft.client.renderer.rendertype.RenderType;

/**
 * Secondary rift fragments, kept separate from the body mesh and from the rift entity's gameplay state.
 * A few small, filled, shaded cuboids hover just outside the opening; the night-only rising cubes are
 * real client particles with their own registered particle group.
 */
final class RiftFragments {
    private static final int FRAGMENT_COUNT = 4;
    private static final RenderType RENDER_TYPE = SiftRenderTypes.GLASS;
    private static final Map<Integer, Long> LAST_NIGHT_CUBE_TICK = new LinkedHashMap<>(96, 0.75f, true) {
        @Override protected boolean removeEldestEntry(Map.Entry<Integer, Long> eldest) { return size() > 512; }
    };
    private static final int[][] FACES = {
        {4, 5, 7, 6}, {1, 0, 2, 3}, {6, 7, 3, 2},
        {0, 1, 5, 4}, {5, 1, 3, 7}, {0, 4, 6, 2}
    };
    private static final float[] FACE_SHADE = {1.0f, 0.72f, 1.10f, 0.58f, 0.84f, 0.84f};

    private RiftFragments() {}

    /**
     * A time-of-day filtered particle spawner. Uses the advancing overworld clock, not the rift's opening
     * age (which intentionally stops syncing after growth), and emits no cubes during daytime.
     */
    static boolean isNightTime(long worldTick) {
        long day = Math.floorMod(worldTick, 24000L);
        return day >= 11500L && day <= 23300L;
    }

    static void spawnNightCubes(RiftPortalEntity entity, RiftPortalRenderer.State state) {
        if (!SiftBudget.riftEffects || !state.night || entity.age() < RiftPortalRenderer.GROWN) return;
        long worldTick = entity.level().getOverworldClockTime();
        if (!isNightTime(worldTick)) return;
        if (Math.floorMod(worldTick + entity.getId(), 10L) != 0L) return;
        Long previous = LAST_NIGHT_CUBE_TICK.get(entity.getId());
        if (previous != null && previous == worldTick) return;
        LAST_NIGHT_CUBE_TICK.put(entity.getId(), worldTick);

        float phase = (float) (worldTick * 0.19 + RiftShape.hash(entity.getId(), (int) (worldTick / 10L), 51) * Math.PI * 2.0);
        float localX = (float) Math.cos(phase) * state.w * 0.24f;
        float localY = 0.25f + state.h * (0.26f + 0.28f * RiftShape.hash(entity.getId(), (int) (worldTick / 10L), 52));
        float localZ = 0.14f + 0.24f * RiftShape.hash(entity.getId(), (int) (worldTick / 10L), 53);
        float yaw = (float) Math.toRadians(state.yaw);
        double worldX = localX * Math.cos(yaw) - localZ * Math.sin(yaw);
        double worldZ = localX * Math.sin(yaw) + localZ * Math.cos(yaw);
        int colorIndex = (int) Math.floorMod(worldTick / 10L + entity.getId(), 3L);
        try {
            RiftEnergyCubeParticle.spawn(state.ex + worldX, state.ey + localY, state.ez + worldZ, state.type, colorIndex);
        } catch (Throwable ignored) {
            // A cosmetic particle must never interrupt entity render-state extraction.
        }
    }

    static void submit(PoseStack pose, SubmitNodeCollector out, RiftPortalRenderer.State state, RiftShape shape) {
        if (!SiftBudget.riftEffects || state.age < RiftPortalRenderer.GROWN) return;
        out.submitCustomGeometry(pose, RENDER_TYPE, (p, vc) -> draw(p, vc, state, shape));
    }

    private static void draw(PoseStack.Pose pose, VertexConsumer vc, RiftPortalRenderer.State state, RiftShape shape) {
        for (int k = 0; k < FRAGMENT_COUNT; k++) {
            float h0 = RiftShape.hash(state.seed, k, 201);
            float h1 = RiftShape.hash(state.seed, k, 202);
            float h2 = RiftShape.hash(state.seed, k, 203);
            float h3 = RiftShape.hash(state.seed, k, 204);
            float phase = h0 * 6.2831855f + state.time * (k % 2 == 0 ? 0.16f : -0.13f);
            float rx = shape.w * (0.48f + 0.06f * h1) + 0.12f;
            float ry = shape.h * (0.48f + 0.08f * h2) + 0.10f;
            float cx = (float) Math.cos(phase) * rx;
            float cy = shape.cy() + (float) Math.sin(phase * 0.81f) * ry + 0.08f * (float) Math.sin(state.time * 0.7f + k);
            float cz = 0.18f + 0.44f * h3 + 0.08f * (float) Math.sin(state.time * 0.4f + k * 1.9f);
            float sx = 0.12f + 0.10f * h1;
            float sy = 0.10f + 0.12f * h2;
            float sz = 0.10f + 0.11f * h3;
            float yaw = phase * 0.55f + state.time * 0.12f;
            float pitch = 0.22f * (float) Math.sin(state.time * 0.23f + k * 2.1f);
            float alpha = 0.42f + 0.12f * (0.5f + 0.5f * (float) Math.sin(state.time * 0.55f + k));
            float[] color = RiftEnergyCubeParticle.paletteFor(state.type, k + (int) (state.seed & 3));
            cuboid(pose, vc, cx, cy, cz, sx, sy, sz, yaw, pitch, color, alpha);
        }
    }

    private static void cuboid(PoseStack.Pose pose, VertexConsumer vc, float cx, float cy, float cz,
                               float sx, float sy, float sz, float yaw, float pitch, float[] color, float alpha) {
        float hx = sx * 0.5f, hy = sy * 0.5f, hz = sz * 0.5f;
        float cosY = (float) Math.cos(yaw), sinY = (float) Math.sin(yaw);
        float cosX = (float) Math.cos(pitch), sinX = (float) Math.sin(pitch);
        float[][] vertices = new float[8][3];
        for (int i = 0; i < 8; i++) {
            float x = (i & 1) == 0 ? -hx : hx;
            float y = (i & 2) == 0 ? -hy : hy;
            float z = (i & 4) == 0 ? -hz : hz;
            float xz = x * cosY + z * sinY;
            float rz = -x * sinY + z * cosY;
            float ry = y * cosX - rz * sinX;
            float zz = y * sinX + rz * cosX;
            vertices[i][0] = cx + xz;
            vertices[i][1] = cy + ry;
            vertices[i][2] = cz + zz;
        }
        for (int face = 0; face < FACES.length; face++) {
            int[] q = FACES[face];
            float shade = FACE_SHADE[face];
            for (int index : q) {
                if (!SiftBudget.take(vc)) return;
                float[] v = vertices[index];
                vc.addVertex(pose, v[0], v[1], v[2]).setColor(
                    Math.min(1f, color[0] * shade), Math.min(1f, color[1] * shade),
                    Math.min(1f, color[2] * shade), alpha);
            }
        }
    }
}
