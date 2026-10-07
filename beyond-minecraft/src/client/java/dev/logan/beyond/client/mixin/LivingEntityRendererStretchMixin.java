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

/**
 * The same tidal stretch for living entities. {@code LivingEntityRenderer} overrides
 * {@code EntityRenderer.render}, so mobs never pass through the entity hook: this is the path that
 * makes a whole crowd of animals and monsters visibly stretch and thin out as a well drags them in.
 *
 * <p>The descriptor is written out in full on purpose. The class also carries a synthetic bridge
 * method with the same name and the erased {@code Entity} parameter, and matching on the exact
 * signature keeps the injection pointed at the real renderer method.
 */
@Mixin(LivingEntityRenderer.class)
public abstract class LivingEntityRendererStretchMixin {
    @Inject(method = "render(Lnet/minecraft/entity/LivingEntity;FFLnet/minecraft/client/util/math/MatrixStack;"
            + "Lnet/minecraft/client/render/VertexConsumerProvider;I)V", at = @At("HEAD"))
    private void beyond$stretchStart(LivingEntity entity, float yaw, float tickDelta, MatrixStack matrices,
                                     VertexConsumerProvider vertexConsumers, int light, CallbackInfo info) {
        Spaghettification.wind(entity, tickDelta, matrices);
    }
    @Inject(method = "render(Lnet/minecraft/entity/LivingEntity;FFLnet/minecraft/client/util/math/MatrixStack;"
            + "Lnet/minecraft/client/render/VertexConsumerProvider;I)V", at = @At("RETURN"))
    private void beyond$stretchEnd(LivingEntity entity, float yaw, float tickDelta, MatrixStack matrices,
                                   VertexConsumerProvider vertexConsumers, int light, CallbackInfo info) {
        Spaghettification.unwind(matrices);
    }
}
