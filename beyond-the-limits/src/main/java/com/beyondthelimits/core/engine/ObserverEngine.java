package com.beyondthelimits.core.engine;

import com.beyondthelimits.core.BtlConfig;
import com.beyondthelimits.core.BtlState;
import com.beyondthelimits.entity.ObserverEntity;
import com.beyondthelimits.network.BtlNetworking;
import com.beyondthelimits.registry.BtlEntities;
import com.beyondthelimits.registry.BtlParticles;
import com.beyondthelimits.registry.BtlSounds;
import com.beyondthelimits.util.BtlSafe;
import java.util.Map;
import java.util.UUID;
import net.minecraft.block.Blocks;
import net.minecraft.entity.SpawnReason;
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
 * The Observer.
 *
 * <p>Harassment in the forensic sense: it is always just far enough away that you cannot be sure it
 * was there, it disappears the instant you look directly at it, and it never does anything. The
 * engine's job is to make that feel like an escalating campaign rather than a random spawn — the
 * observer's "level" for each player rises the more often they notice it, and at each level it moves
 * closer, stays longer, and starts appearing in the two places a person is supposed to be safe: their
 * bed and their reflection.</p>
 */
public final class ObserverEngine {
	private ObserverEngine() {
	}

	/** Time in ticks a player may go without seeing an observer before it resets to zero. */
	private static final int FORGET_TICKS = 20 * 60 * 5;

	public static void tick(MinecraftServer server, int ticks) {
		BtlState state = BtlState.get();

		for (ServerPlayerEntity player : server.getPlayerManager().getPlayerList()) {
			BtlSafe.guard("observer.player", () -> tickPlayer(server, state, player, ticks));
		}
	}

	private static void tickPlayer(MinecraftServer server, BtlState state, ServerPlayerEntity player, int ticks) {
		ServerWorld world = player.getServerWorld();
		Map<UUID, Integer> levels = state.observerLevels();
		int level = levels.getOrDefault(player.getUuid(), 0);

		// At zero sightings the observer loses interest — but it never forgets the player entirely.
		Long lastActive = state.lastVision().get(player.getUuid());

		if (lastActive != null && ticks - lastActive > FORGET_TICKS && level > 0) {
			levels.put(player.getUuid(), Math.max(0, level - 1));
			state.lastVision().put(player.getUuid(), (long) ticks);
		}

		if (state.reality() > 85 && level == 0) {
			return;
		}

		int chance = BtlConfig.OBSERVER_SPAWN_CHANCE + level * 4;

		if (world.getRandom().nextInt(1000) >= chance) {
			return;
		}

		spawnObserver(state, world, player, level);
	}

	private static void spawnObserver(BtlState state, ServerWorld world, ServerPlayerEntity player, int level) {
		ObserverEntity observer = BtlEntities.OBSERVER.create(world);

		if (observer == null) {
			return;
		}

		Random random = world.getRandom();

		// Tier 3 and above: it starts appearing where the player sleeps instead of in the treeline.
		boolean inBase = level >= 3 && random.nextInt(3) == 0;
		double distance;
		BlockPos surface;

		if (inBase) {
			BlockPos bed = findBed(world, player.getBlockPos());

			if (bed != null) {
				observer.refreshPositionAndAngles(bed.getX() + 0.5D, bed.getY() + 1.0D, bed.getZ() + 0.5D,
						player.getYaw() + 180.0F, 0.0F);
				world.spawnEntity(observer);
				observer.setPersistent();
				world.playSound(null, bed, BtlSounds.OBSERVER_WHISPER, SoundCategory.AMBIENT, 0.4F, 1.0F);
				player.sendMessage(Text.translatable("message.beyondthelimits.observer.base").formatted(Formatting.DARK_PURPLE), false);
				return;
			}
		}

		distance = BtlConfig.OBSERVER_MIN_DISTANCE + random.nextInt(Math.max(1,
				BtlConfig.OBSERVER_MAX_DISTANCE - BtlConfig.OBSERVER_MIN_DISTANCE) - Math.min(level * 4, 28));
		double angle = random.nextDouble() * Math.PI * 2.0D;

		// Prefer behind the player: it should feel like something they walked past.
		if (random.nextBoolean()) {
			angle = Math.toRadians(player.getYaw() + 180.0D) + (random.nextDouble() - 0.5D);
		}

		double x = player.getX() + Math.cos(angle) * distance;
		double z = player.getZ() + Math.sin(angle) * distance;
		surface = world.getTopPosition(Heightmap.Type.MOTION_BLOCKING, BlockPos.ofFloored(x, player.getY(), z));

		observer.refreshPositionAndAngles(surface.getX() + 0.5D, surface.getY(), surface.getZ() + 0.5D,
				(float) Math.toDegrees(Math.atan2(player.getZ() - surface.getZ(), player.getX() - surface.getX())) - 90.0F, 0.0F);
		world.spawnEntity(observer);
		observer.setPersistent();
		state.lastVision().put(player.getUuid(), (long) world.getServer().getTicks());
	}

	/** Called by {@link ObserverEntity} when a player catches it looking. */
	public static void onObserved(ServerPlayerEntity player, ObserverEntity observer) {
		BtlSafe.guard("observer.observed", () -> {
			BtlState state = BtlState.get();
			Map<UUID, Integer> levels = state.observerLevels();
			int level = levels.getOrDefault(player.getUuid(), 0);
			levels.put(player.getUuid(), level + 1);
			state.lastVision().put(player.getUuid(), (long) player.getServer().getTicks());

			ServerWorld world = player.getServerWorld();
			world.spawnParticles(BtlParticles.REALITY_DUST, observer.getX(), observer.getY() + 1.0D, observer.getZ(),
					24, 0.5D, 1.0D, 0.5D, 0.02D);
			player.playSoundToPlayer(BtlSounds.OBSERVER_WHISPER, SoundCategory.AMBIENT, 0.9F, 1.0F);
			BtlNetworking.sendScreenEffect(player, BtlNetworking.EFFECT_OBSERVER, 0.6F, 40);

			if (level + 1 == 3) {
				player.sendMessage(Text.translatable("message.beyondthelimits.observer.three").formatted(Formatting.DARK_PURPLE), false);
			} else if (level + 1 == 7) {
				player.sendMessage(Text.translatable("message.beyondthelimits.observer.seven").formatted(Formatting.DARK_RED), false);
				state.addReality(-2);
			}
		});
	}

	/** The number of times this player has caught the observer; displayed by the gauge. */
	public static int level(BtlState state, ServerPlayerEntity player) {
		return state.observerLevels().getOrDefault(player.getUuid(), 0);
	}

	private static BlockPos findBed(ServerWorld world, BlockPos centre) {
		for (BlockPos pos : BlockPos.iterate(centre.add(-12, -4, -12), centre.add(12, 4, 12))) {
			var state = world.getBlockState(pos);

			if (state.isOf(Blocks.RED_BED) || state.isOf(Blocks.WHITE_BED) || state.isOf(Blocks.BLACK_BED)
					|| state.isOf(Blocks.BLUE_BED) || state.isOf(Blocks.BROWN_BED)) {
				return pos;
			}
		}

		return null;
	}
}
