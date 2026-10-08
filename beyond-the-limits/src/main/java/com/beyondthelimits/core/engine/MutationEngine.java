package com.beyondthelimits.core.engine;

import com.beyondthelimits.core.BtlState;
import com.beyondthelimits.entity.FacelingEntity;
import com.beyondthelimits.registry.BtlBlocks;
import com.beyondthelimits.registry.BtlEntities;
import com.beyondthelimits.registry.BtlParticles;
import com.beyondthelimits.registry.BtlSounds;
import com.beyondthelimits.util.BtlSafe;
import java.util.ArrayList;
import java.util.List;
import net.minecraft.block.Block;
import net.minecraft.block.BlockState;
import net.minecraft.block.Blocks;
import net.minecraft.entity.Entity;
import net.minecraft.entity.ItemEntity;
import net.minecraft.entity.SpawnReason;
import net.minecraft.entity.mob.MobEntity;
import net.minecraft.entity.passive.VillagerEntity;
import net.minecraft.item.ItemStack;
import net.minecraft.item.Items;
import net.minecraft.server.network.ServerPlayerEntity;
import net.minecraft.server.world.ServerWorld;
import net.minecraft.sound.SoundCategory;
import net.minecraft.text.Text;
import net.minecraft.util.math.BlockPos;
import net.minecraft.util.math.Box;
import net.minecraft.util.math.Vec3d;
import net.minecraft.util.math.random.Random;
import net.minecraft.world.Heightmap;

/**
 * The butterfly effect, in practice.
 *
 * <p>Every mutation here is a consequence of something the player did in another world. They are
 * deliberately mundane-looking at first — an extra tree, a lake in the wrong place — and escalate into
 * events that literally rewrite the terrain around where the player returned to. Nothing here is
 * random noise: each mutation is picked by {@link #roll(Random)} weighted by reality, and several of
 * them install themselves into {@link #ACTIVE} so that they keep acting on the world over the next
 * few minutes.</p>
 *
 * <p>These are the events the design brief calls for, implemented as systems rather than cutscenes:
 * bloody villagers, living roots, figures walking the earth, a house replaced by a pyramid, bloody
 * lakes, a black hole eating blocks, and tubes that pull people in.</p>
 */
public final class MutationEngine {
	private MutationEngine() {
	}

	public static final int PYRAMID = 0;
	public static final int BLOODY_LAKE = 1;
	public static final int LIVING_ROOTS = 2;
	public static final int WALKING_FIGURES = 3;
	public static final int BLACK_HOLE = 4;
	public static final int HOME_TUBES = 5;
	public static final int CORRUPTED_RAIN = 6;
	public static final int VILLAGERS_CHANGED = 7;
	public static final int MEMORY_BLEED = 8;
	public static final int STATUE_FIELD = 9;
	public static final int MIRROR_NIGHT = 10;
	public static final int WHITE_MAZE_FIELD = 11;
	public static final int RIFT_SWARM = 12;
	public static final int COUNT = 13;

	/** Mutations that keep acting after they are applied. */
	private static final List<ActiveMutation> ACTIVE = new ArrayList<>();

	/** A mutation that keeps acting on the world. Mutable because it burns down its own clock. */
	private static final class ActiveMutation {
		private final int kind;
		private final BlockPos origin;
		private int ticksLeft;

		private ActiveMutation(int kind, BlockPos origin, int ticksLeft) {
			this.kind = kind;
			this.origin = origin;
			this.ticksLeft = ticksLeft;
		}

		private int kind() {
			return kind;
		}

		private BlockPos origin() {
			return origin;
		}

		private int ticksLeft() {
			return ticksLeft;
		}

		private void tickDown() {
			ticksLeft--;
		}
	}

	public static int roll(Random random) {
		int reality = BtlState.get().reality();

		// Low reality unlocks the world-rewriting events; high reality keeps things subtle.
		int ceiling = reality > 80 ? 6 : reality > 50 ? 9 : reality > 25 ? 12 : COUNT;
		return random.nextInt(Math.max(4, Math.min(COUNT, ceiling)));
	}

