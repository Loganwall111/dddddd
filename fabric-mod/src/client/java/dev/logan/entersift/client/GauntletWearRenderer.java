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
 * 0.22 wearable rift gauntlets (Dungeons II ref): while a gauntlet is held, glowing energy bands wrap
 * the forearms, shards orbit the fists and a thin tear shimmers in front of each hand - the "hole in
 * space and time" the punch opens. Blue for the {@code rift_gauntlet}, red for {@code red_rift_gauntlet}.
 *
 * Drawn in the level submit phase, so it uses the same camera-relative coordinates as the Sift sky and
 * rifts and needs no model layer or texture.
 */
public final class GauntletWearRenderer {
    private GauntletWearRenderer() {}

    public static void register() {
        LevelRenderEvents.COLLECT_SUBMITS.register(context -> {
            Minecraft mc = Minecraft.getInstance();
            Player player = mc.player;
            if (player == null || mc.level == null) return;

            ItemStack main = player.getItemInHand(InteractionHand.MAIN_HAND);
            ItemStack off = player.getItemInHand(InteractionHand.OFF_HAND);
            boolean blue = main.is(SiftContent.GAUNTLET) || off.is(SiftContent.GAUNTLET);
            boolean red = main.is(SiftContent.RED_GAUNTLET) || off.is(SiftContent.RED_GAUNTLET);
            if (!blue && !red) return;

            float r = red ? 1.0f : 0.35f, g = red ? 0.32f : 0.65f, b = red ? 0.34f : 1.0f;
            Vec3 cam = context.levelState().cameraRenderState.pos;
            double px = player.getX() - cam.x, py = player.getY() - cam.y, pz = player.getZ() - cam.z;
            float time = (float) ((System.nanoTime() / 1.0e9) % 3600.0);
            float yaw = player.getYRot() * (float) Math.PI / 180f;
            float cy = (float) Math.cos(yaw), sy = (float) Math.sin(yaw);

            PoseStack pose = context.poseStack();
            pose.pushPose();
            try {
                var out = context.submitNodeCollector();
                out.submitCustomGeometry(pose, SiftRenderTypes.GLOW, (p, vc) -> {
                    arms(p, vc, px, py, pz, cy, sy, time, r, g, b);
                    tears(p, vc, px, py, pz, cy, sy, time, r, g, b);
                });
            } finally {
                pose.popPose();
            }
        });
    }

    /** Energy bands down each forearm plus shards orbiting the fists. */
    private static void arms(PoseStack.Pose p, VertexConsumer vc, double px, double py, double pz,
                             float cy, float sy, float time, float r, float g, float b) {
        for (int arm = 0; arm < 2; arm++) {
            float side = arm == 0 ? -0.42f : 0.42f;        // local X: right hand of the player
            float phase = arm * 1.7f;
            // Four glowing bands along the arm (shoulder -> fist), each pulsing and slowly spinning.
            for (int band = 0; band < 4; band++) {
                float ly = 1.32f - band * 0.19f;
                float wobble = (float) Math.sin(time * 3.0f + band * 1.2f + phase) * 0.015f;
                float rad = 0.13f + 0.02f * (float) Math.sin(time * 4.0f + band + phase) + wobble;
                float alpha = 0.62f - band * 0.06f;
                ring(p, vc, px, py, pz, cy, sy, side, ly, rad, rad + 0.045f, time * 2.0f + phase + band * 0.4f, r, g, b, alpha);
            }
            // Two shards orbiting the fist, like the blades of rift energy in the reference art.
            for (int i = 0; i < 2; i++) {
                double a = time * 2.6 + i * Math.PI + phase;
                float lx = side + (float) Math.cos(a) * 0.26f;
                float lz = (float) Math.sin(a) * 0.26f;
                float ly = 0.62f + (float) Math.sin(time * 2.0 + i * 2.1 + phase) * 0.06f;
                shard(p, vc, px, py, pz, cy, sy, lx, ly, lz, 0.075f, time * 1.8f + i, r, g, b, 0.8f);
            }
        }
    }

