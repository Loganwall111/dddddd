package com.beyondthelimits.core.engine;

import com.beyondthelimits.core.BtlConfig;
import com.beyondthelimits.core.BtlState;
import com.beyondthelimits.network.BtlNetworking;
import com.beyondthelimits.registry.BtlParticles;
import com.beyondthelimits.registry.BtlSounds;
import java.util.List;
import net.minecraft.entity.effect.StatusEffectInstance;
import net.minecraft.entity.effect.StatusEffects;
import net.minecraft.particle.ParticleTypes;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.network.ServerPlayerEntity;
import net.minecraft.server.world.ServerWorld;
import net.minecraft.sound.SoundCategory;
import net.minecraft.text.Text;
import net.minecraft.util.math.BlockPos;

/**
 * Reality: the resource the entire mod runs on.
 *
 * <p>Reality starts at 100% and only ever goes down. It drops once per in-game day, every time a
 * dimensional storm resolves, every time the black sun advances, every time the world collision
 * deepens — and it can be clawed back in small amounts with rift stabilisers. What the number does
 * is documented honestly in the guidebook, because Chapter One is not trying to hide it from the
 * player, it is trying to make them watch it fall:</p>
 *
 * <table>
 *   <tr><td>80%</td><td>blocks flicker, coordinates drift by one digit</td></tr>
 *   <tr><td>60%</td><td>structures distort, mobs spawn with the wrong data</td></tr>
 *   <tr><td>40%</td><td>gravity changes, the sky flickers between two states</td></tr>
 *   <tr><td>20%</td><td>chunks connect incorrectly, biomes bleed into each other</td></tr>
 *   <tr><td>5%</td><td>the world generates impossible geometry</td></tr>
 *   <tr><td>0%</td><td>you are no longer playing Minecraft</td></tr>
 * </table>
 */
public final class RealityEngine {
	private RealityEngine() {
	}

	private static long lastDay = -1L;
	private static int announceCooldown;

	public static void onServerStarted(MinecraftServer server) {
		BtlState state = BtlState.get();

		if (state.riftSeed() == 0L && server.getOverworld() != null) {
			state.setRiftSeed(server.getOverworld().getSeed());
		}
	}

	public static void onServerStopping(MinecraftServer server) {
		BtlState.get().save();
	}

	public static void tick(MinecraftServer server, int ticks) {
		BtlState state = BtlState.get();
		ServerWorld overworld = server.getOverworld();

		if (overworld == null) {
			return;
		}

		long day = overworld.getTimeOfDay() / 24000L;

		if (day != lastDay) {
			if (lastDay != -1L) {
				onNewDay(server, day - lastDay);
			}

			lastDay = day;
		}

		if (announceCooldown > 0) {
			announceCooldown--;
		}

		if (ticks % 200 == 0) {
			for (ServerPlayerEntity player : server.getPlayerManager().getPlayerList()) {
				BtlNetworking.sendRealitySync(player);
				BtlNetworking.sendSkyState(player);
				player.addStatusEffect(new StatusEffectInstance(
						com.beyondthelimits.registry.BtlStatusEffects.GLITCH,
						220, Math.max(0, (100 - state.reality()) / 25), true, false), null);
			}
		}

		// Below 40% reality, the world starts "helping": hostile pressure everywhere.
		if (state.reality() < BtlConfig.REALITY_GRAVITY && ticks % 600 == 0) {
			for (ServerPlayerEntity player : server.getPlayerManager().getPlayerList()) {
				if (player.getWorld().getRandom().nextInt(4) == 0) {
					player.addStatusEffect(new StatusEffectInstance(StatusEffects.NAUSEA, 120, 0, true, false), null);
					com.beyondthelimits.network.BtlNetworking.sendScreenEffect(player,
							BtlNetworking.EFFECT_DEMENTIA_SPIKE, 0.4F, 40);
				}
			}
		}
	}

