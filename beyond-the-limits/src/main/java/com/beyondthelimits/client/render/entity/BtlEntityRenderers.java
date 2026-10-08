package com.beyondthelimits.client.render.entity;

import com.beyondthelimits.BeyondTheLimits;
import com.beyondthelimits.registry.BtlEntities;
import net.fabricmc.fabric.api.client.rendering.v1.EntityRendererRegistry;
import net.minecraft.util.Identifier;

/**
 * Chooses a renderer for every entity the mod registers.
 *
 * <p>The mobs that borrow a vanilla body plan (a zombie that has learned, a creeper that hides, a spider
 * that waits) get the vanilla rig with the mod's own texture, so they animate correctly for free and read
 * as the familiar thing they used to be. The mobs with no vanilla equivalent — the Smiler, the Observer,
 * the Black Sun — get renderers written for them: crossed planes for things that should not be
 * inspectable, spheres for things that are not creatures at all.</p>
 */
public final class BtlEntityRenderers {
	private BtlEntityRenderers() {
	}

	public static void register() {
		// ---- rifts -------------------------------------------------------------------------------
		// Drawn as a lens by RiftRenderer; the entity renderer exists only to claim the entity type.
		EntityRendererRegistry.register(BtlEntities.RIFT, RiftPlaceholderRenderer::new);

		// ---- the things at the edge of vision ----------------------------------------------------
		EntityRendererRegistry.register(BtlEntities.OBSERVER,
				context -> new BtlShadowRenderer<>(context, 0.9F, 2.6F, 0.0F, 0.0F, 0.0F, 0.85F, 0.92F));
		EntityRendererRegistry.register(BtlEntities.FOG_SHADE,
				context -> new BtlShadowRenderer<>(context, 1.1F, 2.3F, 0.06F, 0.08F, 0.09F, 0.55F, 0.25F));
		EntityRendererRegistry.register(BtlEntities.FOG_WALKER,
				context -> new BtlHumanoidRenderer<>(context, entityTexture("fog_walker"), 1.15F, false, 0.2F));

		// ---- the sky ------------------------------------------------------------------------------
		EntityRendererRegistry.register(BtlEntities.BLACK_SUN,
				context -> new BtlSphereRenderer<>(context, 48.0F, 0x05010A, 0xFF4A22, 1.6F, 1.0F));
		EntityRendererRegistry.register(BtlEntities.WARHEAD,
				context -> new BtlSphereRenderer<>(context, 0.45F, 0x3A3F44, 0xB9E4FF, 0.8F, 1.0F));

		// ---- backrooms residents -----------------------------------------------------------------
		EntityRendererRegistry.register(BtlEntities.SMILER,
				context -> new BtlHumanoidRenderer<>(context, entityTexture("smiler"), 1.25F, true, 0.1F));
		EntityRendererRegistry.register(BtlEntities.HOUND,
				context -> new BtlQuadrupedRenderer<>(context, entityTexture("hound"), 1.55F));
		EntityRendererRegistry.register(BtlEntities.SKIN_STEALER,
				context -> new BtlHumanoidRenderer<>(context, entityTexture("skin_stealer"), 1.0F, false, 0.0F));
		EntityRendererRegistry.register(BtlEntities.PARTYGOER,
				context -> new BtlHumanoidRenderer<>(context, entityTexture("partygoer"), 1.05F, true, 0.0F));
		EntityRendererRegistry.register(BtlEntities.FACELING,
				context -> new BtlHumanoidRenderer<>(context, entityTexture("faceling"), 1.0F, false, 0.0F));

		// ---- codescape ---------------------------------------------------------------------------
		EntityRendererRegistry.register(BtlEntities.CODE_WRAITH,
				context -> new BtlHumanoidRenderer<>(context, entityTexture("code_wraith"), 1.2F, true, -0.15F));

		// ---- the impossible biome ----------------------------------------------------------------
		EntityRendererRegistry.register(BtlEntities.GIANT_INSECT,
				context -> new BtlSpiderRenderer<>(context, entityTexture("giant_insect"), 2.6F));

		// ---- the evolved ------------------------------------------------------------------------
		EntityRendererRegistry.register(BtlEntities.EVOLVED_ZOMBIE,
				context -> new BtlHumanoidRenderer<>(context, entityTexture("evolved_zombie"), 1.0F, false, 0.35F));
		EntityRendererRegistry.register(BtlEntities.HUNTER_SKELETON,
				context -> new BtlHumanoidRenderer<>(context, entityTexture("hunter_skeleton"), 1.0F, false, 0.15F));
		EntityRendererRegistry.register(BtlEntities.AMBUSH_SPIDER,
				context -> new BtlSpiderRenderer<>(context, entityTexture("ambush_spider"), 1.35F));
		EntityRendererRegistry.register(BtlEntities.HIDING_CREEPER,
				context -> new BtlCreeperRenderer<>(context, entityTexture("hiding_creeper")));

		// ---- reflections and memories ------------------------------------------------------------
		EntityRendererRegistry.register(BtlEntities.MIRROR_DOUBLE,
				context -> new BtlHumanoidRenderer<>(context, entityTexture("mirror_double"), 1.0F, false, 0.0F));
		EntityRendererRegistry.register(BtlEntities.MEMORY_ECHO,
				context -> new BtlHumanoidRenderer<>(context, entityTexture("memory_echo"), 1.0F, true, 0.0F));
	}

	private static Identifier entityTexture(String name) {
		return BeyondTheLimits.id("textures/entity/" + name + ".png");
	}
}
