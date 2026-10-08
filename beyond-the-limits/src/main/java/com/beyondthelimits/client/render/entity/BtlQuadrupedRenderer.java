package com.beyondthelimits.client.render.entity;

import net.fabricmc.fabric.api.client.rendering.v1.EntityModelLayerRegistry;
import net.minecraft.client.model.Dilation;
import net.minecraft.client.render.entity.EntityRendererFactory;
import net.minecraft.client.render.entity.MobEntityRenderer;
import net.minecraft.client.render.entity.model.EntityModelLayer;
import net.minecraft.client.render.entity.model.QuadrupedEntityModel;
import net.minecraft.entity.mob.MobEntity;
import net.minecraft.util.Identifier;

/**
 * Four-legged hunters — the Backrooms' hounds and the things the Foglands keep behind the mist.
 *
 * <p>They deliberately use vanilla's quadruped body plan rather than a bespoke rig, because a player
 * recognises the shape instantly and that recognition is the scare: it moves like an animal, with the
 * leg cycle and head bob of every quadruped in the game, while the texture on it belongs to something
 * else. A body that animates correctly is far more unsettling than one that does not.</p>
 *
 * <p>The model layer is registered once from {@link BtlEntityRenderers#register()}, so the vanilla
 * entity model loader bakes it during the resource reload like any other layer.</p>
 */
public class BtlQuadrupedRenderer<T extends MobEntity> extends MobEntityRenderer<T, QuadrupedEntityModel<T>> {
	/** The layer every quadruped in the mod shares: one baked model, many mobs, no per-mob cost. */
	public static final EntityModelLayer LAYER = new EntityModelLayer(
			Identifier.of("beyondthelimits", "quadruped"), "main");

	private final Identifier texture;

	public BtlQuadrupedRenderer(EntityRendererFactory.Context context, Identifier texture, float scale) {
		super(context, new QuadrupedEntityModel<>(context.getPart(LAYER), true, 8.0F, 7.0F, 2.0F, 2.0F, 24),
				0.4F * scale);
		this.texture = texture;
	}

	/** Called during client init, before any renderer asks for the layer. */
	public static void registerModelLayer() {
		// Stance width 10 is the body plan the game's own four-legged animals use.
		EntityModelLayerRegistry.registerModelLayer(LAYER,
				() -> QuadrupedEntityModel.getModelData(10, Dilation.NONE));
	}

	@Override
	public Identifier getTexture(T entity) {
		return this.texture;
	}
}
