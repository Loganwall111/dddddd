package com.beyondthelimits.core.engine;

import com.beyondthelimits.core.BtlConfig;
import com.beyondthelimits.core.BtlState;
import com.beyondthelimits.network.BtlNetworking;
import com.beyondthelimits.registry.BtlBlocks;
import com.beyondthelimits.registry.BtlEntities;
import com.beyondthelimits.registry.BtlParticles;
import com.beyondthelimits.registry.BtlSounds;
import com.beyondthelimits.util.BtlSafe;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import net.minecraft.block.Block;
import net.minecraft.block.Blocks;
import net.minecraft.entity.Entity;
import net.minecraft.entity.LivingEntity;
import net.minecraft.entity.SpawnReason;
import net.minecraft.entity.mob.MobEntity;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.network.ServerPlayerEntity;
import net.minecraft.server.world.ServerWorld;
import net.minecraft.sound.SoundCategory;
import net.minecraft.text.Text;
import net.minecraft.util.Formatting;
import net.minecraft.util.math.BlockPos;
import net.minecraft.util.math.random.Random;
import net.minecraft.world.Heightmap;

/**
 * Time infection.
 *
 * <p>Time does not pass uniformly any more. Around each player a zone forms, and inside it the world is
 * in a different decade: <b>past</b> zones go quiet and grey — memory stone, old leaves, mobs that
 * cannot remember what they were; <b>future</b> zones go aggressive and decayed — corrupted stone,
 * withered grass, mobs that have already won. Zones follow players, so the infection is spread by
 * walking.</p>
 *
 * <p>Mobile entities age. A zombie standing in a future zone for long enough becomes an evolved one; a
 * cow in a future zone ages to ruin and leaves bones; a mob in a past zone remembers its own death and
 * becomes an echo of itself.</p>
 */
public final class TemporalEngine {
	private TemporalEngine() {
	}

	private static final int PAST = 0;
	private static final int FUTURE = 1;

	private static final Map<UUID, Long> ZONES = new HashMap<>();

	public static void tick(MinecraftServer server, int ticks) {
		BtlState state = BtlState.get();

		for (ServerPlayerEntity player : server.getPlayerManager().getPlayerList()) {
			BtlSafe.guard("temporal.player", () -> tickPlayer(state, player, ticks));
		}
	}

	private static void tickPlayer(BtlState state, ServerPlayerEntity player, int ticks) {
		ServerWorld world = player.getServerWorld();
		int radius = BtlConfig.TEMPORAL_ZONE_RADIUS;
		int kind = Math.floorMod(player.getUuid().hashCode() + (int) (player.getWorld().getTime() / 6000L), 2);

		if (ticks % 40 == 0) {
			world.spawnParticles(kind == PAST ? BtlParticles.MEMORY_MOTE : BtlParticles.REALITY_DUST,
					player.getX(), player.getY() + 1.0D, player.getZ(), 6, radius / 2.0D, 2.0D, radius / 2.0D, 0.01D);
		}

		if (ticks % BtlConfig.TEMPORAL_CONVERSION_INTERVAL != 0) {
			return;
		}

		Random random = world.getRandom();
		Long since = ZONES.put(player.getUuid(), world.getTime());
		boolean freshZone = since == null || world.getTime() - since > 20L * 60L * 5L;

		if (freshZone) {
			player.sendMessage(Text.translatable(kind == PAST ? "message.beyondthelimits.temporal.past"
					: "message.beyondthelimits.temporal.future").formatted(kind == PAST ? Formatting.GRAY : Formatting.DARK_RED), true);
			world.playSound(null, player.getBlockPos(), BtlSounds.CORRUPTION_WHISPER, SoundCategory.AMBIENT, 0.6F, 0.5F);
			BtlNetworking.sendScreenEffect(player, BtlNetworking.EFFECT_MEMORY, 0.5F, 60);
		}

		convert(world, random, player.getBlockPos(), radius, kind);
		ageEntities(world, random, player.getBlockPos(), radius, kind);
	}