	public static String describe(int kind) {
		return switch (Math.floorMod(kind, COUNT)) {
			case PYRAMID -> "something enormous has replaced a home";
			case BLOODY_LAKE -> "the ground is wet in a way it should not be";
			case LIVING_ROOTS -> "the roots are awake";
			case WALKING_FIGURES -> "figures are walking the earth";
			case BLACK_HOLE -> "a hole is eating the terrain";
			case HOME_TUBES -> "tubes are pulling things in";
			case CORRUPTED_RAIN -> "it is raining corrupted stone";
			case VILLAGERS_CHANGED -> "the villagers came back wrong";
			case MEMORY_BLEED -> "your own history is being rebuilt nearby";
			case STATUE_FIELD -> "statues stand where a field was";
			case MIRROR_NIGHT -> "everything reflective is awake";
			case WHITE_MAZE_FIELD -> "the maze is above ground now";
			default -> "a rift swarm has opened";
		};
	}

	/** Applies one mutation around the player. */
	public static void apply(ServerWorld world, ServerPlayerEntity player, int kind) {
		BtlSafe.guard("mutation.apply", () -> {
			Random random = world.getRandom();
			BlockPos centre = player.getBlockPos();

			player.sendMessage(Text.translatable("message.beyondthelimits.mutation", describe(kind))
					.formatted(net.minecraft.util.Formatting.DARK_RED), false);
			world.playSound(null, centre, BtlSounds.REALITY_TEAR, SoundCategory.AMBIENT, 1.6F, 0.4F);

			switch (Math.floorMod(kind, COUNT)) {
				case PYRAMID -> pyramid(world, centre);
				case BLOODY_LAKE -> bloodyLake(world, random, centre);
				case LIVING_ROOTS -> livingRoots(world, random, centre);
				case WALKING_FIGURES -> walkingFigures(world, random, centre);
				case BLACK_HOLE -> blackHole(world, centre);
				case HOME_TUBES -> homeTubes(world, random, centre);
				case CORRUPTED_RAIN -> corruptedRain(world, random, centre);
				case VILLAGERS_CHANGED -> villagersChanged(world, random, centre);
				case MEMORY_BLEED -> memoryBleed(world, random, centre);
				case STATUE_FIELD -> statueField(world, random, centre);
				case MIRROR_NIGHT -> mirrorNight(world, random, centre);
				case WHITE_MAZE_FIELD -> whiteMaze(world, random, centre);
				default -> riftSwarm(world, random, centre);
			}
		});
	}

	public static void tick(ServerWorld world) {
		if (ACTIVE.isEmpty()) {
			return;
		}

		ACTIVE.removeIf(mutation -> {
			BtlSafe.guard("mutation.tick", () -> tickActive(world, mutation));
			mutation.tickDown();
			return mutation.ticksLeft() <= 0;
		});
	}

	private static void tickActive(ServerWorld world, ActiveMutation mutation) {
		switch (mutation.kind()) {
			case BLACK_HOLE -> {
				BlockPos origin = mutation.origin();
				world.spawnParticles(BtlParticles.REALITY_DUST, origin.getX() + 0.5D, origin.getY() + 0.5D, origin.getZ() + 0.5D,
						20, 2.5D, 2.5D, 2.5D, 0.35D);

				for (Entity entity : world.getOtherEntities(null, new Box(origin).expand(8.0D), e -> true)) {
					Vec3d pull = origin.toCenterPos().subtract(entity.getPos()).normalize().multiply(0.08D);
					entity.addVelocity(pull.x, pull.y, pull.z);
					entity.velocityModified = true;
				}

				if (world.getRandom().nextInt(4) == 0) {
					BlockPos victim = origin.add(world.getRandom().nextInt(7) - 3, world.getRandom().nextInt(7) - 3,
							world.getRandom().nextInt(7) - 3);

					if (!world.getBlockState(victim).isAir() && !world.getBlockState(victim).isOf(BtlBlocks.GRAVITY_CORE)) {
						world.breakBlock(victim, false);
					}
				}
			}
			case HOME_TUBES -> {
				BlockPos origin = mutation.origin();

				for (Entity entity : world.getOtherEntities(null, new Box(origin).expand(10.0D), e -> true)) {
					Vec3d toTube = origin.toCenterPos().subtract(entity.getPos());
					double horizontal = Math.sqrt(toTube.x * toTube.x + toTube.z * toTube.z);

					if (horizontal < 2.5D) {
						entity.addVelocity(0.0D, 0.12D, 0.0D);
					} else {
						entity.addVelocity(toTube.x / horizontal * 0.05D, 0.02D, toTube.z / horizontal * 0.05D);
					}

					entity.velocityModified = true;
				}
			}
			case MIRROR_NIGHT -> world.spawnParticles(BtlParticles.MIRROR_MOTE, mutation.origin().getX() + 0.5D,
					mutation.origin().getY() + 2.0D, mutation.origin().getZ() + 0.5D, 6, 12.0D, 4.0D, 12.0D, 0.01D);
			default -> {
			}
		}
	}

