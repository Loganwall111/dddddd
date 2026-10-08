package com.beyondthelimits.core.engine;

import com.beyondthelimits.BeyondTheLimits;
import com.beyondthelimits.block.CorruptedGrassBlock;
import com.beyondthelimits.core.BtlConfig;
import com.beyondthelimits.core.BtlState;
import com.beyondthelimits.entity.FacelingEntity;
import com.beyondthelimits.entity.RiftEntity;
import com.beyondthelimits.network.BtlNetworking;
import com.beyondthelimits.registry.BtlBlocks;
import com.beyondthelimits.registry.BtlDimensions;
import com.beyondthelimits.registry.BtlEntities;
import com.beyondthelimits.registry.BtlSounds;
import com.beyondthelimits.util.BtlSafe;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import net.minecraft.block.Block;
import net.minecraft.block.BlockState;
import net.minecraft.block.Blocks;
import net.minecraft.entity.Entity;
import net.minecraft.entity.LivingEntity;
import net.minecraft.entity.SpawnReason;
import net.minecraft.entity.mob.MobEntity;
import net.minecraft.entity.player.PlayerEntity;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.network.ServerPlayerEntity;
import net.minecraft.server.world.ServerWorld;
import net.minecraft.sound.SoundCategory;
import net.minecraft.text.Text;
import net.minecraft.util.math.BlockPos;
import net.minecraft.util.math.Box;
import net.minecraft.util.math.MathHelper;
import net.minecraft.util.math.random.Random;
import net.minecraft.world.Heightmap;
import net.minecraft.world.World;

/**
 * The Backrooms.
 *
 * <p>An endless, procedurally generated complex that generates itself lazily around whoever is
 * inside it: 48-block "cells" of yellow rooms, strange stairs, pool rooms, endless stores, glitch
 * zones and — rarely — an enormous impossible city built out of the same wallpaper, right down to
 * the streets.</p>
 *
 * <p>There are exactly three ways in, as designed:</p>
 * <ol>
 *     <li>the {@linkplain #registerGate see-through rift} in the Abandoned Warehouse at the centre
 *     of the Old City (found through the guidebook);</li>
 *     <li>{@linkplain #enterViaCorruptedGrass falling through corrupted ground} once dementia has
 *     taken hold;</li>
 *     <li>{@linkplain #enterViaTeleportCommand the {@code /teleport backrooms} command}, the sole
 *     command-based route.</li>
 * </ol>
 */
public final class BackroomsEngine {
	private BackroomsEngine() {
	}

	/** Cells already generated this session, keyed by {@code (cellX,cellZ)} packed into a long. */
	private static final Map<Long, Long> GENERATED = new HashMap<>();
	private static final Map<UUID, Integer> CHASE_TIMERS = new HashMap<>();

	private static final int CELL = 48;
	private static final int FLOOR_Y = 64;
	private static final int HEIGHT = 7;

	public static void tick(MinecraftServer server, int ticks) {
		ServerWorld backrooms = server.getWorld(BtlDimensions.BACKROOMS);

		if (backrooms == null) {
			return;
		}

		// Generate the cells around everyone currently inside.
		for (ServerPlayerEntity player : server.getPlayerManager().getPlayerList()) {
			if (player.getServerWorld() != backrooms) {
				continue;
			}

			int cellX = Math.floorDiv(player.getBlockX(), CELL);
			int cellZ = Math.floorDiv(player.getBlockZ(), CELL);

			for (int dx = -1; dx <= 1; dx++) {
				for (int dz = -1; dz <= 1; dz++) {
					generateCell(backrooms, cellX + dx, cellZ + dz);
				}
			}

			if (ticks % 60 == 0) {
				ambientHorror(backrooms, player);
			}
		}

		// Chases expire; if the player survives, the pursuer loses interest and the Backrooms
		// reward them with a way out.
		CHASE_TIMERS.entrySet().removeIf(entry -> {
			ServerPlayerEntity player = server.getPlayerManager().getPlayer(entry.getKey());

			if (player == null || player.getServerWorld() != backrooms) {
				return true;
			}

			int remaining = entry.getValue() - 1;

			if (remaining <= 0) {
				player.sendMessage(Text.translatable("message.beyondthelimits.backrooms.escaped"), false);
				extract(player);
				return true;
			}

			entry.setValue(remaining);
			return false;
		});
	}

