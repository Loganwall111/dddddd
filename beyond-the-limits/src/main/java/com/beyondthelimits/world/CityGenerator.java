package com.beyondthelimits.world;

import com.beyondthelimits.core.BtlState;
import com.beyondthelimits.core.engine.BackroomsEngine;
import com.beyondthelimits.registry.BtlBlocks;
import com.beyondthelimits.registry.BtlParticles;
import com.beyondthelimits.registry.BtlSounds;
import com.beyondthelimits.util.BtlSafe;
import net.minecraft.block.Block;
import net.minecraft.block.Blocks;
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
 * The Old City, and the thing in its warehouse.
 *
 * <p>Every world gets one city. Its position comes from the seed, so it is in a different place for
 * every player, and it is only ever built once — the first time a player gets close enough for the
 * city to matter. It is not a ruin and it is not a village: it is a city that was abandoned by
 * something that left in a hurry, with streets, blocks, windows, a plaza, a fountain and — at the
 * centre, in a warehouse with the roof half gone — the see-through rift that goes down into the
 * Backrooms.</p>
 *
 * <p>This is the mod's opening invitation. The guidebook gives the player these coordinates before
 * they have any idea what a rift is.</p>
 */
public final class CityGenerator {
	private CityGenerator() {
	}

	private static final int STREETS = 5;
	private static final int BLOCK = 26;

	/** Builds the city into the given world if it is not there yet. Idempotent and safe to call often. */
	public static boolean ensureCity(ServerWorld world, boolean announce) {
		return BtlSafe.supply("city.ensure", () -> {
			BtlState state = BtlState.get();

			if (state.cityBuilt() != 0) {
				return false;
			}

			BlockPos centre = BackroomsEngine.cityCentre(state.riftSeed());
			BlockPos surface = world.getTopPosition(Heightmap.Type.MOTION_BLOCKING, centre);
			Random random = Random.create(state.riftSeed() ^ 0x0C17E5L);
			int radius = (STREETS * BLOCK) / 2;
			int centreY = surface.getY();

			// Flatten the footprint first: a city on a slope looks like a mistake.
			for (int x = -radius - 8; x <= radius + 8; x++) {
				for (int z = -radius - 8; z <= radius + 8; z++) {
					BlockPos column = new BlockPos(surface.getX() + x, 0, surface.getZ() + z);
					int top = world.getTopPosition(Heightmap.Type.MOTION_BLOCKING, column).getY();

					for (int y = centreY; y < top; y++) {
						world.setBlockState(new BlockPos(column.getX(), y, column.getZ()), Blocks.AIR.getDefaultState(), Block.NOTIFY_LISTENERS);
					}

					for (int y = centreY - 1; y > centreY - 3; y--) {
						world.setBlockState(new BlockPos(column.getX(), y, column.getZ()),
								BtlBlocks.WAREHOUSE_CONCRETE.getDefaultState(), Block.NOTIFY_LISTENERS);
					}
				}
			}

			// Streets and blocks.
			for (int gx = -STREETS; gx <= STREETS; gx++) {
				for (int gz = -STREETS; gz <= STREETS; gz++) {
					int streetX = surface.getX() + gx * BLOCK;
					int streetZ = surface.getZ() + gz * BLOCK;
					// Every grid line is a street: the city is a lattice, like a housing estate that
					// grew without anyone deciding where the centre was.
					if (Math.abs(gx) == STREETS || Math.abs(gz) == STREETS) {
						road(world, new BlockPos(streetX, centreY, streetZ), random);
					}

					if (gx != 0 || gz != 0) {
						if (random.nextInt(4) != 0) {
							building(world, random, new BlockPos(streetX + 6, centreY, streetZ + 6), 10, 12, false);
						}
					}
				}
			}

			plaza(world, random, new BlockPos(surface.getX(), centreY, surface.getZ()));

			// The Abandoned Warehouse: the one building the whole city exists to point at.
			BlockPos warehouse = new BlockPos(surface.getX() + BLOCK, centreY, surface.getZ() + BLOCK);
			building(world, random, warehouse, 30, 14, true);
			BlockPos gate = new BlockPos(warehouse.getX() + 15, centreY + 1, warehouse.getZ() + 15);
			BackroomsEngine.registerGate(world, gate);
			BtlState.get().setCityBuilt(1);

			world.playSound(null, gate, BtlSounds.RIFT_OPEN, SoundCategory.AMBIENT, 2.0F, 0.4F);
			world.spawnParticles(BtlParticles.RIFT_SPARK, gate.getX(), gate.getY() + 2.0D, gate.getZ(),
					80, 8.0D, 6.0D, 8.0D, 0.05D);

			if (announce) {
				for (ServerPlayerEntity player : world.getServer().getPlayerManager().getPlayerList()) {
					player.sendMessage(Text.translatable("message.beyondthelimits.city.built", surface.getX(), surface.getZ())
							.formatted(Formatting.GOLD), false);
				}
			}

			return true;
		}, false);
	}

