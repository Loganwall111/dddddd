package com.beyondthelimits.core.engine;

import com.beyondthelimits.core.BtlConfig;
import com.beyondthelimits.core.BtlState;
import com.beyondthelimits.registry.BtlBlocks;
import com.beyondthelimits.registry.BtlEntities;
import com.beyondthelimits.registry.BtlParticles;
import com.beyondthelimits.registry.BtlSounds;
import com.beyondthelimits.util.BtlSafe;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import net.minecraft.block.Block;
import net.minecraft.block.Blocks;
import net.minecraft.entity.SpawnReason;
import net.minecraft.entity.mob.MobEntity;
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
 * The Impossible Biome.
 *
 * <p>Everything about it breaks a rule the player has internalised. Trees are a hundred blocks tall and
 * made of black wood with white leaves. Rivers float. Insects are the size of houses. Grass is black
 * and does not care whether it is in daylight. Gravity points at whatever it likes, so there are
 * boulders hanging in the air and there are places where a dropped item goes up.</p>
 *
 * <p>The biome watches. Break too much of it and it grows; ignore it and it spreads slowly; run away
 * and it follows the player — not the terrain, the <em>idea</em> of the terrain, stamped into whatever
 * ground is nearby. It is the one anomaly in Chapter One that is explicitly hostile to being
 * catalogued.</p>
 */
public final class ImpossibleEngine {
	private ImpossibleEngine() {
	}

	private static final Map<UUID, BlockPos> ZONES = new HashMap<>();

	public static void tick(MinecraftServer server, int ticks) {
		BtlState state = BtlState.get();

		for (ServerPlayerEntity player : server.getPlayerManager().getPlayerList()) {
			BtlSafe.guard("impossible.player", () -> tickPlayer(state, player, ticks));
		}
	}

	private static void tickPlayer(BtlState state, ServerPlayerEntity player, int ticks) {
		ServerWorld world = player.getServerWorld();
		BlockPos zone = ZONES.get(player.getUuid());

		if (zone == null) {
			if (ticks % 600 != 0 || world.getRandom().nextInt(3) != 0) {
				return;
			}

			zone = player.getBlockPos().add(world.getRandom().nextInt(120) - 60, 0, world.getRandom().nextInt(120) - 60);
			ZONES.put(player.getUuid(), zone);
			state.anomalies().put(zone.asLong(), 1);
			grow(world, zone, 1);
			player.sendMessage(Text.translatable("message.beyondthelimits.impossible.found").formatted(Formatting.DARK_GREEN), false);
			return;
		}

		// It hangs around the player without ever quite being where they are.
		double distance = Math.sqrt(player.squaredDistanceTo(zone.getX(), zone.getY(), zone.getZ()));

		if (distance > 220.0D) {
			ZONES.put(player.getUuid(), player.getBlockPos());
			return;
		}

		if (ticks % 200 == 0) {
			world.spawnParticles(BtlParticles.FOG_MOTE, zone.getX() + 0.5D, zone.getY() + 12.0D, zone.getZ() + 0.5D,
					10, 24.0D, 14.0D, 24.0D, 0.01D);
			world.playSound(null, zone, BtlSounds.CORRUPTION_WHISPER, SoundCategory.AMBIENT, 0.5F, 0.35F);
		}

		if (ticks % 1200 == 0) {
			grow(world, zone, 1 + world.getRandom().nextInt(2));
		}
	}

	/** Stamps one more piece of the impossible biome onto ordinary ground. */
	private static void grow(ServerWorld world, BlockPos centre, int amount) {
		Random random = Random.create(centre.asLong() + world.getTime() / 20L);
		BlockPos ground = world.getTopPosition(Heightmap.Type.MOTION_BLOCKING, centre);

		for (int i = 0; i < amount; i++) {
			switch (random.nextInt(6)) {
				case 0, 1 -> giantTree(world, random, ground);
				case 2 -> floatingRiver(world, random, ground);
				case 3 -> blackGrass(world, random, ground);
				case 4 -> gravityAnomaly(world, random, ground);
				default -> insects(world, random, ground);
			}
		}
	}

	/** A hundred blocks of black wood with white leaves, and roots that go down further. */
	private static void giantTree(ServerWorld world, Random random, BlockPos ground) {
		int height = 80 + random.nextInt(40);
		int x = ground.getX() + random.nextInt(24) - 12;
		int z = ground.getZ() + random.nextInt(24) - 12;
		BlockPos base = world.getTopPosition(Heightmap.Type.MOTION_BLOCKING, new BlockPos(x, ground.getY(), z));
		int trunk = 5 + random.nextInt(3);

		for (int y = -12; y < height; y++) {
			for (int dx = -trunk / 2; dx <= trunk / 2; dx++) {
				for (int dz = -trunk / 2; dz <= trunk / 2; dz++) {
					if (y < 0 && !world.getBlockState(base.add(dx, y, dz)).isAir()) {
						continue;
					}

					world.setBlockState(base.add(dx, y, dz), BtlBlocks.IMPOSSIBLE_LOG.getDefaultState(), Block.NOTIFY_LISTENERS);
				}
			}
		}

		// Canopy: white leaves on the last fifth of the trunk.
		for (int y = (int) (height * 0.78D); y < height + 8; y++) {
			int radius = Math.max(2, (int) ((height + 8 - y) * 0.8D));

			for (int dx = -radius; dx <= radius; dx++) {
				for (int dz = -radius; dz <= radius; dz++) {
					if (dx * dx + dz * dz > radius * radius) {
						continue;
					}

					world.setBlockState(base.add(dx, y, dz), BtlBlocks.IMPOSSIBLE_LEAVES.getDefaultState(), Block.NOTIFY_LISTENERS);
				}
			}
		}
	}

