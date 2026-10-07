package dev.logan.beyond.client.mixin;

import dev.logan.beyond.client.Spaghettification;
import net.minecraft.client.render.VertexConsumerProvider;
import net.minecraft.client.render.entity.LivingEntityRenderer;
import net.minecraft.client.util.math.MatrixStack;
import net.minecraft.entity.LivingEntity;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/** Living renderers override EntityRenderer.render, so they need their own tidal matrix hooks. */
@Mixin(LivingEntityRenderer.class)
public abstract class LivingEntityRendererStretchMixin {
    @Inject(method = "render", at = @At("HEAD"))
    private void beyond$stretchLivingStart(LivingEntity entity, float yaw, float tickDelta, MatrixStack matrices,
                                           VertexConsumerProvider vertexConsumers, int light, CallbackInfo info) {
        Spaghettification.beginRender(entity, tickDelta, matrices);
    }

    @Inject(method = "render", at = @At("RETURN"))
    private void beyond$stretchLivingEnd(LivingEntity entity, float yaw, float tickDelta, MatrixStack matrices,
                                         VertexConsumerProvider vertexConsumers, int light, CallbackInfo info) {
        Spaghettification.endRender(entity, matrices);
    }
}
