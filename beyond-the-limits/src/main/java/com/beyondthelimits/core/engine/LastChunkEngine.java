package com.beyondthelimits.core.engine;

import com.beyondthelimits.core.BtlConfig;
import com.beyondthelimits.core.BtlMemory;
import com.beyondthelimits.core.BtlState;
import com.beyondthelimits.network.BtlNetworking;
import com.beyondthelimits.registry.BtlBlocks;
import com.beyondthelimits.registry.BtlEntities;
import com.beyondthelimits.registry.BtlParticles;
import com.beyondthelimits.registry.BtlSounds;
import com.beyondthelimits.util.BtlSafe;
import java.util.List;
import net.minecraft.block.Block;
import net.minecraft.block.BlockState;
import net.minecraft.block.Blocks;
import net.minecraft.entity.SpawnReason;
import net.minecraft.registry.Registries;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.network.ServerPlayerEntity;
import net.minecraft.server.world.ServerWorld;
import net.minecraft.sound.SoundCategory;
import net.minecraft.text.Text;
import net.minecraft.util.Identifier;
import net.minecraft.util.math.BlockPos;
import net.minecraft.world.Heightmap;

/**
 * The Last Chunk.
 *
 * <p>At {@code (30000000 - 12, 30000000 - 12)} — the corner of the world, where vanilla's own
 * world-border story ends — there is a single chunk that contains a perfect recreation of
 * everything the player has done since they joined this world. Every memory the recorder stored is
 * rebuilt there, block for block, and then the chunk plays them back one at a time so that walking
 * into it feels like walking into a diorama of your own save file.</p>
 */
public final class LastChunkEngine {
	private LastChunkEngine() {
	}

	private static int replayCursor;

	public static BlockPos lastChunkCentre() {
		return new BlockPos(BtlConfig.LAST_CHUNK_BLOCK_X, 0, BtlConfig.LAST_CHUNK_BLOCK_Z);
	}

	public static void tick(MinecraftServer server, int ticks) {
		ServerWorld overworld = server.getOverworld();

		if (overworld == null) {
			return;
		}

		for (ServerPlayerEntity player : server.getPlayerManager().getPlayerList()) {
			if (player.getServerWorld() != overworld) {
				continue;
			}

			BlockPos centre = lastChunkCentre();
			double distance = Math.sqrt(player.squaredDistanceTo(centre.getX() + 0.5D, player.getY(), centre.getZ() + 0.5D));

			if (distance > BtlConfig.LAST_CHUNK_TRIGGER_DISTANCE) {
				continue;
			}

			BtlSafe.guard("last_chunk.arrival", () -> onArrival(overworld, player));
		}
	}

	private static void onArrival(ServerWorld world, ServerPlayerEntity player) {
		BtlState state = BtlState.get();

		if (state.lastChunkGenerated() == 0) {
			state.setLastChunkGenerated(1);
			BtlNetworking.broadcastScreenEffect(world.getServer(), BtlNetworking.EFFECT_FLASH, 0.9F, 30);
			world.playSound(null, player.getBlockPos(), BtlSounds.BLACK_SUN_ARRIVAL, SoundCategory.AMBIENT, 1.2F, 0.6F);
			player.sendMessage(Text.translatable("message.beyondthelimits.lastchunk.found"), false);
			buildMonument(world, lastChunkCentre());
		}

		// The chunk replays the player's own memories, one step every two seconds.
		List<BtlMemory> memories = state.memories();

		if (memories.isEmpty()) {
			return;
		}

		replayCursor = (replayCursor + 1) % memories.size();
		BtlMemory memory = memories.get(replayCursor);
		replayMemoryStep(world, memory, world.getRandom().nextInt(Math.max(1, memory.sizeY())));
		world.spawnParticles(BtlParticles.MEMORY_MOTE, memory.origin().getX() + 0.5D, memory.origin().getY() + 1.0D,
				memory.origin().getZ() + 0.5D, 12, 1.5D, 1.0D, 1.5D, 0.01D);
	}