    /** A thin shimmering tear in front of each fist: the space-time hole the punch opens. */
    private static void tears(PoseStack.Pose p, VertexConsumer vc, double px, double py, double pz,
                              float cy, float sy, float time, float r, float g, float b) {
        for (int arm = 0; arm < 2; arm++) {
            float side = arm == 0 ? -0.42f : 0.42f;
            float phase = arm * 2.3f;
            float pulse = 0.5f + 0.5f * (float) Math.sin(time * 2.4f + phase);
            float h = 0.22f + 0.12f * pulse;                     // half-height of the slit
            float w = 0.035f + 0.02f * pulse;                    // half-width
            float lean = (float) Math.sin(time * 1.7f + phase) * 0.22f;
            float fwd = 0.34f, fwdLx = side;
            float alpha = 0.35f + 0.45f * pulse;
            // Slit: two crossed quads (a plus of light) so it reads from every camera angle.
            quad(p, vc, px, py, pz, cy, sy, fwdLx, 0.78f + h, fwd, fwdLx - w, 0.78f, fwd, fwdLx + w, 0.78f, fwd, fwdLx, 0.78f - h, fwd, r, g, b, alpha);
            quad(p, vc, px, py, pz, cy, sy, fwdLx - h * lean, 0.78f + h, fwd - h * 0.4f, fwdLx - w, 0.78f, fwd, fwdLx + w, 0.78f, fwd, fwdLx + h * lean, 0.78f - h, fwd + h * 0.4f, r * 1.2f, g * 1.2f, b * 1.2f, alpha * 0.7f);
            // Crackling specks around the slit.
            for (int i = 0; i < 3; i++) {
                double a = time * 3.1 + i * 2.1 + phase;
                float lx = fwdLx + (float) Math.cos(a) * 0.16f;
                float ly = 0.78f + (float) Math.sin(a * 1.3) * 0.2f;
                float lz = fwd + (float) Math.sin(a) * 0.06f;
                shard(p, vc, px, py, pz, cy, sy, lx, ly, lz, 0.032f, time * 2.4f + i, r, g, b, 0.9f);
            }
        }
    }

    /** A flat annulus band around a vertical arm, at local x=lx, height ly. */
    private static void ring(PoseStack.Pose p, VertexConsumer vc, double px, double py, double pz,
                             float cy, float sy, float lx, float ly, float r0, float r1, float spin,
                             float cr, float cg, float cb, float alpha) {
        int segments = 12;
        for (int j = 0; j < segments; j++) {
            float a0 = spin + j * (float) (Math.PI * 2 / segments);
            float a1 = spin + (j + 1) * (float) (Math.PI * 2 / segments);
            float c0 = (float) Math.cos(a0), s0 = (float) Math.sin(a0);
            float c1 = (float) Math.cos(a1), s1 = (float) Math.sin(a1);
            quad(p, vc, px, py, pz, cy, sy, lx + c0 * r0, ly, s0 * r0, lx + c1 * r0, ly, s1 * r0,
                 lx + c1 * r1, ly, s1 * r1, lx + c0 * r1, ly, s0 * r1, cr, cg, cb, alpha);
        }
    }

    /** A tiny camera-less cube (8 verts as two crossed quads) for orbiting shards. */
    private static void shard(PoseStack.Pose p, VertexConsumer vc, double px, double py, double pz,
                              float cy, float sy, float lx, float ly, float lz, float s, float spin,
                              float r, float g, float b, float alpha) {
        float c = (float) Math.cos(spin), sn = (float) Math.sin(spin);
        float ux = s * c, uz = s * sn, vx = -s * sn, vz = s * c;
        quad(p, vc, px, py, pz, cy, sy, lx - ux, ly - s, lz - uz, lx + ux, ly - s, lz + uz, lx + ux, ly + s, lz + uz, lx - ux, ly + s, lz - uz, r, g, b, alpha);
        quad(p, vc, px, py, pz, cy, sy, lx - vx, ly - s, lz - vz, lx + vx, ly - s, lz + vz, lx + vx, ly + s, lz + vz, lx - vx, ly + s, lz - vz, r, g, b, alpha);
    }

    /** Emits one quad given four points in player-local space (x = right, y = up, z = forward). */
    private static void quad(PoseStack.Pose p, VertexConsumer vc, double px, double py, double pz, float cy, float sy,
                             float x0, float y0, float z0, float x1, float y1, float z1,
                             float x2, float y2, float z2, float x3, float y3, float z3,
                             float r, float g, float b, float a) {
        local(p, vc, px, py, pz, cy, sy, x0, y0, z0, r, g, b, a);
        local(p, vc, px, py, pz, cy, sy, x1, y1, z1, r, g, b, a);
        local(p, vc, px, py, pz, cy, sy, x2, y2, z2, r, g, b, a);
        local(p, vc, px, py, pz, cy, sy, x3, y3, z3, r, g, b, a);
    }

    /** Player-local (right, up, forward) -> camera-relative world vertex, using the look yaw. */
    private static void local(PoseStack.Pose p, VertexConsumer vc, double px, double py, double pz, float cy, float sy,
                              float lx, float ly, float lz, float r, float g, float b, float a) {
        if (!SiftBudget.take(vc)) return;
        // yaw 0 faces +Z: right = (-cos, 0, -sin), forward = (-sin, 0, cos)
        double x = px - lx * cy - lz * sy;
        double z = pz - lx * sy + lz * cy;
        double y = py + ly;
        if (!Double.isFinite(x + y + z)) { x = 0; y = 0; z = 0; a = 0f; }
        vc.addVertex(p, (float) x, (float) y, (float) z)
          .setColor(Math.min(1f, Math.max(0f, r)), Math.min(1f, Math.max(0f, g)), Math.min(1f, Math.max(0f, b)), Math.max(0f, Math.min(1f, a)));
    }
}
