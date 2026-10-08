package com.beyondthelimits.core.engine;

import com.beyondthelimits.core.BtlConfig;
import com.beyondthelimits.core.BtlState;
import com.beyondthelimits.network.BtlNetworking;
import com.beyondthelimits.registry.BtlDimensions;
import com.beyondthelimits.registry.BtlSounds;
import com.beyondthelimits.registry.BtlStatusEffects;
import com.beyondthelimits.util.BtlSafe;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import net.minecraft.entity.LivingEntity;
import net.minecraft.entity.effect.StatusEffectInstance;
import net.minecraft.registry.RegistryKey;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.network.ServerPlayerEntity;
import net.minecraft.server.world.ServerWorld;
import net.minecraft.sound.SoundCategory;
import net.minecraft.text.Text;
import net.minecraft.world.World;

/**
 * Dimensional gravity, and the butterfly effect it pays for.
 *
 * <p>Every world except the Overworld is "heavier" than home. Mining, killing and simply existing in
 * another dimension accrues <em>debt</em>; debt is invisible while you are away, and it is spent the
 * moment you come back. Each {@link BtlConfig#GRAVITY_PER_MUTATION} points of debt buys one
 * {@linkplain MutationEngine mutation} applied to the Overworld around wherever you returned to.</p>
 *
 * <p>The design consequence is the point of the whole system: you cannot detach the far world from
 * this one. A mining trip into the Foglands is paid for by the village you come home to.</p>
 */
public final class GravityEngine {
	private GravityEngine() {
	}

	/** The dimension each player was in last time we looked, so returns can be detected. */
	private static final Map<UUID, RegistryKey<World>> LAST_DIMENSION = new HashMap<>();
	/** Debt accrued this session, pending conversion into mutations. */
	private static final Map<UUID, Integer> PENDING = new HashMap<>();

	public static void tick(MinecraftServer server, int ticks) {
		BtlState state = BtlState.get();
		boolean minuteElapsed = ticks % 1200 == 0;

		for (ServerPlayerEntity player : server.getPlayerManager().getPlayerList()) {
			BtlSafe.guard("gravity.player", () -> tickPlayer(state, player, minuteElapsed));
		}

		// The status effect is refreshed slowly rather than every tick: it exists to drive the
		// client-side HUD and shader weight, not to do damage.
		if (ticks % 100 == 0) {
			for (ServerPlayerEntity player : server.getPlayerManager().getPlayerList()) {
				int debt = state.gravity(player.getUuid());

				if (debt > 0) {
					int amplifier = Math.min(9, debt / Math.max(1, BtlConfig.GRAVITY_MAX / 10));
					player.addStatusEffect(new StatusEffectInstance(BtlStatusEffects.DIMENSIONAL_GRAVITY,
							320, amplifier, true, false), null);
				}
			}
		}
	}

	private static void tickPlayer(BtlState state, ServerPlayerEntity player, boolean minuteElapsed) {
		RegistryKey<World> current = player.getServerWorld().getRegistryKey();
		RegistryKey<World> previous = LAST_DIMENSION.put(player.getUuid(), current);

		if (previous != null && previous != current) {
			if (current == World.OVERWORLD) {
				onReturnedHome(state, player, previous);
			} else if (previous == World.OVERWORLD) {
				player.sendMessage(Text.translatable("message.beyondthelimits.gravity.left",
						dimensionName(current)).formatted(net.minecraft.util.Formatting.RED), false);
			}
		}

		if (current != World.OVERWORLD && minuteElapsed) {
			accrue(state, player);
		}
	}

	private static void accrue(BtlState state, ServerPlayerEntity player) {
		int debt = state.gravity(player.getUuid());
		state.setGravity(player.getUuid(), debt + BtlConfig.GRAVITY_PER_MINUTE_OFFWORLD);
		player.playSoundToPlayer(BtlSounds.SIGNAL_STATIC, SoundCategory.AMBIENT, 0.35F, 0.6F);
	}

	/** Called by the block-break hook every time a player breaks a block outside the Overworld. */
	public static void offworldBlockBroken(ServerPlayerEntity player) {
		BtlSafe.guard("gravity.block", () -> {
			BtlState state = BtlState.get();
			state.setGravity(player.getUuid(), state.gravity(player.getUuid()) + BtlConfig.GRAVITY_PER_BLOCK_BROKEN_OFFWORLD);
			addPending(player.getUuid(), BtlConfig.GRAVITY_PER_BLOCK_BROKEN_OFFWORLD);
		});
	}

	/** Called by the combat hook when a player kills something outside the Overworld. */
	public static void offworldKill(ServerPlayerEntity player, LivingEntity victim) {
		BtlSafe.guard("gravity.kill", () -> {
			BtlState state = BtlState.get();
			state.setGravity(player.getUuid(), state.gravity(player.getUuid()) + BtlConfig.GRAVITY_PER_KILL_OFFWORLD);
			addPending(player.getUuid(), BtlConfig.GRAVITY_PER_KILL_OFFWORLD);
			player.sendMessage(Text.translatable("message.beyondthelimits.gravity.debt",
					state.gravity(player.getUuid()), BtlConfig.GRAVITY_MAX).formatted(net.minecraft.util.Formatting.DARK_RED), true);
		});
	}

