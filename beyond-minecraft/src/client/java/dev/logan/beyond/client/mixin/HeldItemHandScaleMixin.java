package dev.logan.beyond.client.mixin;

import net.minecraft.client.network.ClientPlayerEntity;
import net.minecraft.client.render.VertexConsumerProvider;
import net.minecraft.client.render.item.HeldItemRenderer;
import net.minecraft.client.util.math.MatrixStack;
import net.minecraft.entity.attribute.EntityAttributes;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/**
 * Beyond's scale ladder reaches a thousandth of a body and four thousand bodies. Vanilla draws the
 * first-person hand at the player's own scale, so at those rungs the held item becomes a colossal
 * slab drawn across the whole view — the "box in front of your face". Above and below hand scale the
 * hand is hidden instead, which is honest: at 4096× your hand is nowhere near your eye anyway.
 *
 * <p>Injection is optional ({@code require = 0}) so a mapping change degrades to vanilla behaviour
 * rather than refusing to start the game.
 */
@Mixin(HeldItemRenderer.class)
public abstract class HeldItemHandScaleMixin {
    private static final float MAX_HAND_SCALE = 2.35f;
    private static final float MIN_HAND_SCALE = .55f;

    @Inject(method = "render", at = @At("HEAD"), cancellable = true, require = 0)
    private void beyond$hideAbsurdHand(float tickDelta, MatrixStack matrices, VertexConsumerProvider vertexConsumers,
                                       ClientPlayerEntity player, int light, CallbackInfo info) {
        if (player == null) return;
        // Read the same attribute the server sets, rather than a version-specific entity helper.
        float scale = (float) player.getAttributeValue(EntityAttributes.GENERIC_SCALE);
        if (scale > MAX_HAND_SCALE || scale < MIN_HAND_SCALE) info.cancel();
    }
}
