package com.beyondthelimits.core.engine;

import com.beyondthelimits.core.BtlConfig;
import com.beyondthelimits.core.BtlState;
import com.beyondthelimits.entity.BlackSunEntity;
import com.beyondthelimits.network.BtlNetworking;
import com.beyondthelimits.registry.BtlBlocks;
import com.beyondthelimits.registry.BtlEntities;
import com.beyondthelimits.registry.BtlItems;
import com.beyondthelimits.registry.BtlParticles;
import com.beyondthelimits.registry.BtlSounds;
import com.beyondthelimits.util.BtlSafe;
import net.minecraft.block.Block;
import net.minecraft.entity.SpawnReason;
import net.minecraft.entity.effect.StatusEffectInstance;
import net.minecraft.entity.effect.StatusEffects;
import net.minecraft.item.ItemStack;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.network.ServerPlayerEntity;
import net.minecraft.server.world.ServerWorld;
import net.minecraft.sound.SoundCategory;
import net.minecraft.text.Text;
import net.minecraft.util.Formatting;
import net.minecraft.util.math.BlockPos;
import net.minecraft.world.Heightmap;

/**
 * The Black Sun.
 *
 * <p>It is not a skybox and it is not a shader effect. It is an entity — one per world — that spawns
 * high above the player who has been looking up the most, and it is closer every day. The sky darkens
 * in stages, each stage costs the world reality, and the arithmetic is deliberately legible: the
 * player can measure how long they have by watching the thing get bigger.</p>
 *
 * <p>The finale is the only scripted set piece in Chapter One. When it arrives it does not explode —
 * it unwrites a cylinder of the world down to bedrock and leaves the fragments behind, as items, in
 * the shape of the hole.</p>
 */
public final class BlackSunEngine {
	private BlackSunEngine() {
	}

	/** In-game days after the first stage begins before the sun is close enough to matter. */
	private static final int GRACE_DAYS = 2;
	/** Set once the finale has happened: the world keeps the sun, but it stops taking pieces of it. */
	private static boolean finished;

	public static void onServerStarted(MinecraftServer server) {
		BtlSafe.guard("blacksun.start", () -> {
			BtlState state = BtlState.get();

			if (state.blackSunStart() == 0 && server.getOverworld() != null) {
				state.setBlackSunStart(server.getOverworld().getTimeOfDay() / 24000L);
			}
		});
	}

	public static void tick(MinecraftServer server, int ticks) {
		ServerWorld overworld = server.getOverworld();

		if (overworld == null) {
			return;
		}

		BtlState state = BtlState.get();
		long day = overworld.getTimeOfDay() / 24000L;
		long since = day - state.blackSunStart();

		if (state.blackSunStage() == 0) {
			// The Black Sun begins when the world is too broken to keep a sun at all.
			if (since >= GRACE_DAYS && state.reality() <= BtlConfig.REALITY_DISTORT) {
				advance(server, state, 1);
			}

			return;
		}

		if (ticks % BtlConfig.BLACK_SUN_STAGE_TICKS == 0 && state.blackSunStage() < BtlConfig.BLACK_SUN_MAX_STAGE) {
			advance(server, state, state.blackSunStage() + 1);
		}

		for (ServerPlayerEntity player : server.getPlayerManager().getPlayerList()) {
			BtlSafe.guard("blacksun.player", () -> tickPlayer(state, player));
		}

		if (!finished && state.blackSunStage() >= BtlConfig.BLACK_SUN_MAX_STAGE && ticks % 200 == 0) {
			finished = true;
			BtlSafe.guard("blacksun.finale", () -> finale(server, state));
		}
	}

	private static void tickPlayer(BtlState state, ServerPlayerEntity player) {
		ServerWorld world = player.getServerWorld();
		int stage = state.blackSunStage();

		// One sun per world, and it descends on whoever is most exposed.
		BlackSunEntity sun = world.getEntitiesByClass(BlackSunEntity.class,
				player.getBoundingBox().expand(1024.0D), entity -> true).stream().findFirst().orElse(null);

		if (sun == null) {
			sun = BtlEntities.BLACK_SUN.create(world, SpawnReason.EVENT);

			if (sun != null) {
				sun.refreshPositionAndAngles(player.getX(), player.getY() + 220.0D, player.getZ(), 0.0F, 0.0F);
				world.spawnEntity(sun);
			}
		}

		int darkness = Math.min(3, stage / 3);

		if (darkness > 0 && player.getWorld().getTime() % 40L == 0L) {
			player.addStatusEffect(new StatusEffectInstance(StatusEffects.DARKNESS, 200, darkness - 1, true, false), null);
		}

		if (player.getWorld().getTime() % 200L == 0L) {
			BtlNetworking.sendSkyState(player);
		}
	}

