package dev.logan.beyondthreshold.world;

import dev.logan.beyondthreshold.BTTGeneratedContent;
import dev.logan.beyondthreshold.config.BTTConfig;
import net.minecraft.block.BlockState;
import net.minecraft.block.Blocks;
import net.minecraft.server.world.ServerWorld;
import net.minecraft.util.math.BlockPos;
import net.minecraft.world.chunk.WorldChunk;

/**
 * The OnePac bridge: when a chunk of a threshold dimension loads, its
 * surface is rebuilt from procedurally generated variant blocks, hashed
 * per-position so every dimension gets a coherent alien palette.
 */
public final class PaletteSwapper {

	public static void onChunkLoad(ServerWorld world, WorldChunk chunk) {
		if (!BTTConfig.get().paletteSwap) {
			return;
		}
		int dim = BTTDimensions.indexOf(world.getRegistryKey());
		if (dim < 0 || BTTGeneratedContent.variantCount() == 0) {
			return;
		}
		long seed = BTTConfig.get().paletteSeed + dim * 7919L;
		BlockPos.Mutable pos = new BlockPos.Mutable();
		int cx = chunk.getPos().getStartX();
		int cz = chunk.getPos().getStartZ();
		int top = chunk.getTopY();

		for (int x = 0; x < 16; x++) {
			for (int z = 0; z < 16; z++) {
				for (int y = top - 1; y > world.getSeaLevel() - 8; y--) {
					pos.set(cx + x, y, cz + z);
					BlockState state = chunk.getBlockState(pos);
					int kind = kindOf(state);
					if (kind < 0) {
						continue;
					}
					int variant = hash(seed, x, y, z);
					BlockState swap = BTTGeneratedContent.blockState(kind, variant);
					if (swap != null && swap != state) {
						chunk.setBlockState(pos, swap, false);
					}
					if (kind == 1 || kind == 0) {
						// only rewrite the skin of the world, a few layers deep
						int depth = 0;
						while (depth < 4 && y - 1 > world.getSeaLevel() - 8) {
							y--;
							pos.set(cx + x, y, cz + z);
							BlockState below = chunk.getBlockState(pos);
							int bk = belowKind(below);
							if (bk < 0) {
								break;
							}
							BlockState s2 = BTTGeneratedContent.blockState(bk, hash(seed, x, y, z));
							if (s2 != null && s2 != below) {
								chunk.setBlockState(pos, s2, false);
							}
							depth++;
						}
					}
				}
			}
		}
	}

	/** 0 grass, 1 stone, 2 log, 3 leaves */
	private static int kindOf(BlockState s) {
		if (s.isOf(Blocks.GRASS_BLOCK)) return 0;
		if (s.isOf(Blocks.OAK_LOG)) return 2;
		if (s.isOf(Blocks.OAK_LEAVES)) return 3;
		return -1;
	}

	private static int belowKind(BlockState s) {
		if (s.isOf(Blocks.DIRT) || s.isOf(Blocks.GRASS_BLOCK)) return 1;
		if (s.isOf(Blocks.STONE)) return 1;
		if (s.isOf(Blocks.OAK_LOG)) return 2;
		if (s.isOf(Blocks.OAK_LEAVES)) return 3;
		return -1;
	}

	private static int hash(long seed, int x, int y, int z) {
		long h = seed * 0x9E3779B97F4A7C15L;
		h ^= x * 0x8DA6B343L;
		h ^= y * 0xD8163841L;
		h ^= z * 0xCB1AB31FL;
		h ^= h >>> 31;
		return (int) Math.floorMod(h, BTTGeneratedContent.variantCount());
	}

	private PaletteSwapper() {
	}
}
