package com.beyondthelimits.client.render.entity;

import net.minecraft.client.render.entity.EntityRendererFactory;
import net.minecraft.client.render.entity.MobEntityRenderer;
import net.minecraft.client.render.entity.model.EntityModelLayers;
import net.minecraft.client.render.entity.model.SpiderEntityModel;
import net.minecraft.entity.mob.MobEntity;
import net.minecraft.util.Identifier;

/** Crawlers: ambush spiders and the Impossible Biome's giant insects, sharing vanilla's eight-legged rig. */
public class BtlSpiderRenderer<T extends MobEntity> extends MobEntityRenderer<T, SpiderEntityModel<T>> {
	private final Identifier texture;
	private final float scale;

	public BtlSpiderRenderer(EntityRendererFactory.Context context, Identifier texture, float scale) {
		super(context, new SpiderEntityModel<>(context.getPart(EntityModelLayers.SPIDER)), 0.8F * scale);
		this.texture = texture;
		this.scale = scale;
	}

	@Override
	public Identifier getTexture(T entity) {
		return this.texture;
	}

	@Override
	protected float getLyingAngle(T entity) {
		return 180.0F;
	}

	public float scale() {
		return this.scale;
	}
}
