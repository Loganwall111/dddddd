package dev.logan.beyondthreshold.client.render;

import net.minecraft.client.render.VertexConsumerProvider;
import net.minecraft.client.render.entity.EntityRenderer;
import net.minecraft.client.render.entity.EntityRendererFactory;
import net.minecraft.client.util.math.MatrixStack;
import net.minecraft.entity.Entity;
import net.minecraft.util.Identifier;

/** Threshold entities are pure shader geometry drawn by EntityFxRenderer. */
public class NoopRenderer extends EntityRenderer<Entity> {
	public NoopRenderer(EntityRendererFactory.Context ctx) {
		super(ctx);
	}

	@Override
	public Identifier getTexture(Entity entity) {
		return null;
	}

	@Override
	public void render(Entity entity, float yaw, float tickDelta, MatrixStack matrices,
	                   VertexConsumerProvider vertexConsumers, int light) {
	}
}
