package com.beyondthelimits.core.engine;

import com.beyondthelimits.core.BtlConfig;
import com.beyondthelimits.core.BtlState;
import com.beyondthelimits.entity.RiftEntity;
import com.beyondthelimits.network.BtlNetworking;
import com.beyondthelimits.registry.BtlBlocks;
import com.beyondthelimits.registry.BtlEntities;
import com.beyondthelimits.registry.BtlParticles;
import com.beyondthelimits.registry.BtlSounds;
import com.beyondthelimits.util.BtlSafe;
import net.minecraft.block.Block;
import net.minecraft.block.Blocks;
import net.minecraft.entity.SpawnReason;
import net.minecraft.entity.mob.MobEntity;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.network.ServerPlayerEntity;
import net.minecraft.server.world.ServerWorld;
import net.minecraft.sound.SoundCategory;
import net.minecraft.text.Text;
import net.minecraft.util.Formatting;
import net.minecraft.util.math.BlockPos;
import net.minecraft.util.math.Vec3d;
import net.minecraft.util.math.random.Random;
import net.minecraft.world.Heightmap;

/**
 * The Chunk That Moves.
 *
 * <p>A single 16x16 chunk of terrain that walks. It is not haunted and it is not hostile: something is
 * chasing it, and it is running. It moves a chunk at a time, stamping its own landscape down where it
 * stops — black grass, remembered stone, a tree that is always the same tree — and abandoning the
 * previous patch as bare corrupted ground, which is what the player will actually find first: a trail
 * of dead squares leading in one direction.</p>
 *
 * <p>If the player gets close enough to watch it move, it panics. Panic in this case means running
 * faster, dropping the things chasing it, and leaving a rift behind at every step — which is the only
 * way a player ever gets to see what the chunk was running from.</p>
 */
public final class MovingChunkEngine {
	private MovingChunkEngine() {
	}

	public static void onServerStarted(MinecraftServer server) {
		BtlSafe.guard("movingchunk.start", () -> {
			BtlState state = BtlState.get();

			if (state.movingChunkPos() != null) {
				return;
			}

			ServerWorld overworld = server.getOverworld();

			if (overworld == null) {
				return;
			}

			ServerPlayerEntity player = overworld.getRandomAlivePlayer();
			BlockPos start = player == null ? new BlockPos(0, 64, 0)
					: player.getBlockPos().add(overworld.getRandom().nextInt(4000) - 2000, 0, overworld.getRandom().nextInt(4000) - 2000);
			state.setMovingChunk(start.getX() >> 4, start.getZ() >> 4);
			state.setMovingChunkTimer(BtlConfig.MOVING_CHUNK_STEP_TICKS);
		});
	}

	public static void tick(MinecraftServer server, int ticks) {
		ServerWorld overworld = server.getOverworld();

		if (overworld == null) {
			return;
		}

		BtlState state = BtlState.get();
		BlockPos pos = state.movingChunkPos();

		if (pos == null) {
			onServerStarted(server);
			return;
		}

		ServerPlayerEntity nearest = nearestPlayer(server, overworld, pos);
		double distance = nearest == null ? Double.MAX_VALUE : Math.sqrt(nearest.squaredDistanceTo(pos.getX(), pos.getY(), pos.getZ()));

		// Somebody is watching: it panics.
		if (distance < BtlConfig.MOVING_CHUNK_ARRIVAL_RANGE) {
			state.setMovingChunkPanic(Math.min(100, state.movingChunkPanic() + 4));
		} else if (state.movingChunkPanic() > 0) {
			state.setMovingChunkPanic(state.movingChunkPanic() - 1);
		}

		int step = state.movingChunkPanic() > 40 ? BtlConfig.MOVING_CHUNK_STEP_TICKS / 3 : BtlConfig.MOVING_CHUNK_STEP_TICKS;
		int timer = state.movingChunkTimer() - 1;

		if (timer > 0) {
			state.setMovingChunkTimer(timer);
			ambient(overworld, state, pos, distance);
			return;
		}

		state.setMovingChunkTimer(step);
		move(state, overworld, pos, nearest);
	}

	private static void move(BtlState state, ServerWorld world, BlockPos pos, ServerPlayerEntity nearest) {
		Random random = world.getRandom();

		// Direction: away from whoever is closest, with a wander component so it is not a straight line.
		double angle = random.nextDouble() * Math.PI * 2.0D;

		if (nearest != null) {
			Vec3d away = new Vec3d(pos.getX() - nearest.getX(), 0.0D, pos.getZ() - nearest.getZ());

			if (away.length() > 0.001D) {
				Vec3d direction = away.normalize();
				angle = Math.atan2(direction.z, direction.x) + (random.nextDouble() - 0.5D) * 0.8D;
			}
		}

		int newX = pos.getX() + (int) Math.round(Math.cos(angle) * 16.0D);
		int newZ = pos.getZ() + (int) Math.round(Math.sin(angle) * 16.0D);

		// Leave the old patch behind: scorched, dead, readable from the air.
		scorch(world, pos);
		stamp(world, new BlockPos(newX, pos.getY(), newZ), random, state.movingChunkPanic() > 40);
		state.setMovingChunk(newX >> 4, newZ >> 4);
	}

