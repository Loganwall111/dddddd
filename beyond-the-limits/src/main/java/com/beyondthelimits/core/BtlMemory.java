package com.beyondthelimits.core;

import java.util.ArrayList;
import java.util.List;
import net.minecraft.block.BlockState;
import net.minecraft.nbt.NbtCompound;
import net.minecraft.nbt.NbtList;
import net.minecraft.nbt.NbtString;
import net.minecraft.registry.Registries;
import net.minecraft.util.Identifier;
import net.minecraft.util.math.BlockPos;

/**
 * One captured piece of the player's history.
 *
 * <p>The Last Chunk is documented as containing "a perfect recreation of everything you have done
 * in the world". Beyond the Limits implements that honestly instead of faking it: every placement,
 * every destruction, every snapshot the player takes with a {@code memory_shard} is compressed into
 * a {@link BtlMemory} and stored in the world save. When the player reaches the final chunk, all of
 * those memories are replayed — block for block — inside a monument that is literally built out of
 * the player's own history.</p>
 */
public final class BtlMemory {
	/** Dimensions are stored by id so that memories survive registry reloads. */
	private final String dimension;
	private final BlockPos origin;
	private final int sizeX;
	private final int sizeY;
	private final int sizeZ;
	private final long tick;
	private final List<String> palette;
	private final short[] indices;

	public BtlMemory(String dimension, BlockPos origin, int sizeX, int sizeY, int sizeZ, long tick,
			List<String> palette, short[] indices) {
		this.dimension = dimension;
		this.origin = origin;
		this.sizeX = sizeX;
		this.sizeY = sizeY;
		this.sizeZ = sizeZ;
		this.tick = tick;
		this.palette = palette;
		this.indices = indices;
	}

	/**
	 * Captures a box of the world.
	 *
	 * @param lookup used to resolve blocks from the live world; air blocks are stored as -1 so that
	 *               memories stay small on disk
	 */
	public static BtlMemory capture(String dimension, BlockPos origin, int sizeX, int sizeY, int sizeZ, long tick,
			BlockLookup lookup) {
		List<String> palette = new ArrayList<>();
		short[] indices = new short[sizeX * sizeY * sizeZ];

		for (int y = 0; y < sizeY; y++) {
			for (int z = 0; z < sizeZ; z++) {
				for (int x = 0; x < sizeX; x++) {
					int i = (y * sizeZ + z) * sizeX + x;
					BlockState state = lookup.get(origin.add(x, y, z));

					if (state == null || state.isAir()) {
						indices[i] = -1;
						continue;
					}

					Identifier blockId = Registries.BLOCK.getId(state.getBlock());
					String key = blockId.toString();
					int paletteIndex = palette.indexOf(key);

					if (paletteIndex < 0) {
						palette.add(key);
						paletteIndex = palette.size() - 1;
					}

					indices[i] = (short) paletteIndex;
				}
			}
		}

		return new BtlMemory(dimension, origin, sizeX, sizeY, sizeZ, tick, palette, indices);
	}

	public String dimension() {
		return dimension;
	}

	public BlockPos origin() {
		return origin;
	}

	public int sizeX() {
		return sizeX;
	}

	public int sizeY() {
		return sizeY;
	}

	public int sizeZ() {
		return sizeZ;
	}

	public long tick() {
		return tick;
	}

	public List<String> palette() {
		return palette;
	}

	public short[] indices() {
		return indices;
	}

	/** Number of non-air blocks, used to rank "important" memories for the monument. */
	public int weight() {
		int count = 0;

		for (short index : indices) {
			if (index >= 0) {
				count++;
			}
		}

		return count;
	}

	public NbtCompound toNbt() {
		NbtCompound nbt = new NbtCompound();
		nbt.putString("dimension", dimension);
		nbt.putInt("x", origin.getX());
		nbt.putInt("y", origin.getY());
		nbt.putInt("z", origin.getZ());
		nbt.putInt("sx", sizeX);
		nbt.putInt("sy", sizeY);
		nbt.putInt("sz", sizeZ);
		nbt.putLong("tick", tick);

		NbtList paletteNbt = new NbtList();

		for (String entry : palette) {
			paletteNbt.add(NbtString.of(entry));
		}

		nbt.put("palette", paletteNbt);

		int[] raw = new int[indices.length];

		for (int i = 0; i < indices.length; i++) {
			raw[i] = indices[i];
		}

		nbt.putIntArray("blocks", raw);
		return nbt;
	}

	public static BtlMemory fromNbt(NbtCompound nbt) {
		String dimension = nbt.getString("dimension");
		BlockPos origin = new BlockPos(nbt.getInt("x"), nbt.getInt("y"), nbt.getInt("z"));
		int sx = Math.max(1, nbt.getInt("sx"));
		int sy = Math.max(1, nbt.getInt("sy"));
		int sz = Math.max(1, nbt.getInt("sz"));
		long tick = nbt.getLong("tick");
		List<String> palette = new ArrayList<>();
		NbtList paletteNbt = nbt.getList("palette", 8);

		for (int i = 0; i < paletteNbt.size(); i++) {
			palette.add(paletteNbt.getString(i));
		}

		int[] raw = nbt.getIntArray("blocks");
		short[] indices = new short[Math.min(raw.length, sx * sy * sz)];

		for (int i = 0; i < indices.length; i++) {
			indices[i] = (short) raw[i];
		}

		return new BtlMemory(dimension, origin, sx, sy, sz, tick, palette, indices);
	}

	/** Functional interface kept tiny on purpose: it is the only thing capture needs from a world. */
	@FunctionalInterface
	public interface BlockLookup {
		BlockState get(BlockPos pos);
	}
}