	/** The monument: a chapel of memory stone built on the spot, with a copy of the player inside. */
	private static void buildMonument(ServerWorld world, BlockPos centre) {
		BlockPos ground = world.getTopPosition(Heightmap.Type.MOTION_BLOCKING, centre);

		BtlSafe.guard("last_chunk.monument", () -> {
			int radius = 16;

			for (int x = -radius; x <= radius; x++) {
				for (int z = -radius; z <= radius; z++) {
					for (int y = -2; y <= 14; y++) {
						BlockPos pos = ground.add(x, y, z);
						boolean wall = Math.abs(x) == radius || Math.abs(z) == radius;
						boolean floor = y == -2;
						boolean roof = y == 14;
						BlockState state = null;

						if (floor) {
							state = BtlBlocks.MEMORY_STONE.getDefaultState();
						} else if (wall && y < 12) {
							state = BtlBlocks.MEMORY_STONE.getDefaultState();
						} else if (roof) {
							state = BtlBlocks.MEMORY_STONE.getDefaultState();
						} else if ((wall || roof) && world.getRandom().nextInt(3) == 0) {
							state = BtlBlocks.MEMORY_LAMP.getDefaultState();
						} else if (floor || roof) {
							continue;
						} else {
							state = Blocks.AIR.getDefaultState();
						}

						world.setBlockState(pos, state, Block.NOTIFY_LISTENERS);
					}
				}
			}

			// The copy of the player, standing at the centre, waiting.
			var copy = BtlEntities.MEMORY_ECHO.create(world);

			if (copy != null) {
				copy.refreshPositionAndAngles(ground.getX() + 0.5D, ground.getY(), ground.getZ() + 0.5D, 180.0F, 0.0F);
				copy.setPersistent();
				world.spawnEntity(copy);
			}
		});
	}

	/**
	 * Rebuilds one vertical slice of a stored memory.
	 *
	 * @param y the layer of the memory to place, used so that a memory appears to be "printed" into
	 *          the world rather than appearing instantly
	 */
	public static void replayMemoryStep(ServerWorld world, BtlMemory memory, int y) {
		BtlSafe.guard("last_chunk.replay", () -> {
			List<String> palette = memory.palette();
			short[] indices = memory.indices();
			int sizeX = memory.sizeX();
			int sizeY = memory.sizeY();
			int sizeZ = memory.sizeZ();
			int layer = Math.max(0, Math.min(sizeY - 1, y));
			BlockPos origin = memory.origin();

			for (int z = 0; z < sizeZ; z++) {
				for (int x = 0; x < sizeX; x++) {
					int index = (layer * sizeZ + z) * sizeX + x;

					if (index < 0 || index >= indices.length) {
						continue;
					}

					short paletteIndex = indices[index];

					if (paletteIndex < 0 || paletteIndex >= palette.size()) {
						continue;
					}

					Identifier id = Identifier.tryParse(palette.get(paletteIndex));

					if (id == null) {
						continue;
					}

					BlockState state = Registries.BLOCK.get(id).getDefaultState();
					BlockPos pos = origin.add(x, layer, z);
					world.setBlockState(pos, state, Block.NOTIFY_LISTENERS);
					world.spawnParticles(BtlParticles.MEMORY_MOTE, pos.getX() + 0.5D, pos.getY() + 0.5D, pos.getZ() + 0.5D,
							1, 0.2D, 0.2D, 0.2D, 0.0D);
				}
			}
		});
	}

	/** /beyondthelimits lastchunk — teleports a player to the monument, for streams and testing. */
	public static boolean sendToLastChunk(ServerPlayerEntity player) {
		return BtlSafe.supply("last_chunk.send", () -> {
			ServerWorld overworld = player.getServer().getOverworld();

			if (overworld == null) {
				return false;
			}

			BlockPos centre = lastChunkCentre();
			BlockPos ground = overworld.getTopPosition(Heightmap.Type.MOTION_BLOCKING, centre);
			buildMonument(overworld, centre);
			player.teleport(overworld, ground.getX() + 0.5D, ground.getY() + 1.0D, ground.getZ() + 0.5D, 0.0F, 0.0F);
			BtlState.get().setLastChunkGenerated(1);
			return true;
		}, false);
	}
}
