package com.beyondthelimits.core.engine;

import com.beyondthelimits.core.BtlConfig;
import com.beyondthelimits.core.BtlMemory;
import com.beyondthelimits.core.BtlState;
import com.beyondthelimits.registry.BtlParticles;
import com.beyondthelimits.registry.BtlSounds;
import com.beyondthelimits.util.BtlSafe;
import net.minecraft.block.BlockState;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.network.ServerPlayerEntity;
import net.minecraft.server.world.ServerWorld;
import net.minecraft.sound.SoundCategory;
import net.minecraft.util.math.BlockPos;

/**
 * The Memory Recorder.
 *
 * <p>Everything in Chapter One that "remembers" the player is reading from this: the Last Chunk rebuilds
 * the player's history out of it, the Mirror World compares itself against it, and the dim memories
 * that leak into the Overworld during a mutation are literally slices of it.</p>
 *
 * <p>Once a minute the recorder takes a snapshot of a box around each player — the volume is capped,
 * the palette is shared, and air is stored as a sentinel — and pushes it into the world's memory log.
 * When the log is full the oldest entry is dropped, so the record is always the player's most recent
 * history rather than the beginning of it, which is thematically the point.</p>
 */
public final class MemoryRecorder {
	private MemoryRecorder() {
	}

	private static final int SNAPSHOT_INTERVAL = 20 * 60;

	public static void tick(MinecraftServer server, int ticks) {
		if (ticks % SNAPSHOT_INTERVAL != 0) {
			return;
		}

		for (ServerPlayerEntity player : server.getPlayerManager().getPlayerList()) {
			BtlSafe.guard("memory.player", () -> capture(player));
		}
	}

	private static void capture(ServerPlayerEntity player) {
		ServerWorld world = player.getServerWorld();
		BtlState state = BtlState.get();
		int radius = Math.max(4, BtlConfig.MEMORY_SNAPSHOT_RADIUS);
		int size = radius * 2 + 1;

		// Volume guard: the recorder is allowed to be forgetful rather than expensive.
		int volume = size * size * size;
		int height = Math.min(size, Math.max(3, BtlConfig.MAX_MEMORY_VOLUME / (size * size)));

		BlockPos origin = player.getBlockPos().add(-radius, -height / 2, -radius);

		BtlMemory memory = BtlMemory.capture(world.getRegistryKey().getValue().toString(), origin, size, height, size,
				world.getTime(), pos -> lookup(world, pos));

		if (memory == null || memory.weight() > BtlConfig.MAX_MEMORY_VOLUME) {
			return;
		}

		state.addMemory(memory);

		if (world.getTime() % 20L * 60L * 10L < SNAPSHOT_INTERVAL) {
			player.playSoundToPlayer(BtlSounds.MEMORY_CHIME, SoundCategory.AMBIENT, 0.25F, 1.4F);
		}

		world.spawnParticles(BtlParticles.MEMORY_MOTE, player.getX(), player.getY() + 1.0D, player.getZ(),
				8, radius / 2.0D, 1.5D, radius / 2.0D, 0.01D);
	}

	private static BlockState lookup(ServerWorld world, BlockPos pos) {
		if (world.isOutOfHeightLimit(pos)) {
			return null;
		}

		return world.getBlockState(pos);
	}

	/** How much of the player's history is being kept, for the dimensional gauge. */
	public static String describe(BtlState state) {
		var memories = state.memories();
		int volume = 0;

		for (BtlMemory memory : memories) {
			volume += memory.weight();
		}

		return memories.size() + " memories (" + volume + " blocks)";
	}
}