	/** A river, in the air, with banks of black grass. */
	private static void floatingRiver(ServerWorld world, Random random, BlockPos ground) {
		int y = ground.getY() + 30 + random.nextInt(30);
		int length = 40 + random.nextInt(60);
		boolean alongX = random.nextBoolean();

		for (int i = -length / 2; i < length / 2; i++) {
			for (int w = -3; w <= 3; w++) {
				int x = alongX ? ground.getX() + i : ground.getX() + w;
				int z = alongX ? ground.getZ() + w : ground.getZ() + i;
				BlockPos pos = new BlockPos(x, y, z);

				world.setBlockState(pos, Math.abs(w) <= 2 ? Blocks.WATER.getDefaultState()
						: BtlBlocks.IMPOSSIBLE_GRASS.getDefaultState(), Block.NOTIFY_LISTENERS);
				world.setBlockState(pos.down(), BtlBlocks.IMPOSSIBLE_GRASS.getDefaultState(), Block.NOTIFY_LISTENERS);
			}
		}
	}

	private static void blackGrass(ServerWorld world, Random random, BlockPos ground) {
		for (int x = -16; x <= 16; x++) {
			for (int z = -16; z <= 16; z++) {
				BlockPos surface = world.getTopPosition(Heightmap.Type.MOTION_BLOCKING, ground.add(x, 0, z));

				if (!world.getBlockState(surface).isAir() && random.nextInt(3) != 0) {
					world.setBlockState(surface, BtlBlocks.IMPOSSIBLE_GRASS.getDefaultState(), Block.NOTIFY_ALL);
				}
			}
		}
	}

	/** Places a gravity core and flips a boulder upside down above it. */
	private static void gravityAnomaly(ServerWorld world, Random random, BlockPos ground) {
		BlockPos pos = world.getTopPosition(Heightmap.Type.MOTION_BLOCKING, ground.add(random.nextInt(24) - 12, 0, random.nextInt(24) - 12));
		world.setBlockState(pos, BtlBlocks.GRAVITY_CORE.getDefaultState(), Block.NOTIFY_ALL);

		for (int i = 1; i <= 6; i++) {
			world.setBlockState(pos.up(i), random.nextInt(4) == 0 ? Blocks.STONE.getDefaultState() : Blocks.AIR.getDefaultState(),
					Block.NOTIFY_LISTENERS);
		}

		world.setBlockState(pos.up(7), Blocks.MOSS_BLOCK.getDefaultState(), Block.NOTIFY_ALL);
	}

	private static void insects(ServerWorld world, Random random, BlockPos ground) {
		for (int i = 0; i < 2 + random.nextInt(5); i++) {
			MobEntity insect = BtlEntities.GIANT_INSECT.create(world);

			if (insect == null) {
				continue;
			}

			BlockPos pos = world.getTopPosition(Heightmap.Type.MOTION_BLOCKING,
					ground.add(random.nextInt(40) - 20, 0, random.nextInt(40) - 20));
			insect.refreshPositionAndAngles(pos.getX() + 0.5D, pos.getY(), pos.getZ() + 0.5D, random.nextFloat() * 360.0F, 0.0F);
			insect.setPersistent();
			world.spawnEntity(insect);
		}
	}

	/** The biome reacts to being mined: breaking it makes it bolder. */
	public static void onPlayerBlockBroken(ServerPlayerEntity player, BlockPos pos) {
		BtlSafe.guard("impossible.react", () -> {
			ServerWorld world = player.getServerWorld();
			var broken = world.getBlockState(pos);

			if (!broken.isOf(BtlBlocks.IMPOSSIBLE_GRASS) && !broken.isOf(BtlBlocks.IMPOSSIBLE_LOG)
					&& !broken.isOf(BtlBlocks.IMPOSSIBLE_LEAVES)) {
				return;
			}

			if (world.getRandom().nextInt(6) != 0) {
				return;
			}

			BlockPos zone = ZONES.getOrDefault(player.getUuid(), pos);
			grow(world, zone, 2);
			player.sendMessage(Text.translatable("message.beyondthelimits.impossible.noticed").formatted(Formatting.DARK_GREEN), true);

			// Something the size of a building takes offence.
			MobEntity insect = BtlEntities.GIANT_INSECT.create(world);

			if (insect != null) {
				insect.refreshPositionAndAngles(pos.getX() + 0.5D, pos.getY() + 1.0D, pos.getZ() + 0.5D,
						world.getRandom().nextFloat() * 360.0F, 0.0F);

				if (insect instanceof net.minecraft.entity.mob.HostileEntity hostile) {
					hostile.setTarget(player);
				}

				world.spawnEntity(insect);
			}
		});
	}

	public static boolean isImpossibleBlock(ServerWorld world, BlockPos pos) {
		var state = world.getBlockState(pos);
		return state.isOf(BtlBlocks.IMPOSSIBLE_GRASS) || state.isOf(BtlBlocks.IMPOSSIBLE_LOG)
				|| state.isOf(BtlBlocks.IMPOSSIBLE_LEAVES);
	}

	/** Gravity in the biome: near a gravity core, things fall up. Used by the core block itself. */
	public static boolean invertedGravityAt(ServerWorld world, BlockPos pos) {
		return world.getBlockState(pos).isOf(BtlBlocks.GRAVITY_CORE);
	}
}
