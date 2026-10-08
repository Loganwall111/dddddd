package com.beyondthelimits.world;

import com.beyondthelimits.core.BtlState;
import com.beyondthelimits.network.BtlNetworking;
import com.beyondthelimits.registry.BtlSounds;
import com.beyondthelimits.util.BtlSafe;
import net.minecraft.entity.Entity;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.network.ServerPlayerEntity;
import net.minecraft.server.world.ServerWorld;
import net.minecraft.sound.SoundCategory;
import net.minecraft.util.math.BlockPos;
import net.minecraft.util.math.Vec3d;
import net.minecraft.world.Heightmap;
import net.minecraft.world.TeleportTarget;
import net.minecraft.world.World;

/**
 * Seamless travel.
 *
 * <p>There are no portal blocks in Chapter One. Every transition — a rift, the warehouse gate, a
 * noclip, a storm throwing you sideways — is done here, and it is done with a
 * {@link TeleportTarget} built to keep the traveller's momentum, so the seam is invisible: the player
 * keeps their speed, their look direction and their velocity, and the client's only cue that anything
 * happened is a short shader wash.</p>
 *
 * <p>This is also where the mod's courtesy rules live: nobody arrives inside terrain, nobody arrives
 * mid-air over the void, and any entity that someone was riding comes with them.</p>
 */
public final class BtlPortal {
	private BtlPortal() {
	}

	/** Sends a player (and whatever they are riding) to a world coordinate, seamlessly. */
	public static boolean send(ServerPlayerEntity player, World target, double x, double y, double z, boolean keepVelocity) {
		return BtlSafe.supply("portal.send", () -> {
			if (!(target instanceof ServerWorld serverWorld)) {
				return false;
			}

			BlockPos safe = safeLanding(serverWorld, BlockPos.ofFloored(x, y, z));
			Vec3d velocity = keepVelocity ? player.getVelocity() : Vec3d.ZERO;
			TeleportTarget target2 = new TeleportTarget(serverWorld,
					new Vec3d(safe.getX() + 0.5D, safe.getY(), safe.getZ() + 0.5D),
					velocity, player.getYaw(), player.getPitch(), TeleportTarget.ADD_PORTAL_CHUNK_TICKET);

			BtlNetworking.sendScreenEffect(player, BtlNetworking.EFFECT_RIFT_WASH, 0.7F, 30);
			player.teleportTo(target2);
			serverWorld.playSound(null, safe, BtlSounds.NOCLIP_WHOOSH, SoundCategory.AMBIENT, 0.8F, 0.8F);
			BtlNetworking.sendRealitySync(player);
			BtlNetworking.sendSkyState(player);
			return true;
		}, false);
	}

	/** Convenience: enter a dimension at the surface nearest the player's current position. */
	public static boolean enter(ServerPlayerEntity player, net.minecraft.registry.RegistryKey<World> key) {
		return BtlSafe.supply("portal.enter", () -> {
			MinecraftServer server = player.getServer();

			if (server == null) {
				return false;
			}

			ServerWorld target = server.getWorld(key);

			if (target == null) {
				return false;
			}

			BlockPos surface = target.getTopPosition(Heightmap.Type.MOTION_BLOCKING,
					BlockPos.ofFloored(player.getX(), player.getY(), player.getZ()));
			return send(player, target, surface.getX(), surface.getY() + 1.0D, surface.getZ(), true);
		}, false);
	}

	/** Moves any entity, used by rifts pulling mobs through. */
	public static void sendEntity(Entity entity, World target, double x, double y, double z) {
		BtlSafe.guard("portal.entity", () -> {
			if (!(target instanceof ServerWorld serverWorld)) {
				return;
			}

			BlockPos safe = safeLanding(serverWorld, BlockPos.ofFloored(x, y, z));
			entity.teleportTo(new TeleportTarget(serverWorld, new Vec3d(safe.getX() + 0.5D, safe.getY(), safe.getZ() + 0.5D),
					entity.getVelocity(), entity.getYaw(), entity.getPitch(), TeleportTarget.NO_OP));
		});
	}

	/**
	 * Moves a landing position up until it is safe.
	 *
	 * <p>The check is deliberately generous: a portal that drops the player into a wall is worse than
	 * a portal that dumps them on a roof.</p>
	 */
	public static BlockPos safeLanding(ServerWorld world, BlockPos requested) {
		int minY = world.getBottomY() + 1;
		int maxY = world.getTopY() - 2;
		int y = Math.max(minY, Math.min(maxY, requested.getY()));
		BlockPos pos = new BlockPos(requested.getX(), y, requested.getZ());

		for (int attempt = 0; attempt < 24; attempt++) {
			if (!world.getBlockState(pos).blocksMovement() && !world.getBlockState(pos.up()).blocksMovement()) {
				return pos;
			}

			pos = pos.up();
		}

		// Nothing worked upwards: take the surface instead, which is always standable.
		return world.getTopPosition(Heightmap.Type.MOTION_BLOCKING, requested);
	}

	/** Rift-adjacent bookkeeping, so the guide can tell the player where they have been. */
	public static void noteTravel(ServerPlayerEntity player, World from, World to) {
		BtlSafe.guard("portal.note", () -> {
			BtlState state = BtlState.get();
			state.addRiftTouch(player.getUuid());

			if (from.getRegistryKey() != to.getRegistryKey()) {
				state.setDementia(player.getUuid(), state.dementia(player.getUuid()) + 20);
			}
		});
	}
}
