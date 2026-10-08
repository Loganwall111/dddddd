package com.beyondthelimits.client.render.entity;

import net.minecraft.client.render.VertexConsumerProvider;
import net.minecraft.client.render.entity.EntityRenderer;
import net.minecraft.client.render.entity.EntityRendererFactory;
import net.minecraft.client.util.math.MatrixStack;
import net.minecraft.entity.Entity;
import net.minecraft.util.Identifier;

/**
 * Registers no geometry for the rift entity.
 *
 * <p>The rift exists on the server as an entity so that it can be saved, tracked and hit — but it is
 * drawn by {@code RiftRenderer} as a lens rather than as a model, which is the whole point of the design:
 * a rift is a thing the world does, not a thing the world contains. Registering this empty renderer keeps
 * the entity from being treated as an unknown renderer (which would log a warning for every rift in the
 * world) while still drawing nothing itself.</p>
 */
public class RiftPlaceholderRenderer<T extends Entity> extends EntityRenderer<T> {
	public RiftPlaceholderRenderer(EntityRendererFactory.Context context) {
		super(context);
		this.shadowRadius = 0.0F;
	}

	@Override
	public void render(T entity, float yaw, float tickDelta, MatrixStack matrices, VertexConsumerProvider vertexConsumers,
			int light) {
		// Deliberately empty: RiftRenderer draws rifts as light, not as geometry.
	}

	@Override
	public Identifier getTexture(T entity) {
		return null;
	}
}
