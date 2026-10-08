package com.beyondthelimits.core.engine;

import com.beyondthelimits.core.BtlConfig;
import com.beyondthelimits.core.BtlState;
import com.beyondthelimits.network.BtlNetworking;
import com.beyondthelimits.registry.BtlBlocks;
import com.beyondthelimits.registry.BtlDimensions;
import com.beyondthelimits.registry.BtlEntities;
import com.beyondthelimits.registry.BtlItems;
import com.beyondthelimits.registry.BtlParticles;
import com.beyondthelimits.registry.BtlSounds;
import com.beyondthelimits.util.BtlSafe;
import net.minecraft.block.Block;
import net.minecraft.entity.SpawnReason;
import net.minecraft.item.ItemStack;
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
 * The Signal.
 *
 * <p>It starts as a sound the player cannot place — {@code [UNKNOWN TRANSMISSION]} on a receiver they
 * should not have found. It ends with a machine buried deep under the world, transmitting coordinates
 * that resolve, on inspection, to wherever the player is standing when they read them. The machine is
 * not pointing at a place. It is pointing at the player, and it has been for a while.</p>
 *
 * <p>The reveal is scripted in three beats: the receiver finds a bearing, the bearing leads to a
 * buried casing, and once the player has heard the signal enough times the machine transmits its final
 * instruction — a coordinate that opens onto the Code Verse.</p>
 */
public final class SignalEngine {
	private SignalEngine() {
	}

	/** Number of readings after which the machine gives up its last instruction. */
	private static final int REVEAL_THRESHOLD = 6;

	public static void onServerStarted(MinecraftServer server) {
		BtlSafe.guard("signal.start", () -> {
			BtlState state = BtlState.get();

			if (state.hasSignal()) {
				return;
			}

			ServerWorld overworld = server.getOverworld();

			if (overworld == null) {
				return;
			}

			Random random = Random.create(state.riftSeed() ^ 0x5164AL);
			double angle = random.nextDouble() * Math.PI * 2.0D;
			double distance = BtlConfig.SIGNAL_MIN_DISTANCE + random.nextInt(2000);
			int x = (int) Math.round(Math.cos(angle) * distance);
			int z = (int) Math.round(Math.sin(angle) * distance);
			int y = 24 + random.nextInt(20);
			BlockPos machine = new BlockPos(x, y, z);

			bury(overworld, machine);
			state.setSignal(x, y, z);
		});
	}

	/** Builds the buried casing: a machine inside a sealed stone shell, under real terrain. */
	private static void bury(ServerWorld world, BlockPos machine) {
		BlockPos surface = world.getTopPosition(Heightmap.Type.MOTION_BLOCKING, machine);

		for (int x = -2; x <= 2; x++) {
			for (int y = -2; y <= 2; y++) {
				for (int z = -2; z <= 2; z++) {
					BlockPos pos = machine.add(x, y, z);
					boolean shell = Math.abs(x) == 2 || Math.abs(y) == 2 || Math.abs(z) == 2;
					world.setBlockState(pos, shell ? BtlBlocks.SIGNAL_CASING.getDefaultState()
							: net.minecraft.block.Blocks.AIR.getDefaultState(), Block.NOTIFY_LISTENERS);
				}
			}
		}

		world.setBlockState(machine, BtlBlocks.SIGNAL_MACHINE.getDefaultState(), Block.NOTIFY_ALL);

		// A shaft of casing up to the surface, so a player who digs straight down finds it.
		for (int y = machine.getY(); y < surface.getY(); y++) {
			world.setBlockState(new BlockPos(machine.getX(), y, machine.getZ()),
					BtlBlocks.SIGNAL_CASING.getDefaultState(), Block.NOTIFY_LISTENERS);
		}

		world.setBlockState(new BlockPos(machine.getX(), surface.getY(), machine.getZ()),
				BtlBlocks.SIGNAL_CASING.getDefaultState(), Block.NOTIFY_ALL);
	}

	public static void tick(MinecraftServer server, int ticks) {
		BtlState state = BtlState.get();

		if (!state.hasSignal()) {
			return;
		}

		BlockPos machine = machinePos(state);

		for (ServerPlayerEntity player : server.getPlayerManager().getPlayerList()) {
			ServerWorld world = player.getServerWorld();
			double distance = Math.sqrt(player.squaredDistanceTo(machine.getX() + 0.5D, machine.getY() + 0.5D, machine.getZ() + 0.5D));

			// The carrier: audible to anyone holding a receiver, anywhere in the Overworld.
			if (ticks % 80 == 0 && hasReceiver(player) && world.getRegistryKey() == net.minecraft.world.World.OVERWORLD) {
				float volume = distance < 64.0D ? 1.0F : 0.35F;
				player.playSoundToPlayer(BtlSounds.SIGNAL_LOOP, SoundCategory.AMBIENT, volume, 1.0F);

				if (distance < 64.0D) {
					BtlNetworking.sendScreenEffect(player, BtlNetworking.EFFECT_EVOLUTION, 0.2F, 25);
				}
			}

			// Standing on top of it: the transmission resolves to the player's own position.
			if (distance < 12.0D) {
				onStandingOnMachine(server, state, player, world);
			}
		}

		// Machine ambience, even with nobody nearby.
		ServerWorld overworld = server.getOverworld();

		if (overworld != null && ticks % 40 == 0) {
			overworld.spawnParticles(BtlParticles.STATIC_NOISE, machine.getX() + 0.5D, machine.getY() + 1.2D,
					machine.getZ() + 0.5D, 6, 0.6D, 0.4D, 0.6D, 0.01D);
		}
	}