	/** Moves the sun one stage closer to the world. */
	private static void advance(MinecraftServer server, BtlState state, int stage) {
		state.setBlackSunStage(stage);
		state.addReality(-BtlConfig.REALITY_PER_BLACK_SUN_STAGE);

		for (ServerPlayerEntity player : server.getPlayerManager().getPlayerList()) {
			BtlNetworking.sendSkyState(player);
			BtlNetworking.sendScreenEffect(player, BtlNetworking.EFFECT_BLACK_SUN, stage / 5.0F, 100);
			player.playSoundToPlayer(BtlSounds.BLACK_SUN_ARRIVAL, SoundCategory.AMBIENT, 1.4F, 0.3F + stage * 0.06F);

			if (stage == 1) {
				player.sendMessage(Text.translatable("message.beyondthelimits.blacksun.begin").formatted(Formatting.DARK_PURPLE), false);
			} else if (stage == BtlConfig.BLACK_SUN_MAX_STAGE - 1) {
				player.sendMessage(Text.translatable("message.beyondthelimits.blacksun.close").formatted(Formatting.RED), false);
			} else if (stage == BtlConfig.BLACK_SUN_MAX_STAGE) {
				player.sendMessage(Text.translatable("message.beyondthelimits.blacksun.arrival").formatted(Formatting.DARK_RED), false);
			}
		}

		ServerWorld overworld = server.getOverworld();

		if (overworld != null) {
			// The world notices: the day/night cycle stops mattering.
			overworld.setWeather(0, 24000, true, false);
		}
	}

	/**
	 * The finale: the sun touches the world and takes a cylinder of it away.
	 *
	 * <p>The hole is lined with void glass, the fragments are handed out as items, and the sky is left
	 * on the "impossible" event permanently.</p>
	 */
	private static void finale(MinecraftServer server, BtlState state) {
		for (ServerPlayerEntity player : server.getPlayerManager().getPlayerList()) {
			ServerWorld world = player.getServerWorld();
			BlockPos centre = world.getTopPosition(Heightmap.Type.MOTION_BLOCKING, player.getBlockPos());
			int radius = 6 + state.blackSunStage();

			for (int x = -radius; x <= radius; x++) {
				for (int z = -radius; z <= radius; z++) {
					if (x * x + z * z > radius * radius) {
						continue;
					}

					for (int y = 0; y > -64; y--) {
						BlockPos pos = centre.add(x, y, z);
						boolean lining = x * x + z * z > (radius - 1) * (radius - 1);

						if (lining) {
							world.setBlockState(pos, BtlBlocks.VOID_GLASS.getDefaultState(), Block.NOTIFY_LISTENERS);
						} else {
							world.breakBlock(pos, false);
						}
					}
				}
			}

			player.giveItemStack(new ItemStack(BtlItems.BLACK_SUN_FRAGMENT, 1 + world.getRandom().nextInt(3)));
			BtlNetworking.sendScreenEffect(player, BtlNetworking.EFFECT_FLASH, 1.0F, 60);
			world.playSound(null, centre, BtlSounds.EXPLOSION_FALLOUT, SoundCategory.WEATHER, 3.0F, 0.4F);
			world.spawnParticles(BtlParticles.BLACK_SUN_CORONA, centre.getX() + 0.5D, centre.getY() + 2.0D, centre.getZ() + 0.5D,
					120, radius, 8.0D, radius, 0.2D);
			player.sendMessage(Text.translatable("message.beyondthelimits.blacksun.taken").formatted(Formatting.DARK_RED), false);
		}

		// The sun stays: it is part of the world now, and it never leaves. The sky keeps the
		// "black sun" event for good, which is what the client renders from.
		for (ServerPlayerEntity player : server.getPlayerManager().getPlayerList()) {
			BtlNetworking.sendSkyState(player);
		}
	}
}
