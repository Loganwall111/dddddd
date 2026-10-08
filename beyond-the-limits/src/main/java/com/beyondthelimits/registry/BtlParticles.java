package com.beyondthelimits.registry;

import com.beyondthelimits.BeyondTheLimits;
import net.fabricmc.fabric.api.particle.v1.FabricParticleTypes;
import net.minecraft.particle.SimpleParticleType;
import net.minecraft.registry.Registries;
import net.minecraft.registry.Registry;

/**
 * Custom particle types.
 *
 * <p>Particles are how Beyond the Limits makes its rifts, storms and corruptions visible without a
 * single extra rendering pass: every effect in the mod is built from these primitives plus the
 * custom GLSL core shaders in {@code assets/beyondthelimits/shaders/core}.</p>
 */
public final class BtlParticles {
	private BtlParticles() {
	}

	public static final SimpleParticleType RIFT_SPARK = FabricParticleTypes.simple(true);
	public static final SimpleParticleType REALITY_DUST = FabricParticleTypes.simple(false);
	public static final SimpleParticleType REALITY_SCAR = FabricParticleTypes.simple(false);
	public static final SimpleParticleType CODE_GLYPH = FabricParticleTypes.simple(true);
	public static final SimpleParticleType BLEED_DRIP = FabricParticleTypes.simple(false);
	public static final SimpleParticleType FOG_MOTE = FabricParticleTypes.simple(true);
	public static final SimpleParticleType BLACK_SUN_CORONA = FabricParticleTypes.simple(true);
	public static final SimpleParticleType MEMORY_MOTE = FabricParticleTypes.simple(false);
	public static final SimpleParticleType MIRROR_MOTE = FabricParticleTypes.simple(false);
	public static final SimpleParticleType STATIC_NOISE = FabricParticleTypes.simple(true);

	public static void register() {
		Registry.register(Registries.PARTICLE_TYPE, BeyondTheLimits.id("rift_spark"), RIFT_SPARK);
		Registry.register(Registries.PARTICLE_TYPE, BeyondTheLimits.id("reality_dust"), REALITY_DUST);
		Registry.register(Registries.PARTICLE_TYPE, BeyondTheLimits.id("reality_scar"), REALITY_SCAR);
		Registry.register(Registries.PARTICLE_TYPE, BeyondTheLimits.id("code_glyph"), CODE_GLYPH);
		Registry.register(Registries.PARTICLE_TYPE, BeyondTheLimits.id("bleed_drip"), BLEED_DRIP);
		Registry.register(Registries.PARTICLE_TYPE, BeyondTheLimits.id("fog_mote"), FOG_MOTE);
		Registry.register(Registries.PARTICLE_TYPE, BeyondTheLimits.id("black_sun_corona"), BLACK_SUN_CORONA);
		Registry.register(Registries.PARTICLE_TYPE, BeyondTheLimits.id("memory_mote"), MEMORY_MOTE);
		Registry.register(Registries.PARTICLE_TYPE, BeyondTheLimits.id("mirror_mote"), MIRROR_MOTE);
		Registry.register(Registries.PARTICLE_TYPE, BeyondTheLimits.id("static_noise"), STATIC_NOISE);
	}
}