	private static void convert(ServerWorld world, Random random, BlockPos centre, int radius, int kind) {
		for (int i = 0; i < 30; i++) {
			BlockPos pos = centre.add(random.nextInt(radius * 2) - radius, random.nextInt(9) - 4, random.nextInt(radius * 2) - radius);
			var state = world.getBlockState(pos);

			if (state.isAir()) {
				continue;
			}

			if (kind == PAST) {
				if (state.isOf(Blocks.STONE) || state.isOf(Blocks.DEEPSLATE) || state.isOf(Blocks.DIRT)) {
					world.setBlockState(pos, BtlBlocks.MEMORY_STONE.getDefaultState(), Block.NOTIFY_ALL);
				} else if (state.isOf(Blocks.OAK_LEAVES) || state.isOf(Blocks.BIRCH_LEAVES) || state.isOf(Blocks.SPRUCE_LEAVES)) {
					world.setBlockState(pos, BtlBlocks.IMPOSSIBLE_LEAVES.getDefaultState(), Block.NOTIFY_ALL);
				}
			} else {
				if (state.isOf(Blocks.GRASS_BLOCK) || state.isOf(Blocks.DIRT)) {
					world.setBlockState(pos, BtlBlocks.CORRUPTED_GRASS.getDefaultState(), Block.NOTIFY_ALL);
				} else if (state.isOf(Blocks.STONE) || state.isOf(Blocks.DEEPSLATE)) {
					world.setBlockState(pos, BtlBlocks.CORRUPTED_STONE.getDefaultState(), Block.NOTIFY_ALL);
				}
			}
		}
	}

	private static void ageEntities(ServerWorld world, Random random, BlockPos centre, int radius, int kind) {
		for (Entity entity : world.getOtherEntities(null, new net.minecraft.util.math.Box(centre).expand(radius), e -> e instanceof LivingEntity)) {
			if (entity instanceof ServerPlayerEntity || entity.age < 200) {
				continue;
			}

			if (kind == FUTURE) {
				if (entity instanceof net.minecraft.entity.mob.ZombieEntity zombie && random.nextInt(40) == 0) {
					BlockPos pos = zombie.getBlockPos();
					zombie.discard();
					MobEntity evolved = BtlEntities.EVOLVED_ZOMBIE.create(world);

					if (evolved != null) {
						evolved.refreshPositionAndAngles(pos.getX() + 0.5D, pos.getY(), pos.getZ() + 0.5D, zombie.getYaw(), 0.0F);
						world.spawnEntity(evolved);
					}
				} else if (entity instanceof LivingEntity living && !(entity instanceof MobEntity)
						&& random.nextInt(600) == 0) {
					// Aged to ruin: it does not die, it stops.
					living.damage(world.getDamageSources().generic(), 4.0F);
				}
			} else if (entity instanceof MobEntity mob && random.nextInt(400) == 0) {
				// Remembering its own death.
				BlockPos pos = mob.getBlockPos();

				mob.discard();
				var echo = BtlEntities.MEMORY_ECHO.create(world);

				if (echo != null) {
					echo.refreshPositionAndAngles(pos.getX() + 0.5D, pos.getY(), pos.getZ() + 0.5D, mob.getYaw(), 0.0F);
					world.spawnEntity(echo);
				}
			}
		}
	}

	/** Which decade a player is currently standing in, for the dimensional gauge. */
	public static String describeZone(ServerPlayerEntity player) {
		Long since = ZONES.get(player.getUuid());

		if (since == null) {
			return "no zone";
		}

		ServerWorld world = player.getServerWorld();
		int kind = Math.floorMod(player.getUuid().hashCode() + (int) (world.getTime() / 6000L), 2);
		long secondsAgo = (world.getTime() - since) / 20L;
		return (kind == PAST ? "past" : "future") + " (" + secondsAgo + "s)";
	}

	public static BlockPos spawnHeight(ServerWorld world, BlockPos pos) {
		return world.getTopPosition(Heightmap.Type.MOTION_BLOCKING, pos);
	}
}