	// -------------------------------------------------------------------------------------------
	// Individual events
	// -------------------------------------------------------------------------------------------

	/** A black pyramid of impossible size, built over wherever the player is standing. */
	private static void pyramid(ServerWorld world, BlockPos centre) {
		int base = 28;
		int height = 30;
		BlockPos ground = world.getTopPosition(Heightmap.Type.MOTION_BLOCKING, centre);

		for (int y = 0; y <= height; y++) {
			int radius = (int) Math.round(base * (1.0D - (double) y / height));

			for (int x = -radius; x <= radius; x++) {
				for (int z = -radius; z <= radius; z++) {
					if (Math.abs(x) + Math.abs(z) > radius) {
						continue;
					}

					BlockPos pos = ground.add(x, y, z);
					world.setBlockState(pos, BtlBlocks.CORRUPTED_STONE.getDefaultState(), Block.NOTIFY_LISTENERS);
				}
			}
		}

		// The apex is a code monolith: whatever built this wanted it found.
		world.setBlockState(ground.add(0, height + 1, 0), BtlBlocks.CODE_MONOLITH.getDefaultState(), Block.NOTIFY_ALL);
		world.playSound(null, ground, BtlSounds.BLACK_SUN_ARRIVAL, SoundCategory.AMBIENT, 2.0F, 0.3F);
	}

	private static void bloodyLake(ServerWorld world, Random random, BlockPos centre) {
		int radius = 9 + random.nextInt(10);
		int depth = 3 + random.nextInt(4);
		BlockPos ground = world.getTopPosition(Heightmap.Type.MOTION_BLOCKING, centre);

		for (int x = -radius; x <= radius; x++) {
			for (int z = -radius; z <= radius; z++) {
				double distance = Math.sqrt(x * x + z * z);

				if (distance > radius) {
					continue;
				}

				for (int y = 0; y > -depth; y--) {
					world.setBlockState(ground.add(x, y, z), BtlBlocks.BLEED_POOL.getDefaultState(), Block.NOTIFY_LISTENERS);
				}

				if (distance > radius - 2.0D) {
					world.setBlockState(ground.add(x, 0, z), BtlBlocks.BLEEDING_VEIN.getDefaultState(), Block.NOTIFY_LISTENERS);
				}
			}
		}

		world.playSound(null, ground, BtlSounds.CORRUPTION_WHISPER, SoundCategory.AMBIENT, 1.4F, 0.3F);
	}

	private static void livingRoots(ServerWorld world, Random random, BlockPos centre) {
		int radius = 16;

		for (int x = -radius; x <= radius; x++) {
			for (int z = -radius; z <= radius; z++) {
				BlockPos surface = world.getTopPosition(Heightmap.Type.MOTION_BLOCKING, centre.add(x, 0, z));

				if (random.nextInt(3) == 0) {
					world.setBlockState(surface, BtlBlocks.BLEEDING_VEIN.getDefaultState(), Block.NOTIFY_LISTENERS);
				}

				if (random.nextInt(24) == 0) {
					int height = 3 + random.nextInt(6);

					for (int y = 0; y < height; y++) {
						world.setBlockState(surface.up(y), BtlBlocks.ANCIENT_PILLAR.getDefaultState(), Block.NOTIFY_LISTENERS);
					}
				}
			}
		}
	}

