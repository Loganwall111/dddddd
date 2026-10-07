package dev.logan.beyond.client.mixin;

import dev.logan.beyond.client.Spaghettification;
import net.minecraft.client.render.VertexConsumerProvider;
import net.minecraft.client.render.entity.MobEntityRenderer;
import net.minecraft.client.util.math.MatrixStack;
import net.minecraft.entity.mob.MobEntity;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/**
 * Mob renderers replace {@code render} (they add the leash pass), so the base and living hooks are
 * bypassed for every mob — including this mod's own Realm Critter. This hook covers that level;
 * nested super calls are deduplicated inside {@link Spaghettification}.
 */
@Mixin(MobEntityRenderer.class)
public abstract class MobEntityRendererStretchMixin {
    @Inject(method = "render", at = @At("HEAD"))
    private void beyond$stretchMobStart(MobEntity entity, float yaw, float tickDelta, MatrixStack matrices,
                                        VertexConsumerProvider vertexConsumers, int light, CallbackInfo info) {
        Spaghettification.beginRender(entity, tickDelta, matrices);
    }

    @Inject(method = "render", at = @At("RETURN"))
    private void beyond$stretchMobEnd(MobEntity entity, float yaw, float tickDelta, MatrixStack matrices,
                                      VertexConsumerProvider vertexConsumers, int light, CallbackInfo info) {
        Spaghettification.endRender(entity, matrices);
    }
}
