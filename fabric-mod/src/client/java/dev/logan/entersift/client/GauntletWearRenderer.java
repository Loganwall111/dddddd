package dev.logan.entersift.client;

import com.mojang.blaze3d.vertex.PoseStack;
import com.mojang.blaze3d.vertex.VertexConsumer;
import dev.logan.entersift.SiftContent;
import net.fabricmc.fabric.api.client.rendering.v1.WorldRenderContext;
import net.fabricmc.fabric.api.client.rendering.v1.WorldRenderEvents;
import net.minecraft.client.Minecraft;
import net.minecraft.client.renderer.MultiBufferSource;
import net.minecraft.client.renderer.RenderType;
import net.minecraft.client.renderer.rendertype.RenderTypes;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.ItemStack;
import org.joml.Quaternionf;

/**
 * 0.22 Wearable Gauntlet renderer: when the player holds a rift gauntlet, glowing energy wraps around
 * their arms and hands, showing the dimensional-tear power. When the player swings, a rift punch
 * visual plays (space-time distortion around the fist).
 */
public final class GauntletWearRenderer {
    private GauntletWearRenderer() {}

    public static void register() {
        WorldRenderEvents.AFTER_TRANSLUCENT.register(GauntletWearRenderer::renderGauntletEffects);
    }

    private static void renderGauntletEffects(WorldRenderContext context) {
        Minecraft mc = Minecraft.getInstance();
        Player player = mc.player;
        if (player == null) return;

        ItemStack mainHand = player.getItemInHand(InteractionHand.MAIN_HAND);
        ItemStack offHand = player.getItemInHand(InteractionHand.OFF_HAND);
        boolean hasGauntlet = mainHand.is(SiftContent.GAUNTLET) || mainHand.is(SiftContent.RED_GAUNTLET)
            || offHand.is(SiftContent.GAUNTLET) || offHand.is(SiftContent.RED_GAUNTLET);
        if (!hasGauntlet) return;

        float time = (float) ((System.nanoTime() / 1.0e9) % 3600.0);
        PoseStack pose = context.matrixStack();
        MultiBufferSource.BufferSource buffers = mc.renderBuffers().bufferSource();

        pose.pushPose();
        try {
            // Position relative to camera
            double px = player.getX() - context.camera().getPosition().x;
            double py = player.getY() - context.camera().getPosition().y;
            double pz = player.getZ() - context.camera().getPosition().z;
            pose.translate(px, py, pz);

            // Rotate with the player
            float yaw = player.getYRot();
            pose.mulPose(new Quaternionf().rotationY((float) Math.toRadians(-yaw)));

            // Determine color based on gauntlet type
            boolean isRed = mainHand.is(SiftContent.RED_GAUNTLET) || offHand.is(SiftContent.RED_GAUNTLET);
            float r = isRed ? 1.0f : 0.3f;
            float g = isRed ? 0.3f : 0.6f;
            float b = isRed ? 0.3f : 1.0f;

            // Render energy aura around both arms
            renderArmAura(pose, buffers, time, r, g, b, true);  // right arm
            renderArmAura(pose, buffers, time, r, g, b, false); // left arm

            // Render dimensional tear particles around the hands
            renderTearParticles(pose, buffers, time, r, g, b);
        } finally {
            pose.popPose();
        }
        buffers.endBatch();
    }

    private static void renderArmAura(PoseStack pose, MultiBufferSource buffers, float time,
                                      float r, float g, float b, boolean rightArm) {
        RenderType type = RenderTypes.GLOW;
        VertexConsumer vc = buffers.getBuffer(type);
        var p = pose.last();

        float side = rightArm ? 0.45f : -0.45f;
        float armY = 1.2f; // shoulder height
        float armLength = 0.6f;

        // Render swirling energy rings around the arm
        int rings = 5;
        for (int i = 0; i < rings; i++) {
            float offset = (i / (float) rings) * armLength;
            float ringY = armY - offset;
            float ringRadius = 0.15f + 0.05f * (float) Math.sin(time * 4.0f + i * 1.5f);
            float alpha = 0.6f - offset * 0.5f;

            // Draw a ring of vertices
            int segments = 12;
            for (int j = 0; j < segments; j++) {
                float angle1 = (j / (float) segments) * (float) Math.PI * 2 + time * 2.0f;
                float angle2 = ((j + 1) / (float) segments) * (float) Math.PI * 2 + time * 2.0f;

                float x1 = side + (float) Math.cos(angle1) * ringRadius;
                float z1 = (float) Math.sin(angle1) * ringRadius;
                float x2 = side + (float) Math.cos(angle2) * ringRadius;
                float z2 = (float) Math.sin(angle2) * ringRadius;

                // Draw quad from center to ring edge
                vc.addVertex(p, side, ringY, 0).setColor(r, g, b, alpha * 0.3f);
                vc.addVertex(p, x1, ringY, z1).setColor(r, g, b, alpha);
                vc.addVertex(p, x2, ringY, z2).setColor(r, g, b, alpha);
                vc.addVertex(p, side, ringY, 0).setColor(r, g, b, alpha * 0.3f);
            }
        }
    }

    private static void renderTearParticles(PoseStack pose, MultiBufferSource buffers, float time,
                                            float r, float g, float b) {
        RenderType type = RenderTypes.GLOW;
        VertexConsumer vc = buffers.getBuffer(type);
        var p = pose.last();

        // Render small dimensional tear particles around the hands
        int particleCount = 8;
        for (int i = 0; i < particleCount; i++) {
            float phase = (i / (float) particleCount) * (float) Math.PI * 2;
            float radius = 0.3f + 0.2f * (float) Math.sin(time * 3.0f + phase);
            float angle = phase + time * 1.5f;

            float x = (float) Math.cos(angle) * radius;
            float y = 0.6f + (float) Math.sin(time * 2.0f + phase) * 0.2f;
            float z = (float) Math.sin(angle) * radius;

            float size = 0.05f + 0.02f * (float) Math.sin(time * 5.0f + phase);
            float alpha = 0.7f + 0.3f * (float) Math.sin(time * 4.0f + phase);

            // Draw a small quad for each particle
            vc.addVertex(p, x - size, y - size, z).setColor(r, g, b, alpha);
            vc.addVertex(p, x + size, y - size, z).setColor(r, g, b, alpha);
            vc.addVertex(p, x + size, y + size, z).setColor(r, g, b, alpha);
            vc.addVertex(p, x - size, y + size, z).setColor(r, g, b, alpha);
        }
    }
}
