package com.beyondthelimits.client.particle;

import com.beyondthelimits.registry.BtlParticles;
import net.fabricmc.fabric.api.client.particle.v1.ParticleFactoryRegistry;
import net.minecraft.client.particle.ParticleTextureSheet;
import net.minecraft.particle.ParticleEffect;

/**
 * Client-side definitions for the mod's ten particle types.
 *
 * <p>Each entry is a recipe: how the particle moves, how long it lives, how big it gets, whether it
 * glows, and which sheet it is drawn on. Nothing here allocates per frame; a particle is created once and
 * then ticked.</p>
 */
public final class BtlParticleTypes {
	private BtlParticleTypes() {
	}

	public static void register() {
		// Rift sparks: torn-off pieces of another world, rising and scrolling.
		register(BtlParticles.RIFT_SPARK, new BtlParticle.Behaviour(-0.004F, 0.94F, 0.012F, 0.35F, 0.08F, 0.16F,
				24, 60, 0.06F, true, true, true), ParticleTextureSheet.PARTICLE_SHEET_TRANSLUCENT, 0.75F, 0.65F, 1.0F, 0.95F);

		// Reality dust: what the world leaves behind when something impossible happens in it.
		register(BtlParticles.REALITY_DUST, BtlParticle.Behaviour.of(0.004F, -0.004F, 0.5F, 0.05F, 0.02F, 50, true),
				ParticleTextureSheet.PARTICLE_SHEET_LIT, 0.65F, 0.85F, 1.0F, 0.8F);

		// Reality scars: long-lived marks left where the world was edited.
		register(BtlParticles.REALITY_SCAR, new BtlParticle.Behaviour(0.0F, 0.98F, 0.0F, 0.1F, 0.22F, 0.34F,
				60, 140, 0.02F, true, false, false), ParticleTextureSheet.PARTICLE_SHEET_TRANSLUCENT, 0.35F, 0.15F, 0.55F, 0.6F);

		// Code glyphs: falling source code, drawn on the lit sheet so it stays readable in the dark.
		register(BtlParticles.CODE_GLYPH, new BtlParticle.Behaviour(0.012F, 0.99F, -0.02F, 0.08F, 0.09F, 0.13F,
				30, 90, 0.0F, true, false, true), ParticleTextureSheet.PARTICLE_SHEET_LIT, 0.35F, 1.0F, 0.55F, 1.0F);

		// Bleed drips: the falling ones. Heavy, dark and slow.
		register(BtlParticles.BLEED_DRIP, BtlParticle.Behaviour.of(0.03F, -0.01F, 0.05F, 0.06F, 0.03F, 80, true),
				ParticleTextureSheet.PARTICLE_SHEET_TRANSLUCENT, 0.25F, 0.02F, 0.05F, 0.95F);

		// Fog mites: the motes that make the Foglands' visibility limit feel alive.
		register(BtlParticles.FOG_MOTE, new BtlParticle.Behaviour(0.0F, 0.97F, 0.0F, 0.15F, 0.3F, 0.45F,
				100, 220, 0.01F, false, false, false), ParticleTextureSheet.PARTICLE_SHEET_TRANSLUCENT, 0.8F, 0.85F, 0.85F, 0.28F);

		// Black sun corona: light that should not be coming off a black object.
		register(BtlParticles.BLACK_SUN_CORONA, new BtlParticle.Behaviour(-0.002F, 0.99F, 0.01F, 0.25F, 0.5F, 1.1F,
				40, 90, 0.03F, true, false, false), ParticleTextureSheet.PARTICLE_SHEET_TRANSLUCENT, 1.0F, 0.45F, 0.75F, 0.9F);

		// Memory motes: the recorder's own dust, gold and slow.
		register(BtlParticles.MEMORY_MOTE, new BtlParticle.Behaviour(0.0F, 0.96F, 0.008F, 0.12F, 0.06F, 0.11F,
				60, 160, 0.02F, false, true, true), ParticleTextureSheet.PARTICLE_SHEET_LIT, 1.0F, 0.92F, 0.6F, 0.9F);

		// Mirror mites: cold, reflective, absolutely still.
		register(BtlParticles.MIRROR_MOTE, BtlParticle.Behaviour.of(0.0F, 0.0F, 0.05F, 0.05F, 0.04F, 90, true),
				ParticleTextureSheet.PARTICLE_SHEET_TRANSLUCENT, 0.75F, 0.85F, 0.95F, 0.75F);

		// Static noise: the Wrong Minecraft's texture errors, made physical.
		register(BtlParticles.STATIC_NOISE, new BtlParticle.Behaviour(0.01F, 0.9F, 0.0F, 0.4F, 0.05F, 0.09F,
				6, 18, 0.5F, true, false, true), ParticleTextureSheet.PARTICLE_SHEET_TRANSLUCENT, 1.0F, 1.0F, 1.0F, 0.9F);
	}

	private static <T extends ParticleEffect> void register(net.minecraft.particle.ParticleType<T> type,
			BtlParticle.Behaviour behaviour, ParticleTextureSheet sheet, float red, float green, float blue, float alpha) {
		ParticleFactoryRegistry.getInstance().register(type, spriteProvider ->
				(effect, world, x, y, z, velocityX, velocityY, velocityZ) -> new BtlParticle(world, x, y, z,
						velocityX, velocityY, velocityZ, spriteProvider, behaviour, sheet).tint(red, green, blue, alpha));
	}
}
