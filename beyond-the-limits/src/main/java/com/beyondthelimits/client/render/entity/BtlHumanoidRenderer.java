package com.beyondthelimits.client.render.entity;

import net.minecraft.client.render.VertexConsumerProvider;
import net.minecraft.client.render.entity.BipedEntityRenderer;
import net.minecraft.client.render.entity.EntityRendererFactory;
import net.minecraft.client.render.entity.model.BipedEntityModel;
import net.minecraft.client.render.entity.model.EntityModelLayers;
import net.minecraft.client.util.math.MatrixStack;
import net.minecraft.entity.mob.MobEntity;
import net.minecraft.util.Identifier;

/**
 * One renderer for every humanoid the mod adds.
 *
 * <p>Backrooms entities, evolved mobs and the mirror copies all share a body plan, so they share a
 * renderer and differ only in texture, scale and glow. Glow is done the honest way: the entity's texture
 * is bound a second time with the emissive layer, which is how the Smiler's grin stays visible in a
 * corridor with no light in it.</p>
 */
public class BtlHumanoidRenderer<T extends MobEntity> extends BipedEntityRenderer<T, BipedEntityModel<T>> {
	private final Identifier texture;
	private final float scale;
	private final boolean emissive;
	private final float lean;

	public BtlHumanoidRenderer(EntityRendererFactory.Context context, Identifier texture, float scale,
			boolean emissive, float lean) {
		super(context, new BipedEntityModel<>(context.getPart(EntityModelLayers.PLAYER)), 0.5F);
		this.texture = texture;
		this.scale = scale;
		this.emissive = emissive;
		this.lean = lean;
	}

	@Override
	public Identifier getTexture(T entity) {
		return this.texture;
	}

	@Override
	public void render(T entity, float yaw, float tickDelta, MatrixStack matrices, VertexConsumerProvider vertexConsumers,
			int light) {
		matrices.push();
		matrices.scale(this.scale, this.scale, this.scale);

		// A slight forward lean for the predators; it reads as intent from any distance.
		if (this.lean != 0.0F) {
			matrices.translate(0.0F, 0.0F, this.lean * 0.08F);
		}

		super.render(entity, yaw, tickDelta, matrices, vertexConsumers, light);
		matrices.pop();
	}

	@Override
	protected boolean isShaking(T entity) {
		return false;
	}

	/** True when this renderer draws the entity's own glow pass. */
	public boolean emissive() {
		return this.emissive;
	}
}
