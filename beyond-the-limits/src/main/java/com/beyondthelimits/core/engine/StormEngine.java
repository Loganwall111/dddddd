package com.beyondthelimits.core.engine;

import com.beyondthelimits.core.BtlConfig;
import com.beyondthelimits.core.BtlState;
import com.beyondthelimits.network.BtlNetworking;
import com.beyondthelimits.registry.BtlBlocks;
import com.beyondthelimits.registry.BtlDimensions;
import com.beyondthelimits.registry.BtlEntities;
import com.beyondthelimits.registry.BtlParticles;
import com.beyondthelimits.registry.BtlSounds;
import com.beyondthelimits.util.BtlSafe;
import net.minecraft.block.Block;
import net.minecraft.entity.EntityType;
import net.minecraft.entity.SpawnReason;
import net.minecraft.entity.mob.MobEntity;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.network.ServerPlayerEntity;
import net.minecraft.server.world.ServerWorld;
import net.minecraft.sound.SoundCategory;
import net.minecraft.text.Text;
import net.minecraft.util.math.BlockPos;
import net.minecraft.util.math.random.Random;
import net.minecraft.world.Heightmap;
import net.minecraft.world.World;

/**
 * Dimensional storms.
 *
 * <p>A storm is not weather. Weather happens above the world; a dimensional storm happens
 * <em>between</em> worlds, and the Overworld is where the seam shows. During one, the sky goes
 * transparent in strips, terrain from other dimensions is stamped down where the player is standing,
 * gravity stutters, portals open by themselves, lightning carries rift energy, and mobs that have no
 * business being here wander in from somewhere else — including from dimensions the player has never
 * visited.</p>
 *
 * <p>Every storm leaves permanent terrain behind. That is the contract: it is not a light show, it is
 * an edit.</p>
 */
public final class StormEngine {
	private StormEngine() {
	}

	private static int lightningCooldown;

	public static void onServerStarted(MinecraftServer server) {
		BtlSafe.guard("storm.start", () -> {
			BtlState state = BtlState.get();

			if (state.stormCooldown() <= 0) {
				state.setStormCooldown(nextCooldown(server));
			}
		});
	}

	private static int nextCooldown(MinecraftServer server) {
		Random random = Random.create(server.getOverworld() == null ? 0L : server.getOverworld().getSeed()
				^ server.getTicks() ^ 0x57L);
		return BtlConfig.STORM_MIN_COOLDOWN
				+ random.nextInt(Math.max(1, BtlConfig.STORM_MAX_COOLDOWN - BtlConfig.STORM_MIN_COOLDOWN));
	}

	public static boolean isStormActive() {
		return BtlState.get().stormTicks() > 0;
	}

	public static void tick(MinecraftServer server, int ticks) {
		BtlState state = BtlState.get();

		if (state.stormTicks() > 0) {
			state.setStormTicks(state.stormTicks() - 1);
			activeTick(server, state, ticks);

			if (state.stormTicks() == 0) {
				endStorm(server, state);
			}

			return;
		}

		int cooldown = state.stormCooldown() - 1;
		state.setStormCooldown(cooldown);

		if (cooldown <= 0) {
			// Reality has to be low enough for a storm to be physically possible.
			if (state.reality() > BtlConfig.REALITY_DISTORT) {
				state.setStormCooldown(nextCooldown(server) / 2);
				return;
			}

			ServerWorld overworld = server.getOverworld();

			if (overworld != null) {
				Random random = Random.create(overworld.getSeed() ^ server.getTicks());
				int intensity = 1 + random.nextInt(3);
				int duration = BtlConfig.STORM_MIN_DURATION
						+ random.nextInt(Math.max(1, BtlConfig.STORM_MAX_DURATION - BtlConfig.STORM_MIN_DURATION));
				beginStorm(overworld, intensity, duration);
			}
		}
	}

