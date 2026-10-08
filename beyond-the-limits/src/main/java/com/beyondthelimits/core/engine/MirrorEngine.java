package com.beyondthelimits.core.engine;

import com.beyondthelimits.core.BtlState;
import com.beyondthelimits.entity.MirrorDoubleEntity;
import com.beyondthelimits.network.BtlNetworking;
import com.beyondthelimits.registry.BtlBlocks;
import com.beyondthelimits.registry.BtlDimensions;
import com.beyondthelimits.registry.BtlEntities;
import com.beyondthelimits.registry.BtlParticles;
import com.beyondthelimits.registry.BtlSounds;
import com.beyondthelimits.util.BtlSafe;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import net.minecraft.block.Block;
import net.minecraft.entity.Entity;
import net.minecraft.entity.SpawnReason;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.network.ServerPlayerEntity;
import net.minecraft.server.world.ServerWorld;
import net.minecraft.sound.SoundCategory;
import net.minecraft.text.Text;
import net.minecraft.util.math.BlockPos;
import net.minecraft.util.math.Vec3d;
import net.minecraft.world.Heightmap;

/**
 * The mirror.
 *
 * <p>Two things are true about mirrors in Chapter One. First: study one and the reflection will
 * eventually move before you do — that is a {@link MirrorDoubleEntity}, and it is not a replay of
 * where you have been, it is a copy of where you were <em>about to</em> be. Second: mirrors are
 * doors. Hold a stare on a mirror block while a mirror tear is open and the world reflects: the
 * player is moved to the Mirror World at {@code (-x-1, -z-1)}, standing in the mirror image of the
 * exact spot they were looking from.</p>
 */
public final class MirrorEngine {
	private MirrorEngine() {
	}

	/** Player UUID -> consecutive seconds spent looking at a mirror. Not persisted: staring is live. */
	private static final Map<UUID, Integer> STARES = new HashMap<>();
	private static final int SECONDS_TO_PULL = 3;

	public static void tick(MinecraftServer server, int ticks) {
		if (ticks % 20 != 0) {
			return;
		}

		for (ServerPlayerEntity player : server.getPlayerManager().getPlayerList()) {
			BtlSafe.guard("mirror.player", () -> decay(player));
		}
	}

	private static void decay(ServerPlayerEntity player) {
		Integer stare = STARES.get(player.getUuid());

		if (stare != null && stare > 0) {
			STARES.put(player.getUuid(), stare - 1);
		}
	}

	/** Called by the mirror block when a player uses it: this is the "stare" input. */
	public static void gazeIntoMirror(ServerPlayerEntity player, ServerWorld world, BlockPos pos) {
		BtlSafe.guard("mirror.gaze", () -> {
			int stare = STARES.getOrDefault(player.getUuid(), 0) + 1;
			STARES.put(player.getUuid(), stare);

			world.spawnParticles(BtlParticles.MIRROR_MOTE, pos.getX() + 0.5D, pos.getY() + 1.0D, pos.getZ() + 0.5D,
					6, 0.4D, 0.6D, 0.4D, 0.01D);

			if (stare == 1) {
				world.playSound(null, pos, BtlSounds.MIRROR_WHISPER, SoundCategory.AMBIENT, 0.7F, 1.1F);

				// A reflection appears on the player's other side, facing them.
				if (world.getRandom().nextInt(3) == 0) {
					spawnReflection(player, world, pos);
				}
			}

			if (stare >= SECONDS_TO_PULL) {
				STARES.put(player.getUuid(), 0);
				pullThrough(player, player);
			}
		});
	}

	/** Seeds a reflection standing behind the player, already looking at them. */
	public static void spawnReflection(ServerPlayerEntity player, ServerWorld world, BlockPos mirrorPos) {
		BtlSafe.guard("mirror.reflection", () -> {
			MirrorDoubleEntity reflection = BtlEntities.MIRROR_DOUBLE.create(world, SpawnReason.EVENT);

			if (reflection == null) {
				return;
			}

			Vec3d away = mirrorPos.toCenterPos().subtract(player.getPos()).normalize().multiply(-3.0D);
			reflection.refreshPositionAndAngles(player.getX() + away.x, player.getY(), player.getZ() + away.z,
					player.getYaw() + 180.0F, 0.0F);
			reflection.setSource(player);
			reflection.setPersistent();
			world.spawnEntity(reflection);
			world.playSound(null, mirrorPos, BtlSounds.MIRROR_CRACK, SoundCategory.AMBIENT, 0.8F, 1.0F);
			player.sendMessage(Text.translatable("message.beyondthelimits.mirror.reflection"), true);
		});
	}

