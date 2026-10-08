package com.beyondthelimits.core.engine;

import com.beyondthelimits.core.BtlConfig;
import com.beyondthelimits.core.BtlState;
import com.beyondthelimits.registry.BtlBlocks;
import com.beyondthelimits.network.BtlNetworking;
import com.beyondthelimits.registry.BtlItems;
import com.beyondthelimits.registry.BtlParticles;
import com.beyondthelimits.registry.BtlSounds;
import com.beyondthelimits.util.BtlSafe;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import net.minecraft.block.Block;
import net.minecraft.block.Blocks;
import net.minecraft.item.ItemStack;
import net.minecraft.item.Items;
import net.minecraft.component.DataComponentTypes;
import net.minecraft.component.type.LoreComponent;
import net.minecraft.server.MinecraftServer;
import net.minecraft.entity.player.PlayerEntity;
import net.minecraft.server.network.ServerPlayerEntity;
import net.minecraft.server.world.ServerWorld;
import net.minecraft.sound.SoundCategory;
import net.minecraft.text.Text;
import net.minecraft.util.Formatting;
import net.minecraft.util.math.BlockPos;
import net.minecraft.util.math.random.Random;
import net.minecraft.world.Heightmap;

/**
 * The civilization that was not there.
 *
 * <p>Every time the player sleeps, the world builds another piece of a city that has never existed:
 * first roads and footing stones, then walls and statues, then temples, and finally — below the first
 * layer of stone — an entire underground city, connected to the surface by stairs nobody dug. The
 * civilization "remembers" being built: the pieces appear in a sensible order, aligned to each other,
 * in a style that gets more confident as the stage rises, as though something is getting better at
 * being a civilization the more often somebody sleeps.</p>
 *
 * <p>It also leaves maps. Every night adds one more to the pile.</p>
 */
public final class LostCivilizationEngine {
	private LostCivilizationEngine() {
	}

	public static void tick(MinecraftServer server, int ticks) {
		BtlState state = BtlState.get();

		// The civilization keeps building between sleeps too, more slowly.
		if (ticks % (BtlConfig.LOST_CIV_PER_SLEEP * 1200) != 0) {
			return;
		}

		for (ServerPlayerEntity player : server.getPlayerManager().getPlayerList()) {
			BtlSafe.guard("lostciv.passive", () -> build(state, player.getServerWorld(), player.getBlockPos(), state.lostCivStage(), false));
		}
	}

	/** Called when a player sleeps. The main clock of the civilization. */
	public static void onSleep(ServerPlayerEntity player) {
		BtlSafe.guard("lostciv.sleep", () -> {
			BtlState state = BtlState.get();
			Map<UUID, Integer> sleeps = state.sleeps();
			int count = sleeps.getOrDefault(player.getUuid(), 0) + 1;
			sleeps.put(player.getUuid(), count);

			if (count % BtlConfig.LOST_CIV_PER_SLEEP != 0) {
				return;
			}

			int stage = Math.min(BtlConfig.LOST_CIV_MAX_STAGE, state.lostCivStage() + 1);
			state.setLostCivStage(stage);

			ServerWorld world = player.getServerWorld();
			BlockPos bed = player.getBlockPos();
			build(state, world, bed, stage, true);

			player.giveItemStack(makeMap(world, bed, stage));
			player.giveItemStack(new ItemStack(BtlItems.ANCIENT_TABLET));
			player.sendMessage(Text.translatable("message.beyondthelimits.lostciv.built", stage).formatted(Formatting.GOLD), false);
		});
	}

	private static void build(BtlState state, ServerWorld world, BlockPos centre, int stage, boolean announce) {
		Random random = Random.create(centre.asLong() * 31L + stage);
		BlockPos ground = world.getTopPosition(Heightmap.Type.MOTION_BLOCKING,
				centre.add(random.nextInt(48) - 24, 0, random.nextInt(48) - 24));

		if (stage <= 1) {
			road(world, random, ground, stage);
		} else if (stage == 2) {
			road(world, random, ground, stage);
			shrine(world, random, ground);
		} else if (stage == 3) {
			shrine(world, random, ground);
			statues(world, random, ground);
		} else if (stage == 4) {
			statues(world, random, ground);
			temple(world, random, ground);
		} else {
			temple(world, random, ground);
			undergroundCity(world, random, ground);
		}

		world.playSound(null, ground, BtlSounds.MEMORY_CHIME, SoundCategory.AMBIENT, 0.8F, 0.6F);
		world.spawnParticles(BtlParticles.MEMORY_MOTE, ground.getX() + 0.5D, ground.getY() + 1.0D, ground.getZ() + 0.5D,
				40, 12.0D, 3.0D, 12.0D, 0.02D);
	}

