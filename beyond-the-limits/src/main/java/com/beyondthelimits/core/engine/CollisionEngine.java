package com.beyondthelimits.core.engine;

import com.beyondthelimits.core.BtlConfig;
import com.beyondthelimits.core.BtlState;
import com.beyondthelimits.network.BtlNetworking;
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
import net.minecraft.world.World;

/**
 * World collision.
 *
 * <p>The Nether and the End are not other places in Chapter One; they are other <em>states</em>, and
 * the Overworld is where the two states disagree. Every day the collision deepens: at first it is
 * single blocks of netherrack in a stone field, then spires of blackstone, then whole slabs of
 * dimension terrain standing where terrain should not be, and — at the end — the two worlds occupying
 * the same coordinates at the same time, which is exactly as survivable as it sounds.</p>
 */
public final class CollisionEngine {
	private CollisionEngine() {
	}

	private static int lastMilestone;

	public static void tick(MinecraftServer server, int ticks) {
		ServerWorld overworld = server.getOverworld();

		if (overworld == null) {
			return;
		}

		BtlState state = BtlState.get();
		int collision = state.collision();
		int milestone = collision / BtlConfig.COLLISION_STRUCTURE_INTERVAL;

		if (milestone > lastMilestone) {
			lastMilestone = milestone;
			BtlSafe.guard("collision.milestone", () -> {
				for (ServerPlayerEntity player : server.getPlayerManager().getPlayerList()) {
					player.sendMessage(Text.translatable("message.beyondthelimits.collision.deeper", collision)
							.formatted(Formatting.DARK_RED), false);
					BtlNetworking.sendScreenEffect(player, BtlNetworking.EFFECT_RIFT_WASH, 0.5F, 60);
					BtlNetworking.sendSkyState(player);
				}

				state.addReality(-BtlConfig.REALITY_PER_COLLISION_MILESTONE);
			});
		}

		// Local collisions: a piece of the Nether or the End, standing in the Overworld.
		Random random = overworld.getRandom();

		if (random.nextInt(Math.max(4, 40 - collision / 5)) != 0) {
			return;
		}

		for (ServerPlayerEntity player : server.getPlayerManager().getPlayerList()) {
			if (player.getServerWorld() != overworld) {
				continue;
			}

			BtlSafe.guard("collision.collide", () -> collide(overworld, player, random, collision));
		}
	}

	private static void collide(ServerWorld world, ServerPlayerEntity player, Random random, int collision) {
		BlockPos centre = world.getTopPosition(Heightmap.Type.MOTION_BLOCKING,
				player.getBlockPos().add(random.nextInt(80) - 40, 0, random.nextInt(80) - 40));
		boolean nether = random.nextBoolean();
		int scale = 1 + Math.min(6, collision / 20);

		if (nether) {
			netherIntrusion(world, random, centre, scale);
		} else {
			endIntrusion(world, random, centre, scale);
		}

		world.playSound(null, centre, BtlSounds.REALITY_TEAR, SoundCategory.AMBIENT, 1.2F, 0.4F);
		world.spawnParticles(BtlParticles.REALITY_SCAR, centre.getX() + 0.5D, centre.getY() + 1.0D, centre.getZ() + 0.5D,
				30, scale * 2.0D, 3.0D, scale * 2.0D, 0.05D);
	}

	/** Basalt, blackstone and soul fire, standing in a field. */
	private static void netherIntrusion(ServerWorld world, Random random, BlockPos centre, int scale) {
		int height = 6 + random.nextInt(10 * scale);

		for (int y = 0; y < height; y++) {
			int radius = Math.max(1, (int) (2.5D * (1.0D - (double) y / height)) * scale);

			for (int x = -radius; x <= radius; x++) {
				for (int z = -radius; z <= radius; z++) {
					if (x * x + z * z > radius * radius) {
						continue;
					}

					world.setBlockState(centre.add(x, y, z), y == 0 && random.nextInt(4) == 0
							? Blocks.SOUL_SAND.getDefaultState()
							: random.nextInt(3) == 0 ? Blocks.BLACKSTONE.getDefaultState() : Blocks.BASALT.getDefaultState(),
							Block.NOTIFY_ALL);
				}
			}
		}

		world.setBlockState(centre.up(height), Blocks.SOUL_CAMPFIRE.getDefaultState(), Block.NOTIFY_ALL);
	}

	/** End stone, chorus and void glass: the other collision, which is quieter and worse. */
	private static void endIntrusion(ServerWorld world, Random random, BlockPos centre, int scale) {
		int radius = 3 + scale;

		for (int x = -radius; x <= radius; x++) {
			for (int z = -radius; z <= radius; z++) {
				if (x * x + z * z > radius * radius) {
					continue;
				}

				world.setBlockState(centre.add(x, 0, z), Blocks.END_STONE.getDefaultState(), Block.NOTIFY_ALL);

				if (random.nextInt(12) == 0) {
					int height = 2 + random.nextInt(6 * scale / 2 + 1);

					for (int y = 1; y <= height; y++) {
						world.setBlockState(centre.add(x, y, z),
								y == height ? Blocks.CHORUS_FLOWER.getDefaultState() : Blocks.CHORUS_PLANT.getDefaultState(),
								Block.NOTIFY_ALL);
					}
				}
			}
		}

		// The collision is stable enough to stand on and wrong enough to look at.
		world.setBlockState(centre.up(), BtlBlocks.VOID_GLASS.getDefaultState(), Block.NOTIFY_ALL);
	}

	/** Called at 0% reality: the two worlds stop taking turns. */
	public static void forceTotalCollapse(ServerWorld world) {
		BtlSafe.guard("collision.collapse", () -> {
			BtlState state = BtlState.get();
			state.setCollision(Math.min(100, state.collision() + 25));
			Random random = world.getRandom();

			for (ServerPlayerEntity player : world.getServer().getPlayerManager().getPlayerList()) {
				if (player.getServerWorld() != world) {
					continue;
				}

				for (int i = 0; i < 4; i++) {
					BlockPos centre = world.getTopPosition(Heightmap.Type.MOTION_BLOCKING,
							player.getBlockPos().add(random.nextInt(60) - 30, 0, random.nextInt(60) - 30));

					if (random.nextBoolean()) {
						netherIntrusion(world, random, centre, 4);
					} else {
						endIntrusion(world, random, centre, 4);
					}
				}

				BtlNetworking.sendSkyState(player);
				BtlNetworking.sendScreenEffect(player, BtlNetworking.EFFECT_BLACK_SUN, 1.0F, 80);
			}
		});
	}

	/** How far the collision has gone, 0-5, for the HUD and the guidebook. */
	public static int stage(BtlState state) {
		return Math.min(5, state.collision() / 20);
	}

	public static boolean reachedEnd(World world) {
		return world.getRegistryKey() == World.END && BtlState.get().collision() > 60;
	}
}
