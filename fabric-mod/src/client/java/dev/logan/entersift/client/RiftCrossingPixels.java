package dev.logan.entersift.client;

import dev.logan.entersift.SiftContent;
import net.fabricmc.fabric.api.client.rendering.v1.level.LevelRenderEvents;
import net.minecraft.client.Minecraft;

/** White, world-space pixel shell during contact. Visible to other players and in third person. */
public final class RiftCrossingPixels {
    private RiftCrossingPixels() {}
    public static void register() {
        LevelRenderEvents.COLLECT_SUBMITS.register(context -> {
            Minecraft mc = Minecraft.getInstance();
            if (mc.level == null || SiftRenderTypes.irisShadowPass()) return;
            var camera = context.levelState().cameraRenderState.pos;
            for (var player : mc.level.players()) {
                if (player == mc.player && mc.options.getCameraType().isFirstPerson()) continue;
                var effect = player.getEffect(SiftContent.RIFT_TRANSIT);
                if (effect == null || effect.getDuration() > 20 || effect.getDuration() < 12) continue;
                float f = (20 - effect.getDuration()) / 8f;
                var pos = player.getPosition(context.levelState().worldPartialTicks).subtract(camera);
                float yaw = player.getYRot();
                var pose = context.poseStack();
                pose.pushPose();
                pose.translate(pos.x, pos.y, pos.z);
                pose.rotate(new org.joml.Quaternionf().rotationY((float)Math.toRadians(-yaw)));
                context.submitNodeCollector().submitCustomGeometry(pose, SiftRenderTypes.GLOW, (p, vc) -> {
                    for (int y = 0; y < 9; y++) for (int x = -2; x <= 2; x++) for (int z = -1; z <= 1; z++) {
                        if (Math.abs(x) == 2 && (y < 3 || y > 6)) continue;
                        float noise = RiftShape.hash(173, x + y * 7, z + 13);
                        if (noise > 0.25f + f * 0.75f) continue;
                        float scatter = Math.max(0, f - 0.55f) * 1.5f;
                        RiftPortalRenderer.voxel(p, vc, x * .18f + (noise - .5f) * scatter,
                            .1f + y * .2f + scatter * noise, z * .16f + scatter * (noise - .5f),
                            .105f, .105f, .105f, new float[]{1f, 1f, 1f}, .5f + f * .5f);
                    }
                });
                pose.popPose();
            }
        });
    }
}
