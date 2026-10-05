package dev.logan.beyondthreshold;

import dev.logan.beyondthreshold.config.BTTConfig;
import dev.logan.beyondthreshold.world.BTTDimensions;
import dev.logan.beyondthreshold.world.PaletteSwapper;
import net.fabricmc.api.ModInitializer;
import net.fabricmc.fabric.api.event.lifecycle.v1.ServerLifecycleEvents;
import net.fabricmc.fabric.api.event.lifecycle.v1.ServerTickEvents;
import net.fabricmc.fabric.api.networking.v1.ServerPlayConnectionEvents;
import net.fabricmc.fabric.api.event.lifecycle.v1.ServerChunkEvents;
import net.minecraft.server.network.ServerPlayerEntity;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * BEYOND THE THRESHOLD
 * -------------------
 * The overworld you generated is the skin of a nameless cosmic colossus.
 * A gigantic human eye watches from above the clouds, reaches down, and
 * pixelates you into the truth: threshold skies, gravitational-lensing
 * black holes, a tearable reality membrane, procedural dimensions and
 * the Mandela Effect shader suite.
 *
 * Server side: entities (eye / black hole / tear), travel + procedural
 * inventories, palette swapping of terrain with OnePac-generated blocks.
 */
public class BeyondTheThreshold implements ModInitializer {
	public static final String MOD_ID = "beyondthreshold";
	public static final Logger LOGGER = LoggerFactory.getLogger("beyondthreshold");

	/** Scoreboard tags double as synced, persistent player state. */
	public static final String TAG_GLASSES = "btt_glasses";
	public static final String TAG_THRESHOLD = "btt_threshold";
	public static final String TAG_INTRO = "btt_intro_done";

	@Override
	public void onInitialize() {
		BTTConfig.load();
		BTTItems.register();
		BTTEntities.register();
		BTTGeneratedContent.register();
		BTTCommands.register();
		ServerLifecycleEvents.SERVER_STARTING.register(BTTDimensions::register);

		// OnePac palette swap: terrain of threshold dimensions is rebuilt
		// from procedurally generated variant blocks when chunks load.
		ServerChunkEvents.CHUNK_LOAD.register((world, chunk) -> PaletteSwapper.onChunkLoad(world, chunk));

		// The eye finds every new traveller once.
		ServerPlayConnectionEvents.JOIN.register((handler, sender, server) -> {
			ServerPlayerEntity player = handler.getPlayer();
			if (!player.getCommandTags().contains(TAG_INTRO)) {
				player.getCommandTags().add(TAG_INTRO);
				BTTScheduler.in(100, () -> WatcherSpawning.begin(server, player));
			}
			BTTNet.sendGlasses(player, player.getCommandTags().contains(TAG_GLASSES));
			BTTNet.sendThreshold(player, player.getCommandTags().contains(TAG_THRESHOLD));
		});

		ServerTickEvents.END_SERVER_TICK.register(server -> BTTScheduler.tick(server));

		LOGGER.info("[btt] Beyond the Threshold initialised. The eye is open.");
	}
}
