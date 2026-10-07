package dev.logan.beyond.client.mixin;

import dev.logan.beyond.client.Spaghettification;
import net.minecraft.client.render.VertexConsumerProvider;
import net.minecraft.client.render.entity.EntityRenderDispatcher;
import net.minecraft.client.util.math.MatrixStack;
import net.minecraft.entity.Entity;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/**
 * Client-side tidal stretching. The dispatcher is the single funnel every entity render passes
 * through, whatever its renderer overrides, and the injection sits after the dispatcher has
 * translated into the entity's own frame — so the stretch is applied in place, along the pull
 * axis, without moving the entity. Shadows and name tags are outside the scaled scope.
 */
@Mixin(EntityRenderDispatcher.class)
public abstract class EntityRendererStretchMixin {
    private static final String RENDER = "Lnet/minecraft/client/render/entity/EntityRenderer;render"
        + "(Lnet/minecraft/entity/Entity;FFLnet/minecraft/client/util/math/MatrixStack;"
        + "Lnet/minecraft/client/render/VertexConsumerProvider;I)V";

    @Inject(method = "render", at = @At(value = "INVOKE", target = RENDER))
    private void beyond$stretchStart(Entity entity, double x, double y, double z, float yaw, float tickDelta,
                                     MatrixStack matrices, VertexConsumerProvider vertexConsumers, int light, CallbackInfo info) {
        Spaghettification.beginRender(entity, tickDelta, matrices);
    }

    @Inject(method = "render", at = @At(value = "INVOKE", target = RENDER, shift = At.Shift.AFTER))
    private void beyond$stretchEnd(Entity entity, double x, double y, double z, float yaw, float tickDelta,
                                   MatrixStack matrices, VertexConsumerProvider vertexConsumers, int light, CallbackInfo info) {
        Spaghettification.endRender(entity, matrices);
    }
}