	private static void onStandingOnMachine(MinecraftServer server, BtlState state, ServerPlayerEntity player, ServerWorld world) {
		if (!state.hearSignal()) {
			return;
		}

		int heard = state.signalsHeard();
		int strength = Math.max(1, 15 - (int) player.getPos().distanceTo(machinePos(state).toCenterPos()) / 8);

		player.sendMessage(Text.literal("§7[UNKNOWN TRANSMISSION] §f" + "▮".repeat(strength) + "§7"
				+ "▯".repeat(Math.max(0, 15 - strength))), false);
		player.sendMessage(Text.translatable("message.beyondthelimits.signal.coordinates",
				(int) player.getX(), (int) player.getY(), (int) player.getZ()).formatted(Formatting.GREEN), false);

		if (heard == 2) {
			player.sendMessage(Text.translatable("message.beyondthelimits.signal.realisation").formatted(Formatting.GRAY), false);
		}

		if (heard >= REVEAL_THRESHOLD) {
			reveal(server, player);
		}

		world.spawnParticles(BtlParticles.CODE_GLYPH, player.getX(), player.getY() + 1.0D, player.getZ(),
				8, 0.6D, 0.6D, 0.6D, 0.02D);
		player.playSoundToPlayer(BtlSounds.SIGNAL_FOUND, SoundCategory.PLAYERS, 1.0F, 1.0F);
	}

	/** The machine's final transmission: a coordinate that is not a coordinate. */
	public static void reveal(MinecraftServer server, ServerPlayerEntity player) {
		BtlSafe.guard("signal.reveal", () -> {
			BtlState state = BtlState.get();
			state.setSignalRevealed();
			state.addReality(-BtlConfig.REALITY_PER_COLLISION_MILESTONE / 2);
			BtlNetworking.broadcastScreenEffect(server, BtlNetworking.EFFECT_NOCLIP, 0.8F, 40);
			player.sendMessage(Text.translatable("message.beyondthelimits.signal.revealed").formatted(Formatting.AQUA), false);
			player.giveItemStack(new ItemStack(BtlItems.CODE_KEY));

			ServerWorld world = player.getServerWorld();
			world.playSound(null, player.getBlockPos(), BtlSounds.CODESCAPE_GLITCH, SoundCategory.AMBIENT, 1.6F, 0.5F);

			// The Code Verse notices being noticed.
			for (int i = 0; i < 3; i++) {
				var wraith = BtlEntities.CODE_WRAITH.create(world);

				if (wraith != null) {
					wraith.refreshPositionAndAngles(player.getX() + world.getRandom().nextInt(8) - 4,
							player.getY(), player.getZ() + world.getRandom().nextInt(8) - 4,
							world.getRandom().nextFloat() * 360.0F, 0.0F);
					wraith.setPersistent();
					world.spawnEntity(wraith);
				}
			}
		});
	}

	/** Opens the way into the Code Verse from the machine. Used by the code key. */
	public static boolean openCodeVerse(ServerPlayerEntity player) {
		return BtlSafe.supply("signal.codeverse", () -> {
			ServerWorld world = player.getServer().getWorld(BtlDimensions.CODESCAPE);

			if (world == null) {
				return false;
			}

			BlockPos landing = world.getTopPosition(Heightmap.Type.MOTION_BLOCKING,
					BlockPos.ofFloored(player.getX(), 128, player.getZ()));
			BtlNetworking.sendScreenEffect(player, BtlNetworking.EFFECT_NOCLIP, 1.0F, 60);
			player.teleport(world, landing.getX() + 0.5D, landing.getY() + 1.0D, landing.getZ() + 0.5D,
					player.getYaw(), player.getPitch());
			return true;
		}, false);
	}

	public static BlockPos machinePos(BtlState state) {
		return new BlockPos(state.signalX(), state.signalY(), state.signalZ());
	}

	public static boolean hasReceiver(ServerPlayerEntity player) {
		return player.getInventory().contains(BtlItems.SIGNAL_RECEIVER.getDefaultStack());
	}

	public static double distanceToMachine(ServerPlayerEntity player) {
		BlockPos machine = machinePos(BtlState.get());
		return Math.sqrt(player.squaredDistanceTo(machine.getX() + 0.5D, machine.getY() + 0.5D, machine.getZ() + 0.5D));
	}
}
