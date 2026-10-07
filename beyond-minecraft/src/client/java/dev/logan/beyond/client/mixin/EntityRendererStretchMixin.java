package dev.logan.beyond.client.mixin;

import dev.logan.beyond.client.Spaghettification;
import net.minecraft.client.render.VertexConsumerProvider;
import net.minecraft.client.render.entity.EntityRenderer;
import net.minecraft.client.util.math.MatrixStack;
import net.minecraft.entity.Entity;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/** Tidal hook for entities whose renderer inherits the base EntityRenderer.render method. */
@Mixin(EntityRenderer.class)
public abstract class EntityRendererStretchMixin {
    @Inject(method = "render", at = @At("HEAD"))
    private void beyond$stretchStart(Entity entity, float yaw, float tickDelta, MatrixStack matrices,
                                     VertexConsumerProvider vertexConsumers, int light, CallbackInfo info) {
        Spaghettification.beginRender(entity, tickDelta, matrices);
    }
    @Inject(method = "render", at = @At("RETURN"))
    private void beyond$stretchEnd(Entity entity, float yaw, float tickDelta, MatrixStack matrices,
                                   VertexConsumerProvider vertexConsumers, int light, CallbackInfo info) {
        Spaghettification.endRender(entity, matrices);
    }
}