	// -------------------------------------------------------------------------------------------
	// Entrances
	// -------------------------------------------------------------------------------------------

	/** Entrance 1: the warehouse gate. Called by the city generator once the warehouse exists. */
	public static void registerGate(ServerWorld world, BlockPos pos) {
		BtlSafe.guard("backrooms.register_gate", () -> {
			RiftEntity gate = BtlEntities.RIFT.create(world);

			if (gate == null) {
				return;
			}

			gate.refreshPositionAndAngles(pos.getX() + 0.5D, pos.getY() + 2.0D, pos.getZ() + 0.5D, 0.0F, 0.0F);
			gate.setVariant(RiftEntity.VARIANT_BACKROOMS);
			gate.setMode(RiftEntity.MODE_SEAMLESS);
			gate.setPermanent(true);
			gate.setRadius(7.0F);
			world.spawnEntity(gate);
		});
	}

	/** Entrance 2: corruption plus dementia. */
	public static void enterViaCorruptedGrass(ServerPlayerEntity player) {
		BtlSafe.guard("backrooms.enter_corruption", () -> {
			ServerWorld backrooms = player.getServer().getWorld(BtlDimensions.BACKROOMS);

			if (backrooms == null) {
				return;
			}

			player.sendMessage(Text.translatable("message.beyondthelimits.backrooms.fall"), false);
			BtlNetworking.sendScreenEffect(player, BtlNetworking.EFFECT_FLASH, 0.8F, 30);
			BtlNetworking.sendScreenEffect(player, BtlNetworking.EFFECT_NOCLIP, 0.6F, 40);
			backrooms.playSound(null, BlockPos.ofFloored(player.getX(), FLOOR_Y, player.getZ()),
					BtlSounds.NOCLIP_WHOOSH, SoundCategory.AMBIENT, 1.0F, 0.5F);
			dropIn(backrooms, player);
			beginChase(player, 20 * 60);
		});
	}

	/** Entrance 3: the single command-based route, {@code /teleport backrooms}. */
	public static void enterViaTeleportCommand(ServerPlayerEntity player) {
		BtlSafe.guard("backrooms.enter_command", () -> {
			ServerWorld backrooms = player.getServer().getWorld(BtlDimensions.BACKROOMS);

			if (backrooms == null) {
				return;
			}

			BtlNetworking.sendScreenEffect(player, BtlNetworking.EFFECT_RIFT_WASH, 0.9F, 40);
			dropIn(backrooms, player);
		});
	}

	private static void dropIn(ServerWorld backrooms, ServerPlayerEntity player) {
		long seed = BtlState.get().riftSeed();
		Random random = Random.create(seed ^ 0x5EEDL);
		int x = random.nextInt(4096) - 2048;
		int z = random.nextInt(4096) - 2048;
		int cellX = Math.floorDiv(x, CELL);
		int cellZ = Math.floorDiv(z, CELL);

		generateCell(backrooms, cellX, cellZ);
		generateCell(backrooms, cellX + 1, cellZ);
		generateCell(backrooms, cellX, cellZ + 1);
		generateCell(backrooms, cellX - 1, cellZ);
		generateCell(backrooms, cellX, cellZ - 1);

		double spawnX = cellX * CELL + CELL / 2.0D + 0.5D;
		double spawnZ = cellZ * CELL + CELL / 2.0D + 0.5D;
		player.teleport(backrooms, spawnX, FLOOR_Y + 1, spawnZ, player.getYaw(), player.getPitch());
		BtlNetworking.sendRealitySync(player);
	}

