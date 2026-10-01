package dev.logan.entersift.client;

import com.mojang.blaze3d.vertex.PoseStack;
import com.mojang.blaze3d.vertex.VertexConsumer;
import dev.logan.entersift.SiftContent;
import net.fabricmc.fabric.api.client.rendering.v1.level.LevelRenderEvents;
import net.minecraft.client.Minecraft;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.phys.Vec3;

/**
 * 0.22 Rift Staff: a gigantic floating animated blue cube hangs above the player while a Rift Staff is
 * held in either hand. It is drawn in the same level submit phase as the Sift sky and rifts (no entity,
 * no item-model tricks, no textures): an opaque depth-written blue core with an additive glow shell and
 * four small counter-orbiting cubes. The whole assembly spins on Y, rocks on X, bobs and pulses.
 */
public final class RiftStaffRenderer {
    private RiftStaffRenderer() {}

    public static void register() {
        LevelRenderEvents.COLLECT_SUBMITS.register(context -> {
            Minecraft mc = Minecraft.getInstance();
            Player player = mc.player;
            if (player == null || mc.level == null) return;
            if (!holding(player)) return;

            Vec3 cam = context.levelState().cameraRenderState.pos;
            float time = (float) ((System.nanoTime() / 1.0e9) % 3600.0);
            double cx = player.getX() - cam.x;
            double cy = player.getY() - cam.y + 2.75 + Math.sin(time * 1.4) * 0.12; // hovers above the staff
            double cz = player.getZ() - cam.z;

            float pulse = 1f + 0.06f * (float) Math.sin(time * 2.2f);
            float spin = time * 0.8f, rock = (float) Math.sin(time * 0.5f) * 0.35f;

            PoseStack pose = context.poseStack();
            pose.pushPose();
            try {
                var out = context.submitNodeCollector();
                // Opaque blue core: the cube you can actually see.
                out.submitCustomGeometry(pose, SiftRenderTypes.SOLID, (p, vc) ->
                    cube(p, vc, cx, cy, cz, 0.66f * pulse, spin, rock, 0.16f, 0.38f, 0.95f, 1f));
                // Additive shell halo around it.
                out.submitCustomGeometry(pose, SiftRenderTypes.GLOW, (p, vc) ->
                    cube(p, vc, cx, cy, cz, 0.92f * pulse, spin * 0.7f, -rock * 0.6f, 0.35f, 0.7f, 1f, 0.34f));
                // Four small cubes orbiting the giant one.
                out.submitCustomGeometry(pose, SiftRenderTypes.GLOW, (p, vc) -> {
                    for (int i = 0; i < 4; i++) {
                        double a = time * 1.5 + i * Math.PI * 0.5;
                        double r = 1.45 + Math.sin(time * 1.1 + i) * 0.12;
                        cube(p, vc, cx + Math.cos(a) * r, cy + Math.sin(time * 1.7 + i * 1.3) * 0.35, cz + Math.sin(a) * r,
                            0.17f, -time * 2.2f + i, 0.4f, 0.45f, 0.8f, 1f, 0.85f);
                    }
                });
            } finally {
                pose.popPose();
            }
        });
    }

    private static boolean holding(Player player) {
        ItemStack main = player.getItemInHand(InteractionHand.MAIN_HAND);
        ItemStack off = player.getItemInHand(InteractionHand.OFF_HAND);
        return main.is(SiftContent.RIFT_STAFF) || off.is(SiftContent.RIFT_STAFF);
    }

    /** Six quads of one cube, yawed on Y then tilted on X, centred on a camera-relative position. */
    private static void cube(PoseStack.Pose p, VertexConsumer vc, double cx, double cy, double cz,
                             float half, float yaw, float tilt, float r, float g, float b, float a) {
        float cy1 = (float) Math.cos(yaw), sy1 = (float) Math.sin(yaw);
        float ct = (float) Math.cos(tilt), st = (float) Math.sin(tilt);
        float[][] c = new float[8][];
        int k = 0;
        for (int sx = -1; sx <= 1; sx += 2) for (int sy = -1; sy <= 1; sy += 2) for (int sz = -1; sz <= 1; sz += 2) {
            float lx = sx * half, ly = sy * half, lz = sz * half;
            float ty = ly * ct - lz * st, tz = ly * st + lz * ct;   // tilt on X
            c[k++] = new float[]{lx * cy1 + tz * sy1, ty, -lx * sy1 + tz * cy1}; // yaw on Y
        }
        int[][] faces = {{0, 1, 3, 2}, {4, 6, 7, 5}, {0, 2, 6, 4}, {1, 5, 7, 3}, {0, 4, 5, 1}, {2, 3, 7, 6}};
        float[][] shade = {{1f, 1f, 1f}, {0.82f, 0.9f, 1f}, {0.72f, 0.82f, 0.95f}, {0.9f, 0.95f, 1f}, {0.62f, 0.72f, 0.9f}, {1.05f, 1.05f, 1.1f}};
        for (int i = 0; i < faces.length; i++) {
            float[] sh = shade[i];
            for (int idx : faces[i]) {
                float[] v = c[idx];
                add(p, vc, cx + v[0], cy + v[1], cz + v[2], r * sh[0], g * sh[1], b * sh[2], a);
            }
        }
    }

    private static void add(PoseStack.Pose p, VertexConsumer vc, double x, double y, double z, float r, float g, float b, float a) {
        if (!SiftBudget.take(vc)) return;
        if (!Double.isFinite(x + y + z)) { x = 0; y = 0; z = 0; a = 0f; }
        vc.addVertex(p, (float) x, (float) y, (float) z)
          .setColor(Math.min(1f, Math.max(0f, r)), Math.min(1f, Math.max(0f, g)), Math.min(1f, Math.max(0f, b)), Math.max(0f, Math.min(1f, a)));
    }
}
