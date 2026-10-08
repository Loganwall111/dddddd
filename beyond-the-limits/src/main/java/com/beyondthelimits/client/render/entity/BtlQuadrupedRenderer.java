package com.beyondthelimits.client.render.entity;

import net.minecraft.client.render.entity.EntityRendererFactory;
import net.minecraft.client.render.entity.MobEntityRenderer;
import net.minecraft.client.render.entity.model.EntityModelLayers;
import net.minecraft.client.render.entity.model.WolfEntityModel;
import net.minecraft.entity.mob.MobEntity;
import net.minecraft.util.Identifier;

/** Four-legged hunters — the Backrooms' hounds and the things the Foglands keep behind the mist. */
public class BtlQuadrupedRenderer<T extends MobEntity> extends MobEntityRenderer<T, WolfEntityModel<T>> {
	private final Identifier texture;

	public BtlQuadrupedRenderer(EntityRendererFactory.Context context, Identifier texture, float scale) {
		super(context, new WolfEntityModel<>(context.getPart(EntityModelLayers.WOLF)), 0.4F * scale);
		this.texture = texture;
	}

	@Override
	public Identifier getTexture(T entity) {
		return this.texture;
	}
}