	/** The canonical way home: a tear that only exists for a survivor. */
	public static void extract(ServerPlayerEntity player) {
		ServerWorld overworld = player.getServer().getOverworld();

		if (overworld == null) {
			return;
		}

		BtlNetworking.sendScreenEffect(player, BtlNetworking.EFFECT_RIFT_WASH, 1.0F, 40);
		BlockPos home = overworld.getTopPosition(Heightmap.Type.MOTION_BLOCKING, player.getBlockPos());
		player.teleport(overworld, home.getX() + 0.5D, home.getY() + 1.0D, home.getZ() + 0.5D,
				player.getYaw(), player.getPitch());
		overworld.playSound(null, home, BtlSounds.RIFT_OPEN, SoundCategory.AMBIENT, 1.0F, 0.6F);
	}

	// -------------------------------------------------------------------------------------------
	// Cell generation
	// -------------------------------------------------------------------------------------------

	private static void generateCell(ServerWorld world, int cellX, int cellZ) {
		long key = (((long) cellX) << 32) ^ (cellZ & 0xFFFFFFFFL);

		if (GENERATED.containsKey(key)) {
			return;
		}

		GENERATED.put(key, System.currentTimeMillis());
		BtlSafe.guard("backrooms.cell", () -> buildCell(world, cellX, cellZ, key));
	}

	private static void buildCell(ServerWorld world, int cellX, int cellZ, long key) {
		Random random = Random.create(key * 31L + 7L);
		int baseX = cellX * CELL;
		int baseZ = cellZ * CELL;
		int kind = random.nextInt(100);

		BlockState wall = BtlBlocks.BACKROOMS_WALL.getDefaultState();
		BlockState carpet = BtlBlocks.BACKROOMS_CARPET.getDefaultState();
		BlockState ceiling = BtlBlocks.BACKROOMS_CEILING.getDefaultState();
		BlockState light = BtlBlocks.BACKROOMS_LIGHT.getDefaultState();

		// Floor + ceiling + perimeter.
		for (int x = 0; x < CELL; x++) {
			for (int z = 0; z < CELL; z++) {
				world.setBlockState(new BlockPos(baseX + x, FLOOR_Y - 1, baseZ + z), carpet, Block.NOTIFY_LISTENERS);
				world.setBlockState(new BlockPos(baseX + x, FLOOR_Y + HEIGHT, baseZ + z), ceiling, Block.NOTIFY_LISTENERS);
			}
		}

		for (int y = 0; y < HEIGHT; y++) {
			for (int i = 0; i < CELL; i++) {
				world.setBlockState(new BlockPos(baseX + i, FLOOR_Y + y, baseZ), wall, Block.NOTIFY_LISTENERS);
				world.setBlockState(new BlockPos(baseX + i, FLOOR_Y + y, baseZ + CELL - 1), wall, Block.NOTIFY_LISTENERS);
				world.setBlockState(new BlockPos(baseX, FLOOR_Y + y, baseZ + i), wall, Block.NOTIFY_LISTENERS);
				world.setBlockState(new BlockPos(baseX + CELL - 1, FLOOR_Y + y, baseZ + i), wall, Block.NOTIFY_LISTENERS);
			}
		}

		// Doorways in the middle of each wall so the maze is actually connected.
		carve(world, baseX + CELL / 2, baseZ, baseZ, true);
		carve(world, baseX + CELL / 2, baseZ + CELL - 1, baseZ, true);
		carve(world, baseX, baseZ + CELL / 2, baseZ, false);
		carve(world, baseX + CELL - 1, baseZ + CELL / 2, baseZ, false);

		// Ceiling lights: a grid, always buzzing.
		for (int x = 6; x < CELL - 6; x += 12) {
			for (int z = 6; z < CELL - 6; z += 12) {
				world.setBlockState(new BlockPos(baseX + x, FLOOR_Y + HEIGHT - 1, baseZ + z), light, Block.NOTIFY_LISTENERS);
			}
		}

		if (kind < 45) {
			buildMaze(world, random, baseX, baseZ, wall);
		} else if (kind < 62) {
			buildPoolRoom(world, random, baseX, baseZ);
		} else if (kind < 76) {
			buildStore(world, random, baseX, baseZ, wall);
		} else if (kind < 86) {
			buildStairs(world, random, baseX, baseZ, wall);
		} else if (kind < 94) {
			buildGlitchZone(world, random, baseX, baseZ);
		} else {
			buildMiniCity(world, random, baseX, baseZ, wall);
		}

		populate(world, random, baseX, baseZ);
	}

