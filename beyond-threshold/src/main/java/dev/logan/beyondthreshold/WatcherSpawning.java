package dev.logan.beyondthreshold;

import dev.logan.beyondthreshold.entity.WatcherEyeEntity;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.network.ServerPlayerEntity;
import net.minecraft.server.world.ServerWorld;

/** Opens the sky: the gigantic human eye manifests above the player. */
public final class WatcherSpawning {
	public static void begin(MinecraftServer server, ServerPlayerEntity player) {
		if (player.getScoreboardTags().contains(BeyondTheThreshold.TAG_THRESHOLD)) {
			return;
		}
		ServerWorld world = player.getServerWorld();
		world.spawnEntity(new WatcherEyeEntity(world,
				player.getX(), player.getY() + 44.0, player.getZ()));
		BTTNet.sendEyeSequence(player, 0);
		BeyondTheThreshold.LOGGER.info("[btt] the eye opens above {}", player.getName().getString());
	}

	private WatcherSpawning() {
	}
}
