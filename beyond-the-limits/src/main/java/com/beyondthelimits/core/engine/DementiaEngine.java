package com.beyondthelimits.core.engine;

import com.beyondthelimits.core.BtlConfig;
import com.beyondthelimits.core.BtlState;
import com.beyondthelimits.network.BtlNetworking;
import com.beyondthelimits.registry.BtlDimensions;
import com.beyondthelimits.registry.BtlSounds;
import com.beyondthelimits.registry.BtlStatusEffects;
import net.minecraft.entity.effect.StatusEffectInstance;
import net.minecraft.entity.effect.StatusEffects;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.network.ServerPlayerEntity;
import net.minecraft.server.world.ServerWorld;
import net.minecraft.sound.SoundCategory;
import net.minecraft.text.Text;

/**
 * Dementia: the mod's answer to "why would I ever go into a rift?".
 *
 * <p>Spending time in a dimension that is not the Overworld, or standing on Corrupted Land, builds
 * up dementia. It never kills you. What it does is worse than damage:</p>
 *
 * <ul>
 *     <li>{@link BtlConfig#DEMENTIA_HALLUCINATION}: whispers, false mob sounds, the HUD starts
 *     disagreeing with the world;</li>
 *     <li>{@link BtlConfig#DEMENTIA_FALL_THROUGH}: Corrupted Land stops being solid under you;</li>
 *     <li>{@link BtlConfig#DEMENTIA_NOCLIP}: the moment you next touch corruption you are pulled
 *     out of the world entirely and dropped into the Backrooms — the mod's second entrance,
 *     and the only one that happens to you instead of you doing it.</li>
 * </ul>
 *
 * <p>Recovery is deliberately slow and only happens in the Overworld, off corruption, which makes
 * "come home and rest" the only actual strategy.</p>
 */
public final class DementiaEngine {
	private DementiaEngine() {
	}

	public static void tick(MinecraftServer server, int ticks) {
		BtlState state = BtlState.get();

		for (ServerPlayerEntity player : server.getPlayerManager().getPlayerList()) {
			ServerWorld world = player.getServerWorld();
			boolean overworld = world.getRegistryKey() == net.minecraft.world.World.OVERWORLD;
			boolean onCorruption = com.beyondthelimits.block.CorruptedGrassBlock.isStandingOnCorruption(player);
			int dementia = state.dementia(player.getUuid());

			if (overworld && !onCorruption) {
				dementia -= BtlConfig.DEMENTIA_RECOVERY_PER_SECOND;
			} else if (!overworld) {
				dementia += BtlConfig.DEMENTIA_PER_SECOND_IN_DIMENSION;

				// The deeper you go, the faster it accumulates.
				if (world.getRegistryKey() == BtlDimensions.BACKROOMS) {
					dementia += BtlConfig.DEMENTIA_PER_SECOND_IN_DIMENSION;
				}

				if (world.getRegistryKey() == BtlDimensions.CODESCAPE) {
					dementia += BtlConfig.DEMENTIA_PER_SECOND_IN_DIMENSION * 2;
				}
			}

			state.setDementia(player.getUuid(), Math.max(0, dementia));

			int level = state.dementia(player.getUuid());

			// Hallucinations.
			if (level >= BtlConfig.DEMENTIA_HALLUCINATION && ticks % 40 == 0 && world.getRandom().nextInt(6) == 0) {
				world.playSound(null, player.getBlockPos(), BtlSounds.CORRUPTION_WHISPER, SoundCategory.AMBIENT,
						0.5F, 0.5F + world.getRandom().nextFloat() * 0.5F);
				BtlNetworking.sendScreenEffect(player, BtlNetworking.EFFECT_DEMENTIA_SPIKE, 0.3F, 30);
			}

			// The status effect mirrors the value so that the HUD and the shaders agree.
			int amplifier = Math.min(4, level / (BtlConfig.DEMENTIA_MAX / 5));
			player.addStatusEffect(new StatusEffectInstance(BtlStatusEffects.DEMENTIA, 240, amplifier, true, false), null);

			// The hard threshold: reality stops holding you up.
			if (level >= BtlConfig.DEMENTIA_FALL_THROUGH) {
				player.addStatusEffect(new StatusEffectInstance(StatusEffects.DARKNESS, 200, 0, true, false), null);
				player.addStatusEffect(new StatusEffectInstance(StatusEffects.NAUSEA, 200, 0, true, false), null);
			}
		}
	}

	/** Called by the corrupted grass block, once per step. */
	public static void onCorruptedGround(ServerPlayerEntity player, int decay) {
		BtlState state = BtlState.get();
		int dementia = state.dementia(player.getUuid());
		state.setDementia(player.getUuid(), dementia + 1 + decay);

		if (state.dementia(player.getUuid()) >= BtlConfig.DEMENTIA_NOCLIP) {
			state.setDementia(player.getUuid(), BtlConfig.DEMENTIA_MAX / 3);
			BackroomsEngine.enterViaCorruptedGrass(player);
		}
	}

	/** Called every other second by the status effect itself. */
	public static void tickEffect(ServerPlayerEntity player, int amplifier) {
		BtlState state = BtlState.get();

		if (state.dementia(player.getUuid()) >= BtlConfig.DEMENTIA_HALLUCINATION) {
			ServerWorld world = player.getServerWorld();

			if (world.getRandom().nextInt(3) == 0) {
				double x = player.getX() + (world.getRandom().nextDouble() - 0.5D) * 12.0D;
				double y = player.getY() + world.getRandom().nextDouble() * 3.0D;
				double z = player.getZ() + (world.getRandom().nextDouble() - 0.5D) * 12.0D;
				world.spawnParticles(com.beyondthelimits.registry.BtlParticles.REALITY_SCAR, x, y, z, 3, 0.2D, 0.2D, 0.2D, 0.0D);
				world.playSound(null, player.getBlockPos(), net.minecraft.sound.SoundEvents.ENTITY_ENDERMAN_STARE,
						SoundCategory.AMBIENT, 0.25F, 0.5F);
			}
		}
	}

	public static Text describe(int dementia) {
		if (dementia < BtlConfig.DEMENTIA_HALLUCINATION) {
			return Text.translatable("dementia.beyondthelimits.stable");
		}

		if (dementia < BtlConfig.DEMENTIA_FALL_THROUGH) {
			return Text.translatable("dementia.beyondthelimits.hearing");
		}

		if (dementia < BtlConfig.DEMENTIA_NOCLIP) {
			return Text.translatable("dementia.beyondthelimits.falling");
		}

		return Text.translatable("dementia.beyondthelimits.leaving");
	}
}