	private static void carve(ServerWorld world, int x, int z, int baseZ, boolean alongX) {
		for (int y = 0; y < 3; y++) {
			world.setBlockState(new BlockPos(x, FLOOR_Y + y, z), Blocks.AIR.getDefaultState(), Block.NOTIFY_LISTENERS);
		}
	}

	private static void buildMaze(ServerWorld world, Random random, int baseX, int baseZ, BlockState wall) {
		for (int i = 0; i < 9; i++) {
			int x = 4 + random.nextInt(CELL - 10);
			int z = 4 + random.nextInt(CELL - 10);
			int length = 4 + random.nextInt(14);
			boolean alongX = random.nextBoolean();

			for (int step = 0; step < length; step++) {
				int wx = alongX ? x + step : x;
				int wz = alongX ? z : z + step;

				if (wx < 1 || wz < 1 || wx > CELL - 2 || wz > CELL - 2) {
					break;
				}

				for (int y = 0; y < 3; y++) {
					world.setBlockState(new BlockPos(baseX + wx, FLOOR_Y + y, baseZ + wz), wall, Block.NOTIFY_LISTENERS);
				}
			}
		}
	}

	private static void buildPoolRoom(ServerWorld world, Random random, int baseX, int baseZ) {
		int y = FLOOR_Y - 2;

		for (int x = 10; x < CELL - 10; x++) {
			for (int z = 10; z < CELL - 10; z++) {
				world.setBlockState(new BlockPos(baseX + x, y, baseZ + z), BtlBlocks.POOL_TILE.getDefaultState(), Block.NOTIFY_LISTENERS);
				world.setBlockState(new BlockPos(baseX + x, y - 1, baseZ + z), Blocks.WATER.getDefaultState(), Block.NOTIFY_LISTENERS);

				if (random.nextInt(6) == 0) {
					world.setBlockState(new BlockPos(baseX + x, y - 2, baseZ + z), BtlBlocks.POOL_TILE_DARK.getDefaultState(), Block.NOTIFY_LISTENERS);
				}
			}
		}
	}

	private static void buildStore(ServerWorld world, Random random, int baseX, int baseZ, BlockState wall) {
		for (int x = 4; x < CELL - 4; x += 6) {
			for (int z = 4; z < CELL - 4; z++) {
				if (random.nextInt(5) == 0) {
					continue;
				}

				for (int y = 0; y < 3; y++) {
					world.setBlockState(new BlockPos(baseX + x, FLOOR_Y + y, baseZ + z), BtlBlocks.STORE_SHELF.getDefaultState(), Block.NOTIFY_LISTENERS);
				}
			}
		}
	}

	private static void buildStairs(ServerWorld world, Random random, int baseX, int baseZ, BlockState wall) {
		int x = CELL / 2 - 4;
		int z = CELL / 2 - 4;

		for (int step = 0; step < 18; step++) {
			int level = FLOOR_Y + step;

			for (int w = 0; w < 6; w++) {
				for (int d = 0; d < 3; d++) {
					world.setBlockState(new BlockPos(baseX + x + w, level, baseZ + z + step + d),
							BtlBlocks.BACKROOMS_CARPET.getDefaultState(), Block.NOTIFY_LISTENERS);
				}
			}
		}
	}

