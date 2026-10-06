package dev.logan.beyondthreshold;

import dev.logan.beyondthreshold.entity.WatcherEyeEntity;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.network.ServerPlayerEntity;
import net.minecraft.server.world.ServerWorld;
import net.minecraft.util.math.Box;

/** Opens the sky: the gigantic human eye manifests above the player. */
public final class WatcherSpawning {
	public static void begin(MinecraftServer server, ServerPlayerEntity player) {
		if (player.getCommandTags().contains(BeyondTheThreshold.TAG_THRESHOLD)) {
			return;
		}
		if (server.getPlayerManager().getPlayer(player.getUuid()) == null) {
			return; // they left before the eye could reach them
		}
		ServerWorld world = player.getServerWorld();
		if (!world.getEntitiesByType(BTTEntities.WATCHER_EYE,
				new Box(player.getBlockPos()).expand(400.0), e -> true).isEmpty()) {
			return; // an eye is already open
		}
		world.spawnEntity(new WatcherEyeEntity(world,
				player.getX(), player.getY() + 44.0, player.getZ()));
		BTTNet.sendEyeSequence(player, 0);
		BeyondTheThreshold.LOGGER.info("[btt] the eye opens above {}", player.getName().getString());
	}

	private WatcherSpawning() {
	}
}
