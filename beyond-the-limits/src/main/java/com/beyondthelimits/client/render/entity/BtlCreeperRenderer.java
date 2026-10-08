package com.beyondthelimits.client.render.entity;

import net.minecraft.client.render.RenderLayer;
import net.minecraft.client.render.entity.EntityRendererFactory;
import net.minecraft.client.render.entity.MobEntityRenderer;
import net.minecraft.client.render.entity.model.CreeperEntityModel;
import net.minecraft.client.render.entity.model.EntityModelLayers;
import net.minecraft.entity.mob.MobEntity;
import net.minecraft.util.Identifier;

/** The hiding creeper, which is a normal creeper that has learned to hold its breath. */
public class BtlCreeperRenderer<T extends MobEntity> extends MobEntityRenderer<T, CreeperEntityModel<T>> {
	private final Identifier texture;

	public BtlCreeperRenderer(EntityRendererFactory.Context context, Identifier texture) {
		super(context, new CreeperEntityModel<>(context.getPart(EntityModelLayers.CREEPER)), 0.5F);
		this.texture = texture;
	}

	@Override
	public Identifier getTexture(T entity) {
		return this.texture;
	}

	/** Charged creepers glow; the hiding creeper borrows the same trick for its pre-detonation tell. */
	@Override
	protected RenderLayer getRenderLayer(T entity, boolean showBody, boolean translucent, boolean showOutline) {
		return super.getRenderLayer(entity, showBody, translucent, showOutline);
	}
}