	private static void buildGlitchZone(ServerWorld world, Random random, int baseX, int baseZ) {
		for (int i = 0; i < 90; i++) {
			int x = 2 + random.nextInt(CELL - 4);
			int z = 2 + random.nextInt(CELL - 4);
			int y = FLOOR_Y + random.nextInt(HEIGHT);
			BlockState state = switch (random.nextInt(4)) {
				case 0 -> BtlBlocks.CODE_PANEL.getDefaultState();
				case 1 -> BtlBlocks.VOID_GLASS.getDefaultState();
				case 2 -> BtlBlocks.WAREHOUSE_CONCRETE.getDefaultState();
				default -> BtlBlocks.BACKROOMS_WALL.getDefaultState();
			};
			world.setBlockState(new BlockPos(baseX + x, y, baseZ + z), state, Block.NOTIFY_LISTENERS);
		}
	}

	/** The enormous city: Backrooms architecture at city scale, built out of the same wallpaper. */
	private static void buildMiniCity(ServerWorld world, Random random, int baseX, int baseZ, BlockState wall) {
		for (int tower = 0; tower < 5; tower++) {
			int x = 4 + random.nextInt(CELL - 16);
			int z = 4 + random.nextInt(CELL - 16);
			int height = 12 + random.nextInt(24);
			int width = 5 + random.nextInt(6);
			int depth = 5 + random.nextInt(6);

			for (int y = 0; y < height; y++) {
				for (int wx = 0; wx < width; wx++) {
					for (int wz = 0; wz < depth; wz++) {
						boolean edge = wx == 0 || wz == 0 || wx == width - 1 || wz == depth - 1;
						BlockState state = edge ? wall : (y % 6 == 3 && wx == 2 ? BtlBlocks.BACKROOMS_LIGHT.getDefaultState()
								: Blocks.AIR.getDefaultState());
						world.setBlockState(new BlockPos(baseX + x + wx, FLOOR_Y + y, baseZ + z + wz), state, Block.NOTIFY_LISTENERS);
					}
				}
			}
		}
	}

	private static void populate(ServerWorld world, Random random, int baseX, int baseZ) {
		int count = random.nextInt(3);

		for (int i = 0; i < count; i++) {
			var type = switch (random.nextInt(10)) {
				case 0, 1, 2 -> BtlEntities.HOUND;
				case 3, 4 -> BtlEntities.SMILER;
				case 5 -> BtlEntities.SKIN_STEALER;
				case 6 -> BtlEntities.PARTYGOER;
				case 7 -> BtlEntities.SMILER;
				default -> BtlEntities.FACELING;
			};

			MobEntity mob = type.create(world);

			if (mob == null) {
				continue;
			}

			mob.refreshPositionAndAngles(baseX + random.nextInt(CELL), FLOOR_Y + 1, baseZ + random.nextInt(CELL), 0.0F, 0.0F);
			world.spawnEntity(mob);
		}
	}

	// -------------------------------------------------------------------------------------------
	// Behaviour
	// -------------------------------------------------------------------------------------------

	private static void ambientHorror(ServerWorld world, ServerPlayerEntity player) {
		Random random = world.getRandom();
		player.playSoundToPlayer(BtlSounds.BACKROOMS_DRONE, SoundCategory.AMBIENT, 0.6F,
				0.8F + random.nextFloat() * 0.4F);

		if (random.nextInt(4) == 0) {
			// Something moves in a room the player is not looking at.
			double angle = random.nextDouble() * Math.PI * 2.0D;
			double distance = 12.0D + random.nextDouble() * 24.0D;
			BlockPos scare = BlockPos.ofFloored(player.getX() + Math.cos(angle) * distance,
					player.getY(), player.getZ() + Math.sin(angle) * distance);
			world.playSound(null, scare, BtlSounds.BACKROOMS_STEP, SoundCategory.HOSTILE, 0.8F, 1.0F);
		}
	}

