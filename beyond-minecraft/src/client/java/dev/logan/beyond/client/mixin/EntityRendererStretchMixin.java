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
 * Client-side tidal stretching. Every entity render pushes a matrix, and an entity inside a well's
 * tidal reach is drawn stretched along the pull axis and thinned out — the render-side half of
 * spaghettification. Nothing about the entity itself, its collision or its health is modified.
 *
 * <p>The rotation is built from an explicit axis and angle rather than a direction-pair helper, so
 * the transform is unambiguous for both horizontal and vertical pulls.
 */
@Mixin(EntityRenderer.class)
public abstract class EntityRendererStretchMixin {
    private static final Vector3f UP = new Vector3f(0f, 1f, 0f);
    @Inject(method = "render", at = @At("HEAD"))
    private void beyond$stretchStart(Entity entity, float yaw, float tickDelta, MatrixStack matrices,
                                     VertexConsumerProvider vertexConsumers, int light, CallbackInfo info) {
        matrices.push();
        var stretch = Spaghettification.forEntity(entity);
        if (stretch == null) return;
        // Express the world-space pull in the entity's own rotated frame: yaw leaves Y alone, so a
        // vertical pull stays vertical and is correct for every renderer.
        Vector3f local = new Vector3f(stretch.direction()).rotateY((float) Math.toRadians(-entity.getYaw(tickDelta))).normalize();
        Quaternionf tilt = rotationTowards(local);   // null: the pull is already along +Y
        Quaternionf untilt = tilt == null ? null : tilt.conjugate(new Quaternionf());
        if (tilt != null) matrices.multiply(tilt);
        float amount = stretch.amount();
        float thin = 1f / (float) Math.sqrt(amount);
        matrices.scale(thin, amount, thin);
        if (untilt != null) matrices.multiply(untilt);
        Spaghettification.lastStretch = amount;
        Spaghettification.applied++;
    }
    /** Shortest rotation taking +Y onto {@code local}, or null when the two are already aligned. */
    private static Quaternionf rotationTowards(Vector3f local) {
        float dot = Math.clamp(UP.dot(local), -1f, 1f);
        if (dot > .9999f) return null;
        Vector3f axis = new Vector3f(UP).cross(local);
        if (axis.lengthSquared() < 1e-7f) return new Quaternionf().rotationAxis((float) Math.PI, 1f, 0f, 0f);
        return new Quaternionf().rotationAxis((float) Math.acos(dot), axis.normalize());
    }
    @Inject(method = "render", at = @At("RETURN"))
    private void beyond$stretchEnd(Entity entity, float yaw, float tickDelta, MatrixStack matrices,
                                   VertexConsumerProvider vertexConsumers, int light, CallbackInfo info) {
        matrices.pop();
    }
}