	private static void road(ServerWorld world, BlockPos centre, Random random) {
		for (int x = -BLOCK / 2; x <= BLOCK / 2; x++) {
			for (int z = -6; z <= 6; z++) {
				BlockPos pos = centre.add(x, 0, z);
				world.setBlockState(pos, BtlBlocks.WAREHOUSE_FLOOR.getDefaultState(), Block.NOTIFY_LISTENERS);

				if (Math.abs(z) == 6 && random.nextInt(9) == 0) {
					world.setBlockState(pos.up(), Blocks.STONE.getDefaultState(), Block.NOTIFY_LISTENERS);
				}
			}
		}
	}

	private static void building(ServerWorld world, Random random, BlockPos corner, int size, int height, boolean warehouse) {
		int width = size;
		int depth = size;
		int floors = warehouse ? 1 : 2 + random.nextInt(4);

		for (int x = 0; x < width; x++) {
			for (int z = 0; z < depth; z++) {
				for (int y = 0; y < height; y++) {
					BlockPos pos = corner.add(x, y, z);
					boolean wall = x == 0 || z == 0 || x == width - 1 || z == depth - 1;
					boolean roof = y == height - 1;

					if (roof) {
						// The warehouse roof is half gone: the sky is visible through the gate.
						if (warehouse && random.nextInt(3) == 0) {
							continue;
						}

						world.setBlockState(pos, BtlBlocks.WAREHOUSE_CONCRETE.getDefaultState(), Block.NOTIFY_LISTENERS);
						continue;
					}

					if (wall) {
						boolean window = !warehouse && (y % 6 == 3) && (x % 4 == 0 || z % 4 == 0);
						boolean doorway = warehouse && y < 3 && ((x == width / 2) && (z == 0 || z == depth - 1));
						world.setBlockState(pos, doorway ? Blocks.AIR.getDefaultState()
								: window ? BtlBlocks.VOID_GLASS.getDefaultState()
								: BtlBlocks.WAREHOUSE_CONCRETE.getDefaultState(), Block.NOTIFY_LISTENERS);
						continue;
					}

					if (floorLevel(y, floors, height)) {
						world.setBlockState(pos, BtlBlocks.WAREHOUSE_FLOOR.getDefaultState(), Block.NOTIFY_LISTENERS);
					}
				}
			}
		}
	}

	private static boolean floorLevel(int y, int floors, int height) {
		if (floors <= 1) {
			return y == 0;
		}

		int spacing = Math.max(3, height / (floors + 1));
		return y % spacing == 0;
	}

	private static void plaza(ServerWorld world, Random random, BlockPos centre) {
		int radius = 14;

		for (int x = -radius; x <= radius; x++) {
			for (int z = -radius; z <= radius; z++) {
				BlockPos pos = centre.add(x, 0, z);

				if (x * x + z * z <= radius * radius) {
					world.setBlockState(pos, BtlBlocks.WAREHOUSE_FLOOR.getDefaultState(), Block.NOTIFY_LISTENERS);
				}
			}
		}

		// The fountain runs black. Nobody in the city found that strange enough to leave.
		for (int x = -3; x <= 3; x++) {
			for (int z = -3; z <= 3; z++) {
				if (x * x + z * z > 9) {
					continue;
				}

				world.setBlockState(centre.add(x, 0, z), BtlBlocks.BLEED_POOL.getDefaultState(), Block.NOTIFY_LISTENERS);
				world.setBlockState(centre.add(x, -1, z), Blocks.STONE_BRICKS.getDefaultState(), Block.NOTIFY_LISTENERS);
			}
		}

		for (int i = 0; i < 8; i++) {
			double angle = i / 8.0D * Math.PI * 2.0D;
			BlockPos statue = centre.add((int) (Math.cos(angle) * 10), 0, (int) (Math.sin(angle) * 10));
			world.setBlockState(statue, BtlBlocks.ANCIENT_STATUE.getDefaultState(), Block.NOTIFY_LISTENERS);
		}
	}

	/** Called on world load and on player join: builds the city if the player is near enough to see it. */
	public static void tickProximity(MinecraftServer server) {
		ServerWorld overworld = server.getOverworld();

		if (overworld == null || BtlState.get().cityBuilt() != 0) {
			return;
		}

		BlockPos centre = BackroomsEngine.cityCentre(BtlState.get().riftSeed());

		for (ServerPlayerEntity player : server.getPlayerManager().getPlayerList()) {
			if (player.squaredDistanceTo(centre.getX(), centre.getY(), centre.getZ()) < 256.0D * 256.0D) {
				ensureCity(overworld, true);
				return;
			}
		}
	}
}