	private static void walkingFigures(ServerWorld world, Random random, BlockPos centre) {
		BlockPos ground = world.getTopPosition(Heightmap.Type.MOTION_BLOCKING, centre);
		int count = 4 + random.nextInt(6);

		for (int i = 0; i < count; i++) {
			FacelingEntity figure = BtlEntities.FACELING.create(world, SpawnReason.EVENT);

			if (figure == null) {
				continue;
			}

			double angle = random.nextDouble() * Math.PI * 2.0D;
			double distance = 20.0D + random.nextDouble() * 30.0D;
			double x = ground.getX() + Math.cos(angle) * distance;
			double z = ground.getZ() + Math.sin(angle) * distance;
			BlockPos spawn = world.getTopPosition(Heightmap.Type.MOTION_BLOCKING, BlockPos.ofFloored(x, ground.getY(), z));
			figure.refreshPositionAndAngles(spawn.getX() + 0.5D, spawn.getY(), spawn.getZ() + 0.5D, random.nextFloat() * 360.0F, 0.0F);
			figure.setPersistent();
			world.spawnEntity(figure);
		}
	}

	/** A hole in the world that keeps consuming. */
	private static void blackHole(ServerWorld world, BlockPos centre) {
		BlockPos target = world.getTopPosition(Heightmap.Type.MOTION_BLOCKING, centre);

		world.setBlockState(target, BtlBlocks.GRAVITY_CORE.getDefaultState(), Block.NOTIFY_ALL);

		// It starts by eating its own crater.
		for (int x = -4; x <= 4; x++) {
			for (int z = -4; z <= 4; z++) {
				for (int y = 0; y > -6; y--) {
					BlockPos pos = target.add(x, y, z);
					world.breakBlock(pos, false);
				}
			}
		}

		ACTIVE.add(new ActiveMutation(BLACK_HOLE, target, 20 * 90));
		world.playSound(null, target, BtlSounds.REALITY_TEAR, SoundCategory.AMBIENT, 2.0F, 0.2F);
	}

	/** Glass tubes that suck everything nearby into the sky. */
	private static void homeTubes(ServerWorld world, Random random, BlockPos centre) {
		int tubes = 2 + random.nextInt(3);

		for (int i = 0; i < tubes; i++) {
			double angle = random.nextDouble() * Math.PI * 2.0D;
			double distance = 6.0D + random.nextDouble() * 10.0D;
			BlockPos ground = world.getTopPosition(Heightmap.Type.MOTION_BLOCKING,
					BlockPos.ofFloored(centre.getX() + Math.cos(angle) * distance, centre.getY(),
							centre.getZ() + Math.sin(angle) * distance));
			int height = 12 + random.nextInt(12);

			for (int y = 0; y < height; y++) {
				for (int x = -1; x <= 1; x++) {
					for (int z = -1; z <= 1; z++) {
						boolean wall = Math.abs(x) == 1 || Math.abs(z) == 1;
						world.setBlockState(ground.add(x, y, z),
								wall ? BtlBlocks.VOID_GLASS.getDefaultState() : Blocks.AIR.getDefaultState(),
								Block.NOTIFY_LISTENERS);
					}
				}
			}

			ACTIVE.add(new ActiveMutation(HOME_TUBES, ground.up(height / 2), 20 * 120));
		}
	}

	private static void corruptedRain(ServerWorld world, Random random, BlockPos centre) {
		for (int i = 0; i < 240; i++) {
			int x = centre.getX() + random.nextInt(48) - 24;
			int z = centre.getZ() + random.nextInt(48) - 24;
			BlockPos surface = world.getTopPosition(Heightmap.Type.MOTION_BLOCKING, new BlockPos(x, centre.getY(), z));
			world.setBlockState(surface.up(random.nextInt(6)), BtlBlocks.CORRUPTED_STONE.getDefaultState(), Block.NOTIFY_LISTENERS);
		}

		world.setWeather(0, 20 * 120, true, true);
	}