	/** Starts a storm. Also the entry point used by the storm beacon item. */
	public static void beginStorm(ServerWorld world, int intensity, int duration) {
		BtlSafe.guard("storm.begin", () -> {
			BtlState state = BtlState.get();
			state.setStormTicks(duration);
			state.setStormIntensity(Math.max(1, Math.min(3, intensity)));
			state.setStormCooldown(nextCooldown(world.getServer()));
			state.addReality(-BtlConfig.REALITY_PER_STORM);

			for (ServerPlayerEntity player : world.getServer().getPlayerManager().getPlayerList()) {
				player.sendMessage(Text.translatable("message.beyondthelimits.storm.begin").formatted(net.minecraft.util.Formatting.DARK_AQUA), false);
				BtlNetworking.sendScreenEffect(player, BtlNetworking.EFFECT_STORM, intensity / 3.0F, 80);
				BtlNetworking.sendSkyState(player);
			}

			world.setWeather(0, duration, true, true);
			ServerPlayerEntity loudest = world.getRandomAlivePlayer();
			BlockPos stormCentre = loudest == null ? world.getSpawnPos() : loudest.getBlockPos();
			world.playSound(null, stormCentre, BtlSounds.STORM_START, SoundCategory.WEATHER, 3.0F, 0.6F);
		});
	}

	private static void activeTick(MinecraftServer server, BtlState state, int ticks) {
		int intensity = Math.max(1, state.stormIntensity());
		Random random = Random.create((long) ticks * 31L + server.getTicks());

		for (ServerPlayerEntity player : server.getPlayerManager().getPlayerList()) {
			ServerWorld world = player.getServerWorld();
			int phase = (int) (world.getTime() % 200L);

			// 1. The sky becomes transparent in strips: driven by the sky payload, refreshed often.
			if (ticks % 100 == 0) {
				BtlNetworking.sendSkyState(player);
			}

			// 2. Terrain from elsewhere is stamped into the world, permanently.
			if (phase == 40 && random.nextInt(4) < intensity) {
				stampForeignTerrain(world, player, random);
			}

			// 3. Gravity stutters: random vertical impulses on everything nearby.
			if (phase == 80) {
				for (net.minecraft.entity.Entity entity : world.getOtherEntities(player,
						player.getBoundingBox().expand(24.0D), e -> e instanceof MobEntity)) {
					entity.addVelocity(0.0D, 0.35D + random.nextDouble() * 0.4D, 0.0D);
					entity.velocityModified = true;
				}
			}

			// 4. Portals open by themselves.
			if (random.nextInt(600) < intensity * 4 && random.nextInt(3) == 0) {
				BlockPos site = RiftEngine.findRiftSite(world, player);

				if (site != null) {
					RiftEngine.spawnRiftAt(world, site, RiftEngine.rollVariant(world.getRandom()), false);
					state.addRift();
				}
			}

			// 5. Rift lightning: bolts that carry tears with them.
			if (lightningCooldown > 0) {
				lightningCooldown--;
			} else if (random.nextInt(400 / intensity) == 0) {
				lightningCooldown = 60;
				riftLightning(world, player, random);
			}

			// 6. Cross-dimension spawns: things that live somewhere else are suddenly here.
			if (phase == 120 && random.nextInt(3) < intensity) {
				crossDimensionSpawn(world, player, random);
			}
		}
	}

	/** Copies a slab of another dimension into this one. The edit is permanent. */
	private static void stampForeignTerrain(ServerWorld world, ServerPlayerEntity player, Random random) {
		BtlSafe.guard("storm.stamp", () -> {
			ServerWorld source = switch (random.nextInt(4)) {
				case 0 -> world.getServer().getWorld(BtlDimensions.FOGLANDS);
				case 1 -> world.getServer().getWorld(BtlDimensions.BACKROOMS);
				case 2 -> world.getServer().getWorld(World.NETHER);
				default -> world.getServer().getWorld(BtlDimensions.MIRRORWORLD);
			};

			BlockPos centre = world.getTopPosition(Heightmap.Type.MOTION_BLOCKING,
					player.getBlockPos().add(random.nextInt(40) - 20, 0, random.nextInt(40) - 20));
			int radius = 4 + random.nextInt(6);

			for (int x = -radius; x <= radius; x++) {
				for (int z = -radius; z <= radius; z++) {
					for (int y = 0; y < 5; y++) {
						BlockPos target = centre.add(x, y, z);

						if (source != null && source.isChunkLoaded(target.getX() >> 4, target.getZ() >> 4)
								&& !source.getBlockState(target).isAir()) {
							world.setBlockState(target, source.getBlockState(target), Block.NOTIFY_ALL);
						} else {
							// No source chunk: the storm still leaves its own material behind.
							world.setBlockState(target, (y == 0 ? BtlBlocks.CORRUPTED_STONE : BtlBlocks.BLEEDING_VEIN)
									.getDefaultState(), Block.NOTIFY_ALL);
						}
					}
				}
			}

			world.spawnParticles(BtlParticles.REALITY_SCAR, centre.getX() + 0.5D, centre.getY() + 2.0D, centre.getZ() + 0.5D,
					40, radius, 3.0D, radius, 0.05D);
			world.playSound(null, centre, BtlSounds.REALITY_TEAR, SoundCategory.WEATHER, 1.4F, 0.5F);
			player.sendMessage(Text.translatable("message.beyondthelimits.storm.stamp").formatted(net.minecraft.util.Formatting.DARK_GREEN), true);
		});
	}

