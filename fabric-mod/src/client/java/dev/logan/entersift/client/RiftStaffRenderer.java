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
 * 0.22 Rift Staff client-side renderer: renders a gigantic floating animated blue cube above the staff
 * when the player is holding it. The cube rotates, pulses, and has a glowing aura effect.
 */
public final class RiftStaffRenderer {
    private RiftStaffRenderer() {}

    public static void register() {
        WorldRenderEvents.AFTER_TRANSLUCENT.register(RiftStaffRenderer::renderStaffCube);
    }

    private static void renderStaffCube(WorldRenderContext context) {
        Minecraft mc = Minecraft.getInstance();
        Player player = mc.player;
        if (player == null) return;

        ItemStack mainHand = player.getItemInHand(InteractionHand.MAIN_HAND);
        ItemStack offHand = player.getItemInHand(InteractionHand.OFF_HAND);
        boolean holdingStaff = mainHand.is(SiftContent.RIFT_STAFF) || offHand.is(SiftContent.RIFT_STAFF);
        if (!holdingStaff) return;

        float time = (float) ((System.nanoTime() / 1.0e9) % 3600.0);
        PoseStack pose = context.matrixStack();
        MultiBufferSource.BufferSource buffers = mc.renderBuffers().bufferSource();

        pose.pushPose();
        try {
            // Position the cube above the player's head
            double px = player.getX() - context.camera().getPosition().x;
            double py = player.getY() - context.camera().getPosition().y + 2.8f;
            double pz = player.getZ() - context.camera().getPosition().z;
            pose.translate(px, py, pz);

            // Rotate the cube
            float rotY = time * 0.8f;
            float rotX = (float) Math.sin(time * 0.5f) * 0.3f;
            pose.mulPose(new Quaternionf().rotationY(rotY));
            pose.mulPose(new Quaternionf().rotationX(rotX));

            // Pulse the size
            float scale = 0.8f + 0.15f * (float) Math.sin(time * 2.0f);
            pose.scale(scale, scale, scale);

            // Render the cube with glowing blue material
            renderCube(pose, buffers, time);
        } finally {
            pose.popPose();
        }
        buffers.endBatch();
    }

    private static void renderCube(PoseStack pose, MultiBufferSource buffers, float time) {
        RenderType type = RenderTypes.GLOW;
        VertexConsumer vc = buffers.getBuffer(type);
        float s = 0.6f; // half-size

        // Cube faces with glowing blue color
        float r = 0.3f + 0.1f * (float) Math.sin(time * 3.0f);
        float g = 0.6f + 0.2f * (float) Math.sin(time * 2.5f + 1.0f);
        float b = 1.0f;
        float a = 0.85f;

        // Front face
        addQuad(pose, vc, -s, -s, s, s, -s, s, s, s, s, -s, s, s, r, g, b, a);
        // Back face
        addQuad(pose, vc, s, -s, -s, -s, -s, -s, -s, s, -s, s, -s, -s, r, g, b, a);
        // Top face
        addQuad(pose, vc, -s, s, -s, s, s, -s, s, s, s, -s, s, s, r, g, b, a);
        // Bottom face
        addQuad(pose, vc, -s, -s, s, s, -s, s, s, -s, -s, -s, -s, -s, r * 0.7f, g * 0.7f, b * 0.7f, a);
        // Right face
        addQuad(pose, vc, s, -s, s, s, -s, -s, s, s, -s, s, s, s, r * 0.85f, g * 0.85f, b * 0.85f, a);
        // Left face
        addQuad(pose, vc, -s, -s, -s, -s, -s, s, -s, s, s, -s, s, -s, r * 0.85f, g * 0.85f, b * 0.85f, a);
    }

    private static void addQuad(PoseStack pose, VertexConsumer vc,
                                float x0, float y0, float z0, float x1, float y1, float z1,
                                float x2, float y2, float z2, float x3, float y3, float z3,
                                float r, float g, float b, float a) {
        var p = pose.last();
        vc.addVertex(p, x0, y0, z0).setColor(r, g, b, a);
        vc.addVertex(p, x1, y1, z1).setColor(r, g, b, a);
        vc.addVertex(p, x2, y2, z2).setColor(r, g, b, a);
        vc.addVertex(p, x3, y3, z3).setColor(r, g, b, a);
    }
}