	private static void addPending(UUID uuid, int amount) {
		PENDING.merge(uuid, amount, Integer::sum);
	}

	/** The payoff: debt becomes mutations, applied around wherever the player came home to. */
	private static void onReturnedHome(BtlState state, ServerPlayerEntity player, RegistryKey<World> from) {
		MinecraftServer server = player.getServer();

		if (server == null) {
			return;
		}

		ServerWorld overworld = server.getOverworld();

		if (overworld == null) {
			return;
		}

		int debt = state.gravity(player.getUuid()) + PENDING.getOrDefault(player.getUuid(), 0);
		PENDING.put(player.getUuid(), 0);

		if (debt < BtlConfig.GRAVITY_PER_MUTATION) {
			return;
		}

		int mutations = Math.min(BtlConfig.GRAVITY_MUTATIONS_PER_RETURN, debt / BtlConfig.GRAVITY_PER_MUTATION);
		state.setGravity(player.getUuid(), Math.max(0, debt - mutations * BtlConfig.GRAVITY_PER_MUTATION));

		player.sendMessage(Text.translatable("message.beyondthelimits.gravity.returned", mutations,
				dimensionName(from)).formatted(net.minecraft.util.Formatting.DARK_PURPLE), false);
		BtlNetworking.sendScreenEffect(player, BtlNetworking.EFFECT_RIFT_WASH, 0.7F, 60);
		overworld.playSound(null, player.getBlockPos(), BtlSounds.REALITY_TEAR, SoundCategory.AMBIENT, 1.4F, 0.5F);

		for (int i = 0; i < mutations; i++) {
			MutationEngine.apply(overworld, player, MutationEngine.roll(overworld.getRandom()));
		}
	}

	/** Called by the dimensional gravity status effect, every second. */
	public static void tickEffect(ServerPlayerEntity player, int amplifier) {
		BtlSafe.guard("gravity.effect", () -> {
			ServerWorld world = player.getServerWorld();
			int debt = BtlState.get().gravity(player.getUuid());

			if (debt <= 0) {
				return;
			}

			// Heavy worlds: the player is slowed, sinks slightly faster, and hears the world groan.
			if (world.getRandom().nextInt(8) == 0) {
				player.playSoundToPlayer(BtlSounds.CORRUPTION_WHISPER, SoundCategory.AMBIENT, 0.4F, 0.4F + amplifier * 0.05F);
			}

			if (player.isOnGround() && debt > BtlConfig.GRAVITY_MAX / 3 && world.getRandom().nextInt(4) == 0) {
				player.addStatusEffect(new StatusEffectInstance(net.minecraft.entity.effect.StatusEffects.SLOWNESS,
						60, Math.min(2, amplifier / 3), true, false), null);
			}

			if (player.getVelocity().y < -1.2D && !player.isOnGround()) {
				player.setVelocity(player.getVelocity().x, player.getVelocity().y * 1.06D, player.getVelocity().z);
				player.velocityModified = true;
			}
		});
	}

	/** Human-readable summary used by the dimensional gauge and the HUD. */
	public static String describeNextMutation(BtlState state) {
		int debt = 0;

		for (int value : state.gravityMap().values()) {
			debt += value;
		}

		if (debt < BtlConfig.GRAVITY_PER_MUTATION) {
			return "the world is still holding (" + (BtlConfig.GRAVITY_PER_MUTATION - debt) + " more debt to trigger)";
		}

		return "queued mutations: " + Math.min(BtlConfig.GRAVITY_MUTATIONS_PER_RETURN, debt / BtlConfig.GRAVITY_PER_MUTATION)
				+ " - next: " + MutationEngine.describe(debt / BtlConfig.GRAVITY_PER_MUTATION);
	}

	public static String dimensionName(RegistryKey<World> key) {
		if (key == BtlDimensions.BACKROOMS) {
			return "the Backrooms";
		}

		if (key == BtlDimensions.FOGLANDS) {
			return "the Foglands";
		}

		if (key == BtlDimensions.CODESCAPE) {
			return "the Code Verse";
		}

		if (key == BtlDimensions.MIRRORWORLD) {
			return "the Mirror World";
		}

		if (key == BtlDimensions.SUBSTRATA) {
			return "the Substrata";
		}

		if (key == BtlDimensions.WRONGWORLD) {
			return "the Wrong Minecraft";
		}

		if (key == BtlDimensions.THE_IMPOSSIBLE) {
			return "the Impossible";
		}

		if (key == World.NETHER) {
			return "the Nether";
		}

		if (key == World.END) {
			return "the End";
		}

		return key.getValue().getPath();
	}
}
