package dev.logan.beyond.client.mixin;

import dev.logan.beyond.client.Spaghettification;
import net.minecraft.client.render.VertexConsumerProvider;
import net.minecraft.client.render.entity.EntityRenderer;
import net.minecraft.client.util.math.MatrixStack;
import net.minecraft.entity.Entity;
import org.joml.Quaternionf;
import org.joml.Vector3f;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/**
 * Client-side tidal stretching. Pushes a matrix around every entity render and pops it afterwards,
 * so an entity inside a well's tidal reach is drawn along the pull axis. Nothing about the entity
 * itself is modified.
 */
@Mixin(EntityRenderer.class)
public abstract class EntityRendererStretchMixin {
    @Inject(method = "render", at = @At("HEAD"))
    private void beyond$stretchStart(Entity entity, float yaw, float tickDelta, MatrixStack matrices,
                                     VertexConsumerProvider vertexConsumers, int light, CallbackInfo info) {
        matrices.push();
        var stretch = Spaghettification.forEntity(entity);
        if (stretch == null) return;
        // Express the world-space pull in the entity's own rotated frame, then stretch along it.
        Vector3f local = new Vector3f(stretch.direction());
        local.rotateY((float) Math.toRadians(-entity.getYaw(tickDelta)));
        Quaternionf tilt = new Quaternionf().rotationTo(new Vector3f(0f, 1f, 0f), local);
        Quaternionf untilt = tilt.conjugate(new Quaternionf());
        matrices.multiply(tilt);
        float amount = stretch.amount();
        float thin = 1f / (float) Math.sqrt(amount);
        matrices.scale(thin, amount, thin);
        matrices.multiply(untilt);
        Spaghettification.lastStretch = amount;
        Spaghettification.applied++;
    }
    @Inject(method = "render", at = @At("RETURN"))
    private void beyond$stretchEnd(Entity entity, float yaw, float tickDelta, MatrixStack matrices,
                                   VertexConsumerProvider vertexConsumers, int light, CallbackInfo info) {
        matrices.pop();
    }
}
