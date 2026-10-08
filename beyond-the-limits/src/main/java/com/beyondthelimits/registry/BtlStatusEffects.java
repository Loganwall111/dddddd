package com.beyondthelimits.registry;

import com.beyondthelimits.BeyondTheLimits;
import net.minecraft.entity.LivingEntity;
import net.minecraft.entity.effect.StatusEffect;
import net.minecraft.entity.effect.StatusEffectCategory;
import net.minecraft.registry.Registries;
import net.minecraft.registry.Registry;
import net.minecraft.registry.entry.RegistryEntry;
import net.minecraft.server.network.ServerPlayerEntity;

/**
 * The three states the world can put you in.
 *
 * <p>They are intentionally not "buffs and debuffs": their tooltips read as in-universe
 * documentation rather than game rules, and their whole job is to move the player between the
 * mod's systems.</p>
 */
public final class BtlStatusEffects {
	private BtlStatusEffects() {
	}

	/** Reality sickness. It is not damage — it is your interface, coordinates and audio lying to you. */
	public static final RegistryEntry.Reference<StatusEffect> DEMENTIA = Registry.registerReference(Registries.STATUS_EFFECT, BeyondTheLimits.id("dementia"), new StatusEffect(StatusEffectCategory.HARMFUL, 0x5A2E8C) {
		@Override
		public boolean canApplyUpdateEffect(int duration, int amplifier) {
			return duration % 40 == 0;
		}

		@Override
		public boolean applyUpdateEffect(LivingEntity entity, int amplifier) {
			if (entity instanceof ServerPlayerEntity player) {
				com.beyondthelimits.core.engine.DementiaEngine.tickEffect(player, amplifier);
			}

			return true;
		}
	});

	/** Dimensional gravity: everything you did elsewhere is being spent on you here. */
	public static final RegistryEntry.Reference<StatusEffect> DIMENSIONAL_GRAVITY = Registry.registerReference(Registries.STATUS_EFFECT, BeyondTheLimits.id("dimensional_gravity"), new StatusEffect(StatusEffectCategory.HARMFUL, 0x2E4C8C) {
		@Override
		public boolean canApplyUpdateEffect(int duration, int amplifier) {
			return duration % 20 == 0;
		}

		@Override
		public boolean applyUpdateEffect(LivingEntity entity, int amplifier) {
			if (entity instanceof ServerPlayerEntity player) {
				com.beyondthelimits.core.engine.GravityEngine.tickEffect(player, amplifier);
			}

			return true;
		}
	});

	/** Glitch: the Wrong Minecraft's way of telling you that you are not where you think you are. */
	public static final RegistryEntry.Reference<StatusEffect> GLITCH = Registry.registerReference(Registries.STATUS_EFFECT, BeyondTheLimits.id("glitch"), new StatusEffect(StatusEffectCategory.NEUTRAL, 0x39FF6A) {
		@Override
		public boolean canApplyUpdateEffect(int duration, int amplifier) {
			return duration % 10 == 0;
		}

		@Override
		public boolean applyUpdateEffect(LivingEntity entity, int amplifier) {
			if (entity.getWorld().getRandom().nextInt(6) == 0) {
				entity.getWorld().addParticle(BtlParticles.STATIC_NOISE,
						entity.getX() + (entity.getWorld().getRandom().nextDouble() - 0.5D) * 0.8D,
						entity.getY() + entity.getWorld().getRandom().nextDouble() * 1.6D,
						entity.getZ() + (entity.getWorld().getRandom().nextDouble() - 0.5D) * 0.8D,
						0.0D, 0.0D, 0.0D);
			}

			return true;
		}
	});

	/**
	 * Touching the constants is what registers them.
	 *
	 * <p>Registration happens in the field initialisers, through
	 * {@code Registries.STATUS_EFFECT.registerReference(...)}: status effect instances are built from
	 * {@link RegistryEntry} (as of 1.20.5), so the mod keeps the reference around instead of the raw
	 * effect. This method exists so the mod entrypoint can force class initialisation at the right
	 * point in the lifecycle.</p>
	 */
	public static void register() {
		if (DEMENTIA == null || DIMENSIONAL_GRAVITY == null || GLITCH == null) {
			throw new IllegalStateException("beyondthelimits: status effects failed to initialise");
		}
	}
}