	private static void onNewDay(MinecraftServer server, long daysPassed) {
		BtlState state = BtlState.get();
		int days = (int) Math.min(BtlConfig.WORK_BUDGET, daysPassed);

		state.addReality(-BtlConfig.REALITY_DECAY_PER_DAY * days);

		// Everything else the world does per day is owned by the other engines; this is only the
		// "reality" bookkeeping plus the announcements the player actually reads.
		state.setSkyCrack(state.skyCrack() + BtlConfig.SKY_CRACK_PER_DAY * days);
		state.setCollision(state.collision() + BtlConfig.COLLISION_PER_DAY * days);
		state.setBleeding(state.bleeding() + BtlConfig.BLEEDING_PER_DAY * days);

		int reality = state.reality();

		if (reality <= BtlConfig.REALITY_IMPOSSIBLE && announceCooldown == 0) {
			announce(server, "message.beyondthelimits.reality.impossible");
			announceCooldown = 20;
		} else if (reality <= BtlConfig.REALITY_CHUNK_SEAMS && announceCooldown == 0) {
			announce(server, "message.beyondthelimits.reality.seams");
			announceCooldown = 20;
		} else if (reality <= BtlConfig.REALITY_GRAVITY && announceCooldown == 0) {
			announce(server, "message.beyondthelimits.reality.gravity");
			announceCooldown = 20;
		} else if (reality <= BtlConfig.REALITY_DISTORT && announceCooldown == 0) {
			announce(server, "message.beyondthelimits.reality.distort");
			announceCooldown = 20;
		} else if (reality <= BtlConfig.REALITY_FLICKER && announceCooldown == 0) {
			announce(server, "message.beyondthelimits.reality.flicker");
			announceCooldown = 20;
		}

		// The world tears itself open a little more every day.
		List<ServerPlayerEntity> players = server.getPlayerManager().getPlayerList();

		for (ServerPlayerEntity player : players) {
			if (state.reality() < BtlConfig.REALITY_DISTORT) {
				BtlNetworking.sendScreenEffect(player, BtlNetworking.EFFECT_RIFT_WASH, 0.25F, 60);
			}

			ServerWorld world = player.getServerWorld();
			BlockPos pos = player.getBlockPos();

			world.spawnParticles(BtlParticles.REALITY_SCAR, pos.getX() + 0.5D, pos.getY() + 1.5D, pos.getZ() + 0.5D,
					8, 1.5D, 1.5D, 1.5D, 0.01D);
		}

		if (state.reality() <= 0) {
			announce(server, "message.beyondthelimits.reality.zero");
			worldTear(server);
		}

		state.save();
	}

	private static void announce(MinecraftServer server, String key) {
		for (ServerPlayerEntity player : server.getPlayerManager().getPlayerList()) {
			player.sendMessage(Text.translatable(key), false);
		}
	}

	/** At 0% reality the Overworld stops pretending: everything becomes corrupted land. */
	private static void worldTear(MinecraftServer server) {
		ServerWorld overworld = server.getOverworld();

		if (overworld == null) {
			return;
		}

		for (ServerPlayerEntity player : server.getPlayerManager().getPlayerList()) {
			overworld.playSound(null, player.getBlockPos(), BtlSounds.REALITY_TEAR, SoundCategory.AMBIENT, 2.0F, 0.3F);
			BtlNetworking.sendScreenEffect(player, BtlNetworking.EFFECT_FLASH, 1.0F, 40);
			player.getServerWorld().spawnParticles(ParticleTypes.EXPLOSION_EMITTER,
					player.getX(), player.getY() + 2.0D, player.getZ(), 8, 4.0D, 4.0D, 4.0D, 0.0D);
		}

		CollisionEngine.forceTotalCollapse(overworld);
	}

	/** Reality band used by the HUD: 0-6, where 6 is pristine. */
	public static int band(BtlState state) {
		int reality = state.reality();

		if (reality > 95) {
			return 6;
		}

		if (reality > BtlConfig.REALITY_FLICKER) {
			return 5;
		}

		if (reality > BtlConfig.REALITY_DISTORT) {
			return 4;
		}

		if (reality > BtlConfig.REALITY_GRAVITY) {
			return 3;
		}

		if (reality > BtlConfig.REALITY_CHUNK_SEAMS) {
			return 2;
		}

		if (reality > BtlConfig.REALITY_IMPOSSIBLE) {
			return 1;
		}

		return 0;
	}
}