	private static void road(ServerWorld world, Random random, BlockPos ground, int stage) {
		int length = 24 + random.nextInt(30) * stage;
		boolean alongX = random.nextBoolean();

		for (int i = -length / 2; i < length / 2; i++) {
			int x = alongX ? ground.getX() + i : ground.getX();
			int z = alongX ? ground.getZ() : ground.getZ() + i;
			BlockPos surface = world.getTopPosition(Heightmap.Type.MOTION_BLOCKING, new BlockPos(x, ground.getY(), z));

			for (int w = -1; w <= 1; w++) {
				BlockPos pos = alongX ? surface.add(0, 0, w) : surface.add(w, 0, 0);
				world.setBlockState(pos, BtlBlocks.ANCIENT_BRICK.getDefaultState(), Block.NOTIFY_LISTENERS);
			}

			if (i % 8 == 0) {
				world.setBlockState(surface.up(), BtlBlocks.ANCIENT_PILLAR.getDefaultState(), Block.NOTIFY_ALL);
			}
		}
	}

	private static void shrine(ServerWorld world, Random random, BlockPos ground) {
		int radius = 5;

		for (int x = -radius; x <= radius; x++) {
			for (int z = -radius; z <= radius; z++) {
				BlockPos pos = ground.add(x, 0, z);
				world.setBlockState(pos, BtlBlocks.ANCIENT_BRICK.getDefaultState(), Block.NOTIFY_LISTENERS);

				if (Math.abs(x) == radius || Math.abs(z) == radius) {
					world.setBlockState(pos.up(), BtlBlocks.ANCIENT_PILLAR.getDefaultState(), Block.NOTIFY_LISTENERS);
					world.setBlockState(pos.up(2), BtlBlocks.ANCIENT_BRICK.getDefaultState(), Block.NOTIFY_LISTENERS);
				}
			}
		}

		world.setBlockState(ground.up(1), BtlBlocks.ANCIENT_STATUE.getDefaultState(), Block.NOTIFY_ALL);
		world.setBlockState(ground.up(2), BtlBlocks.ANCIENT_STATUE.getDefaultState(), Block.NOTIFY_ALL);
	}

	private static void statues(ServerWorld world, Random random, BlockPos ground) {
		for (int i = 0; i < 10; i++) {
			BlockPos pos = world.getTopPosition(Heightmap.Type.MOTION_BLOCKING,
					ground.add(random.nextInt(40) - 20, 0, random.nextInt(40) - 20));
			world.setBlockState(pos, BtlBlocks.ANCIENT_STATUE.getDefaultState(), Block.NOTIFY_ALL);
			world.setBlockState(pos.up(), BtlBlocks.ANCIENT_PILLAR.getDefaultState(), Block.NOTIFY_ALL);
		}
	}

	private static void temple(ServerWorld world, Random random, BlockPos ground) {
		int w = 9;
		int h = 7;

		for (int x = -w; x <= w; x++) {
			for (int z = -w; z <= w; z++) {
				for (int y = 0; y <= h; y++) {
					BlockPos pos = ground.add(x, y, z);
					boolean wall = Math.abs(x) == w || Math.abs(z) == w;
					boolean roof = y == h;

					if (wall && y < h - 1) {
						world.setBlockState(pos, y % 3 == 0 ? BtlBlocks.ANCIENT_PILLAR.getDefaultState()
								: BtlBlocks.ANCIENT_BRICK.getDefaultState(), Block.NOTIFY_LISTENERS);
					} else if (roof) {
						world.setBlockState(pos, BtlBlocks.ANCIENT_BRICK.getDefaultState(), Block.NOTIFY_LISTENERS);
					} else if (wall || roof) {
						continue;
					} else {
						world.setBlockState(pos, Blocks.AIR.getDefaultState(), Block.NOTIFY_LISTENERS);
					}
				}
			}
		}

		// The altar, and the thing the altar is for.
		world.setBlockState(ground.up(), BtlBlocks.ANCIENT_STATUE.getDefaultState(), Block.NOTIFY_ALL);
		world.setBlockState(ground.up(2), BtlBlocks.CODE_MONOLITH.getDefaultState(), Block.NOTIFY_ALL);
	}