	/** The villagers came back, but not as themselves. */
	private static void villagersChanged(ServerWorld world, Random random, BlockPos centre) {
		List<VillagerEntity> villagers = world.getEntitiesByClass(VillagerEntity.class, new Box(centre).expand(64.0D), v -> true);

		for (VillagerEntity villager : villagers) {
			if (random.nextInt(3) != 0) {
				continue;
			}

			BlockPos pos = villager.getBlockPos();
			villager.discard();
			MobEntity skinStealer = BtlEntities.SKIN_STEALER.create(world, SpawnReason.EVENT);

			if (skinStealer != null) {
				skinStealer.refreshPositionAndAngles(pos.getX() + 0.5D, pos.getY(), pos.getZ() + 0.5D, random.nextFloat() * 360.0F, 0.0F);
				world.spawnEntity(skinStealer);
			}

			world.spawnParticles(BtlParticles.BLEED_DRIP, pos.getX() + 0.5D, pos.getY() + 1.2D, pos.getZ() + 0.5D,
					12, 0.4D, 0.6D, 0.4D, 0.02D);
		}

		if (villagers.isEmpty()) {
			// Nothing to change here: the world does the next best thing.
			world.spawnEntity(new ItemEntity(world, centre.getX(), centre.getY() + 1.0D, centre.getZ(),
					new ItemStack(Items.EMERALD, 3 + random.nextInt(9))));
		}
	}

	private static void memoryBleed(ServerWorld world, Random random, BlockPos centre) {
		var memories = BtlState.get().memories();

		if (memories.isEmpty()) {
			statueField(world, random, centre);
			return;
		}

		var memory = memories.get(random.nextInt(memories.size()));
		LastChunkEngine.replayMemoryStep(world, memory, random.nextInt(Math.max(1, memory.sizeY())));
	}

	private static void statueField(ServerWorld world, Random random, BlockPos centre) {
		BlockPos ground = world.getTopPosition(Heightmap.Type.MOTION_BLOCKING, centre);

		for (int x = -14; x <= 14; x += 4) {
			for (int z = -14; z <= 14; z += 4) {
				if (random.nextInt(5) == 0) {
					continue;
				}

				BlockPos pos = world.getTopPosition(Heightmap.Type.MOTION_BLOCKING, ground.add(x, 0, z));
				world.setBlockState(pos, BtlBlocks.ANCIENT_STATUE.getDefaultState(), Block.NOTIFY_ALL);
			}
		}
	}

	private static void mirrorNight(ServerWorld world, Random random, BlockPos centre) {
		int placed = 0;

		for (int i = 0; i < 60 && placed < 24; i++) {
			BlockPos pos = world.getTopPosition(Heightmap.Type.MOTION_BLOCKING, centre.add(random.nextInt(48) - 24, 0, random.nextInt(48) - 24));

			if (world.getBlockState(pos).isOf(BtlBlocks.MIRROR_BLOCK)) {
				continue;
			}

			world.setBlockState(pos, BtlBlocks.MIRROR_BLOCK.getDefaultState(), Block.NOTIFY_ALL);
			placed++;
		}

		ACTIVE.add(new ActiveMutation(MIRROR_NIGHT, centre, 20 * 60 * 3));
	}

	private static void whiteMaze(ServerWorld world, Random random, BlockPos centre) {
		BlockPos ground = world.getTopPosition(Heightmap.Type.MOTION_BLOCKING, centre);
		BlockState wall = Blocks.WHITE_CONCRETE.getDefaultState();

		for (int i = 0; i < 40; i++) {
			int x = random.nextInt(60) - 30;
			int z = random.nextInt(60) - 30;
			int length = 6 + random.nextInt(18);
			boolean alongX = random.nextBoolean();

			for (int step = 0; step < length; step++) {
				int wx = alongX ? x + step : x;
				int wz = alongX ? z : z + step;

				for (int y = 0; y < 3; y++) {
					world.setBlockState(ground.add(wx, y, wz), wall, Block.NOTIFY_LISTENERS);
				}
			}
		}
	}

	private static void riftSwarm(ServerWorld world, Random random, BlockPos centre) {
		for (int i = 0; i < 4; i++) {
			BlockPos site = centre.add(random.nextInt(40) - 20, 4 + random.nextInt(8), random.nextInt(40) - 20);
			RiftEngine.spawnRiftAt(world, site, RiftEngine.rollVariant(random), true);
		}

		world.playSound(null, centre, BtlSounds.RIFT_OPEN, SoundCategory.AMBIENT, 2.0F, 0.5F);
	}
}