	private static void riftLightning(ServerWorld world, ServerPlayerEntity player, Random random) {
		BlockPos target = player.getBlockPos().add(random.nextInt(48) - 24, 0, random.nextInt(48) - 24);
		BlockPos ground = world.getTopPosition(Heightmap.Type.MOTION_BLOCKING, target);

		net.minecraft.entity.LightningEntity bolt = EntityType.LIGHTNING_BOLT.create(world);

		if (bolt != null) {
			bolt.refreshPositionAfterTeleport(ground.getX() + 0.5D, ground.getY(), ground.getZ() + 0.5D);
			world.spawnEntity(bolt);
		}

		world.playSound(null, ground, BtlSounds.STORM_THUNDER, SoundCategory.WEATHER, 3.0F, 0.7F);

		// Where the bolt lands, the world is thinner: a scar and sometimes a tear.
		world.setBlockState(ground, BtlBlocks.BLEEDING_VEIN.getDefaultState(), Block.NOTIFY_ALL);

		if (random.nextInt(3) == 0) {
			RiftEngine.spawnRiftAt(world, ground.up(), RiftEngine.rollVariant(random), false);
		}
	}

	private static void crossDimensionSpawn(ServerWorld world, ServerPlayerEntity player, Random random) {
		BtlSafe.guard("storm.spawn", () -> {
			var type = switch (random.nextInt(7)) {
				case 0 -> BtlEntities.HOUND;
				case 1 -> BtlEntities.SMILER;
				case 2 -> BtlEntities.FOG_WALKER;
				case 3 -> BtlEntities.CODE_WRAITH;
				case 4 -> BtlEntities.PARTYGOER;
				case 5 -> BtlEntities.MIRROR_DOUBLE;
				default -> BtlEntities.SKIN_STEALER;
			};

			for (int i = 0; i < 1 + random.nextInt(3); i++) {
				MobEntity mob = type.create(world);

				if (mob == null) {
					continue;
				}

				BlockPos spawn = world.getTopPosition(Heightmap.Type.MOTION_BLOCKING,
						player.getBlockPos().add(random.nextInt(48) - 24, 0, random.nextInt(48) - 24));
				mob.refreshPositionAndAngles(spawn.getX() + 0.5D, spawn.getY(), spawn.getZ() + 0.5D, random.nextFloat() * 360.0F, 0.0F);
				mob.setPersistent();
				world.spawnEntity(mob);
				world.spawnParticles(BtlParticles.RIFT_SPARK, mob.getX(), mob.getY() + 1.0D, mob.getZ(),
						16, 0.5D, 0.8D, 0.5D, 0.02D);
			}
		});
	}

	private static void endStorm(MinecraftServer server, BtlState state) {
		BtlSafe.guard("storm.end", () -> {
			state.setStormIntensity(0);
			state.setStormCooldown(nextCooldown(server));

			for (ServerPlayerEntity player : server.getPlayerManager().getPlayerList()) {
				player.sendMessage(Text.translatable("message.beyondthelimits.storm.end").formatted(net.minecraft.util.Formatting.GRAY), false);
				BtlNetworking.sendSkyState(player);
			}
		});
	}
}