	/** Called by Backrooms mobs when they start hunting a player. */
	public static void onChased(Entity target, LivingEntity chaser) {
		BtlSafe.guard("backrooms.on_chased", () -> {
			if (!(target instanceof ServerPlayerEntity player)) {
				return;
			}

			if (player.getServerWorld().getRegistryKey() != BtlDimensions.BACKROOMS) {
				return;
			}

			player.playSoundToPlayer(BtlSounds.BACKROOMS_CHASE, SoundCategory.HOSTILE, 1.0F, 1.0F);
			BtlNetworking.sendScreenEffect(player, BtlNetworking.EFFECT_RIFT_WASH, 0.5F, 30);
			CHASE_TIMERS.putIfAbsent(player.getUuid(), 20 * 45);
		});
	}

	/** The faceling moment: a room that was empty is not. */
	public static void facelingMoment(Entity entity) {
		BtlSafe.guard("backrooms.faceling", () -> {
			if (!(entity instanceof ServerPlayerEntity player)) {
				return;
			}

			if (player.getServerWorld().getRegistryKey() != BtlDimensions.BACKROOMS) {
				return;
			}

			ServerWorld world = player.getServerWorld();

			if (world.getRandom().nextInt(3) != 0) {
				return;
			}

			FacelingEntity faceling = BtlEntities.FACELING.create(world);

			if (faceling == null) {
				return;
			}

			double angle = Math.toRadians(player.getYaw() + 180.0D);
			double x = player.getX() - Math.sin(angle) * 6.0D;
			double z = player.getZ() + Math.cos(angle) * 6.0D;
			faceling.refreshPositionAndAngles(x, player.getY(), z, player.getYaw() + 180.0F, 0.0F);
			faceling.setAiDisabled(true);
			world.spawnEntity(faceling);
			world.playSound(null, player.getBlockPos(), BtlSounds.BACKROOMS_DRONE, SoundCategory.AMBIENT, 0.45F, 1.6F);
		});
	}

	public static void beginChase(ServerPlayerEntity player, int ticks) {
		CHASE_TIMERS.put(player.getUuid(), ticks);
	}

	public static boolean isChased(Entity entity) {
		return entity != null && CHASE_TIMERS.containsKey(entity.getUuid());
	}

	/** The Old City centre, derived from the world seed — every world's city is in a different place. */
	public static BlockPos cityCentre(long seed) {
		Random random = Random.create(seed ^ 0xC17E5L);
		int x = random.nextInt(6000) - 3000;
		int z = random.nextInt(6000) - 3000;
		return new BlockPos(MathHelper.floor(x), 0, MathHelper.floor(z));
	}

	/** Turns a city centre into the "actual" surface position, used by the guidebook. */
	public static BlockPos citySurface(ServerWorld overworld) {
		BlockPos centre = cityCentre(BtlState.get().riftSeed());
		return overworld.getTopPosition(Heightmap.Type.MOTION_BLOCKING, centre);
	}

	public static List<ServerPlayerEntity> everyoneInside(MinecraftServer server) {
		return server.getPlayerManager().getPlayerList().stream()
				.filter(player -> player.getServerWorld().getRegistryKey() == BtlDimensions.BACKROOMS)
				.toList();
	}

	public static String describe(PlayerEntity player) {
		if (player.getWorld().getRegistryKey() != BtlDimensions.BACKROOMS) {
			return BeyondTheLimits.MOD_ID;
		}

		BlockPos pos = player.getBlockPos();
		int level = 1;

		// Level numbering is deliberately unstable: the Backrooms do not have a floor plan.
		level += Math.floorMod(pos.getX() % 7 + pos.getZ() % 5, 5);
		return "Level " + level;
	}

	/** Used by corrupted grass to decide whether noclip should trigger. */
	public static boolean corruptionIsFatal(PlayerEntity player) {
		return BtlState.get().dementia(player.getUuid()) >= BtlConfig.DEMENTIA_FALL_THROUGH
				&& CorruptedGrassBlock.isStandingOnCorruption(player);
	}
}
