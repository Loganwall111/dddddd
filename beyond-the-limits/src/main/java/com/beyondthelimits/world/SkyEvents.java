package com.beyondthelimits.world;

import com.beyondthelimits.core.BtlState;
import com.beyondthelimits.network.BtlNetworking;
import com.beyondthelimits.registry.BtlBlocks;
import com.beyondthelimits.registry.BtlParticles;
import com.beyondthelimits.registry.BtlSounds;
import com.beyondthelimits.util.BtlSafe;
import net.minecraft.block.Block;
import net.minecraft.server.network.ServerPlayerEntity;
import net.minecraft.server.world.ServerWorld;
import net.minecraft.sound.SoundCategory;
import net.minecraft.util.math.BlockPos;
import net.minecraft.util.math.random.Random;
import net.minecraft.world.Heightmap;
import net.minecraft.world.World;
import net.minecraft.world.chunk.WorldChunk;

/**
 * The sky, as a physical object.
 *
 * <p>The Sky Is Fake is one of the mod's earliest anomalies and one of its slowest: cracks spread from
 * wherever a rift first opened, and the client renders them as a lattice of light across the whole
 * dome. This class is what makes the lie concrete. Once the cracks are wide enough, chunks of sky
 * <em>fall</em> — skylight-coloured shards that land in the world, can be mined, and keep glowing when
 * everything else has stopped working.</p>
 *
 * <p>It is also the mechanism behind the "another world behind the sky" beat: the shards do not fall
 * from the sky the player can see, they fall from the sky <em>behind</em> it, and they are made of it.</p>
 */
public final class SkyEvents {
	private SkyEvents() {
	}

	/** Called once per chunk tick from {@code ServerWorldMixin}. */
	public static void tickChunk(ServerWorld world, WorldChunk chunk, int randomTickSpeed) {
		BtlSafe.guard("sky.tick_chunk", () -> {
			BtlState state = BtlState.get();
			int crack = state.skyCrack();
			int collision = state.collision();

			if (crack < 20 && collision < 20) {
				return;
			}

			Random random = world.getRandom();

			// How often the sky sheds: one attempt per chunk tick once the cracks are severe.
			int chance = Math.max(20, 4000 / Math.max(1, crack + collision));

			if (random.nextInt(chance) != 0) {
				return;
			}

			BlockPos pos = world.getTopPosition(Heightmap.Type.MOTION_BLOCKING,
					new BlockPos(chunk.getPos().getStartX() + random.nextInt(16), 0, chunk.getPos().getStartZ() + random.nextInt(16)));
			int height = 180 + random.nextInt(80);
			BlockPos spawn = new BlockPos(pos.getX(), Math.min(world.getTopY() - 2, height), pos.getZ());

			world.setBlockState(spawn, BtlBlocks.SKY_SHARD.getDefaultState(), Block.NOTIFY_LISTENERS);
			world.spawnParticles(BtlParticles.REALITY_SCAR, spawn.getX() + 0.5D, spawn.getY(), spawn.getZ() + 0.5D,
					6, 0.4D, 0.4D, 0.4D, 0.02D);

			// The sound arrives late, the way thunder does.
			world.playSound(null, pos, BtlSounds.REALITY_TEAR, SoundCategory.AMBIENT, 0.35F, 1.6F);

			if (state.skyCrack() > 80 && world.getRegistryKey() == World.OVERWORLD) {
				for (ServerPlayerEntity player : world.getServer().getPlayerManager().getPlayerList()) {
					BtlNetworking.sendSkyState(player);
				}
			}
		});
	}

	/** Called when a sky shard is collected: the sky notices, and the count of cracks goes up. */
	public static void onShardCollected(ServerPlayerEntity player) {
		BtlSafe.guard("sky.shard", () -> {
			BtlState state = BtlState.get();
			state.setSkyCrack(state.skyCrack() + 1);
			state.addReality(-1);
			BtlNetworking.sendSkyState(player);
			player.playSoundToPlayer(BtlSounds.REALITY_TEAR, SoundCategory.PLAYERS, 0.6F, 1.8F);
		});
	}

	/** The crack count as a 0-5 band, used by the HUD and the guidebook. */
	public static int band(BtlState state) {
		return Math.min(5, state.skyCrack() / 20);
	}
}