	/**
	 * Sends someone to the other side of the mirror.
	 *
	 * <p>The Mirror World uses the same seed, so the mapping is exact and the player always arrives
	 * standing where their reflection was standing a moment ago.</p>
	 */
	public static void pullThrough(ServerPlayerEntity player, Entity mirror) {
		BtlSafe.guard("mirror.pull", () -> {
			MinecraftServer server = player.getServer();

			if (server == null) {
				return;
			}

			ServerWorld target = server.getWorld(BtlDimensions.MIRRORWORLD);

			if (target == null) {
				return;
			}

			double x = -player.getX() - 1.0D;
			double z = -player.getZ() - 1.0D;
			BlockPos landing = target.getTopPosition(Heightmap.Type.MOTION_BLOCKING,
					BlockPos.ofFloored(x, player.getY(), z));

			BtlNetworking.sendScreenEffect(player, BtlNetworking.EFFECT_MIRROR, 1.0F, 40);
			player.teleport(target, landing.getX() + 0.5D, landing.getY() + 1.0D, landing.getZ() + 0.5D,
					180.0F - player.getYaw(), -player.getPitch());
			target.playSound(null, landing, BtlSounds.MIRROR_CRACK, SoundCategory.AMBIENT, 1.2F, 0.6F);
			player.sendMessage(Text.translatable("message.beyondthelimits.mirror.entered"), false);
			BtlState.get().addRiftTouch(player.getUuid());
		});
	}

	/** The reflection got there first. */
	public static void onCaught(ServerPlayerEntity player, MirrorDoubleEntity attacker) {
		BtlSafe.guard("mirror.caught", () -> {
			MinecraftServer server = player.getServer();

			if (server == null) {
				return;
			}

			ServerWorld overworld = server.getOverworld();

			if (overworld == null) {
				return;
			}

			BtlNetworking.sendScreenEffect(player, BtlNetworking.EFFECT_FLASH, 1.0F, 20);
			spawnReflection(player, overworld, player.getBlockPos());
			player.sendMessage(Text.translatable("message.beyondthelimits.mirror.swapped"), false);
		});
	}

	/** Reflects a region of the world through the origin, block for block. */
	public static void reflect(ServerWorld world, BlockPos centre, int radius) {
		BtlSafe.guard("mirror.reflect", () -> {
			for (int x = -radius; x <= radius; x++) {
				for (int z = -radius; z <= radius; z++) {
					for (int y = -2; y <= 3; y++) {
						BlockPos source = centre.add(x, y, z);
						BlockPos mirrored = new BlockPos(-source.getX() - 1, source.getY(), -source.getZ() - 1);

						if (world.getBlockState(mirrored).isAir() && !world.getBlockState(source).isAir()) {
							world.setBlockState(mirrored, world.getBlockState(source), Block.NOTIFY_LISTENERS);
						}
					}
				}
			}

			world.spawnParticles(BtlParticles.MIRROR_MOTE, centre.getX(), centre.getY() + 1.0D, centre.getZ(),
					24, radius, 3.0D, radius, 0.02D);
		});
	}

	public static boolean inMirrorWorld(Entity entity) {
		return entity.getWorld().getRegistryKey() == BtlDimensions.MIRRORWORLD;
	}

	/** In the Mirror World, incoming damage is echoed back through the reflection. */
	public static int reflectDamage(int amount) {
		return Math.max(1, amount);
	}

	public static boolean isMirrorBlockAt(net.minecraft.world.BlockView view, BlockPos pos) {
		return view.getBlockState(pos).isOf(BtlBlocks.MIRROR_BLOCK);
	}
}