	/** The underground city: a grid of halls under the surface, with stairs up to the shrine. */
	private static void undergroundCity(ServerWorld world, Random random, BlockPos ground) {
		int y = Math.max(world.getBottomY() + 8, ground.getY() - 34);
		int radius = 48;

		for (int x = -radius; x <= radius; x += 12) {
			for (int z = -radius; z <= radius; z += 12) {
				if (random.nextInt(4) == 0) {
					continue;
				}

				hall(world, random, new BlockPos(ground.getX() + x, y, ground.getZ() + z));
			}
		}

		// Stairs the civilization did not need but built anyway.
		int steps = Math.max(4, ground.getY() - y);

		for (int i = 0; i < steps; i++) {
			BlockPos pos = new BlockPos(ground.getX(), ground.getY() - i, ground.getZ() + i / 2);

			for (int w = -1; w <= 1; w++) {
				world.setBlockState(pos.add(w, 0, 0), BtlBlocks.ANCIENT_BRICK.getDefaultState(), Block.NOTIFY_LISTENERS);
				world.setBlockState(pos.add(w, 1, 0), Blocks.AIR.getDefaultState(), Block.NOTIFY_LISTENERS);
				world.setBlockState(pos.add(w, 2, 0), Blocks.AIR.getDefaultState(), Block.NOTIFY_LISTENERS);
			}
		}
	}

	private static void hall(ServerWorld world, Random random, BlockPos centre) {
		int w = 6;
		int h = 5;

		for (int x = -w; x <= w; x++) {
			for (int z = -w; z <= w; z++) {
				for (int y = -1; y <= h; y++) {
					BlockPos pos = centre.add(x, y, z);
					boolean wall = Math.abs(x) == w || Math.abs(z) == w;

					if (y == -1) {
						world.setBlockState(pos, BtlBlocks.ANCIENT_BRICK.getDefaultState(), Block.NOTIFY_LISTENERS);
					} else if (y == h) {
						world.setBlockState(pos, BtlBlocks.ANCIENT_BRICK.getDefaultState(), Block.NOTIFY_LISTENERS);
					} else if (wall) {
						boolean doorway = (Math.abs(x) == w && z == 0) || (Math.abs(z) == w && x == 0);
						world.setBlockState(pos, doorway ? Blocks.AIR.getDefaultState()
								: BtlBlocks.ANCIENT_BRICK.getDefaultState(), Block.NOTIFY_LISTENERS);
					} else {
						world.setBlockState(pos, Blocks.AIR.getDefaultState(), Block.NOTIFY_LISTENERS);
					}
				}
			}
		}

		if (random.nextInt(3) == 0) {
			world.setBlockState(centre.up(1), BtlBlocks.ANCIENT_STATUE.getDefaultState(), Block.NOTIFY_ALL);
			world.setBlockState(centre.up(2), BtlBlocks.MEMORY_LAMP.getDefaultState(), Block.NOTIFY_ALL);
		}
	}

	/**
	 * Reading a statue: the civilization's own account of itself.
	 *
	 * <p>Each statue carries a fragment of the story, and the fragments only work in an order the
	 * statues do not agree on.</p>
	 */
	public static void readStatue(PlayerEntity player, BlockPos pos) {
		BtlSafe.guard("lostciv.statue", () -> {
			BtlState state = BtlState.get();
			int fragment = Math.floorMod(pos.hashCode(), 6);

			player.sendMessage(Text.translatable("lore.beyondthelimits.statue." + fragment)
					.formatted(Formatting.GRAY), false);

			if (player instanceof ServerPlayerEntity serverPlayer) {
				BtlNetworking.sendScreenEffect(serverPlayer, BtlNetworking.EFFECT_MEMORY, 0.4F, 60);
				state.anomalies().put(pos.asLong(), fragment + 1);
			}
		});
	}

	/** A map that is not of anywhere the player has been: it is of where the city is going to be. */
	private static ItemStack makeMap(ServerWorld world, BlockPos centre, int stage) {
		ItemStack map = new ItemStack(Items.FILLED_MAP);
		map.set(DataComponentTypes.CUSTOM_NAME, Text.literal("ruins " + stage + " — " + centre.getX() + ", " + centre.getZ())
				.formatted(Formatting.GRAY));
		map.set(DataComponentTypes.LORE, new LoreComponent(List.of(
				Text.literal("surveyed before anyone arrived").formatted(Formatting.DARK_GRAY),
				Text.literal("the surveyor is not named").formatted(Formatting.DARK_GRAY))));
		return map;
	}
}