	/** What the chunk leaves behind: the trail the player follows. */
	private static void scorch(ServerWorld world, BlockPos centre) {
		for (int x = 0; x < 16; x++) {
			for (int z = 0; z < 16; z++) {
				BlockPos surface = world.getTopPosition(Heightmap.Type.MOTION_BLOCKING, centre.add(x, 0, z));
				world.setBlockState(surface, BtlBlocks.CORRUPTED_SOIL.getDefaultState(), Block.NOTIFY_LISTENERS);
				world.setBlockState(surface.down(), BtlBlocks.CORRUPTED_STONE.getDefaultState(), Block.NOTIFY_LISTENERS);
				world.spawnParticles(BtlParticles.REALITY_DUST, surface.getX() + 0.5D, surface.getY() + 1.0D, surface.getZ() + 0.5D,
						3, 0.5D, 0.5D, 0.5D, 0.01D);
			}
		}

		world.playSound(null, centre, BtlSounds.CORRUPTION_WHISPER, SoundCategory.AMBIENT, 0.6F, 0.4F);
	}

	/** What the chunk is: the same landscape, everywhere it goes. */
	private static void stamp(ServerWorld world, BlockPos centre, Random random, boolean panicked) {
		for (int x = 0; x < 16; x++) {
			for (int z = 0; z < 16; z++) {
				BlockPos column = centre.add(x, 0, z);

				for (int y = -3; y <= 5; y++) {
					BlockPos pos = column.add(0, y, 0);
					Block block = y == 0 ? BtlBlocks.IMPOSSIBLE_GRASS : y < 0 ? BtlBlocks.MEMORY_STONE : Blocks.AIR;
					world.setBlockState(pos, block.getDefaultState(), Block.NOTIFY_LISTENERS);
				}

				if (random.nextInt(24) == 0) {
					int height = 5 + random.nextInt(6);

					for (int y = 1; y <= height; y++) {
						world.setBlockState(column.up(y), BtlBlocks.IMPOSSIBLE_LOG.getDefaultState(), Block.NOTIFY_LISTENERS);
					}

					world.setBlockState(column.up(height + 1), BtlBlocks.IMPOSSIBLE_LEAVES.getDefaultState(), Block.NOTIFY_LISTENERS);
				}
			}
		}

		// Its inhabitants come with it: echoes of whoever used to live here.
		for (int i = 0; i < 2 + random.nextInt(3); i++) {
			MobEntity echo = BtlEntities.MEMORY_ECHO.create(world, SpawnReason.STRUCTURE);

			if (echo != null) {
				echo.refreshPositionAndAngles(centre.getX() + random.nextInt(16), centre.getY() + 1, centre.getZ() + random.nextInt(16),
						random.nextFloat() * 360.0F, 0.0F);
				echo.setPersistent();
				world.spawnEntity(echo);
			}
		}

		world.spawnParticles(BtlParticles.MEMORY_MOTE, centre.getX() + 8.0D, centre.getY() + 2.0D, centre.getZ() + 8.0D,
				30, 8.0D, 3.0D, 8.0D, 0.02D);
		world.playSound(null, centre, BtlSounds.MEMORY_CHIME, SoundCategory.AMBIENT, 0.9F, 0.8F);

		// Panicking: whatever is chasing it is briefly visible behind it.
		if (panicked) {
			RiftEngine.spawnRiftAt(world, centre.add(0, 3, 0), RiftEntity.VARIANT_BACKROOMS, true);
			BtlNetworking.broadcastScreenEffect(world.getServer(), BtlNetworking.EFFECT_RIFT_WASH, 0.4F, 40);
		}
	}

	private static void ambient(ServerWorld world, BtlState state, BlockPos pos, double distance) {
		if (distance > 160.0D || world.getTime() % 40L != 0L) {
			return;
		}

		world.spawnParticles(BtlParticles.MEMORY_MOTE, pos.getX() + 8.0D, pos.getY() + 3.0D, pos.getZ() + 8.0D,
				6, 8.0D, 4.0D, 8.0D, 0.01D);

		if (state.movingChunkPanic() > 40) {
			world.playSound(null, pos, BtlSounds.EVOLUTION_GROWL, SoundCategory.AMBIENT, 0.5F, 1.4F);
		}
	}

	private static ServerPlayerEntity nearestPlayer(MinecraftServer server, ServerWorld overworld, BlockPos pos) {
		ServerPlayerEntity nearest = null;
		double best = Double.MAX_VALUE;

		for (ServerPlayerEntity player : server.getPlayerManager().getPlayerList()) {
			if (player.getServerWorld() != overworld) {
				continue;
			}

			double distance = player.squaredDistanceTo(pos.getX(), pos.getY(), pos.getZ());

			if (distance < best) {
				best = distance;
				nearest = player;
			}
		}

		return nearest;
	}

	/** Called by the guidebook: points the player at the trail rather than at the chunk. */
	public static Text describeTrail(BtlState state) {
		BlockPos pos = state.movingChunkPos();

		if (pos == null) {
			return Text.translatable("message.beyondthelimits.movingchunk.unknown");
		}

		return Text.translatable("message.beyondthelimits.movingchunk.trail", pos.getX(), pos.getZ())
				.formatted(Formatting.GRAY);
	}
}
