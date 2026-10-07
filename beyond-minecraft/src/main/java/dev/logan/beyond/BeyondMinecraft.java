package dev.logan.beyond;

import dev.logan.beyond.content.BeyondContent;
import dev.logan.beyond.content.BeyondEntities;
import dev.logan.beyond.content.RealmCatalog;
import dev.logan.beyond.network.RealityPayload;
import dev.logan.beyond.server.*;
import dev.logan.beyond.worldgen.BeyondWorldgen;
import net.fabricmc.api.ModInitializer;
import net.fabricmc.fabric.api.entity.event.v1.ServerEntityWorldChangeEvents;
import net.fabricmc.fabric.api.entity.event.v1.ServerPlayerEvents;
import net.fabricmc.fabric.api.event.lifecycle.v1.ServerLifecycleEvents;
import net.fabricmc.fabric.api.event.lifecycle.v1.ServerTickEvents;
import net.fabricmc.fabric.api.networking.v1.PayloadTypeRegistry;
import net.fabricmc.fabric.api.networking.v1.ServerPlayConnectionEvents;
import net.minecraft.util.Identifier;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public final class BeyondMinecraft implements ModInitializer {
    public static final String MOD_ID = "beyond";
    public static final Logger LOGGER = LoggerFactory.getLogger("Beyond Minecraft");
    public static final RealmCatalog CATALOG = RealmCatalog.load();
    public static ServerConfig CONFIG;
    public static Identifier id(String path) { return Identifier.of(MOD_ID, path); }
    @Override public void onInitialize() {
        CONFIG = ServerConfig.load();
        BeyondContent.initialize();
        BeyondEntities.initialize();
        BeyondWorldgen.initialize();
        PayloadTypeRegistry.playS2C().register(RealityPayload.ID, RealityPayload.CODEC);
        BeyondCommands.register();
        ServerLifecycleEvents.SERVER_STARTING.register(server -> RealityManager.reset());
        ServerLifecycleEvents.SERVER_STOPPED.register(server -> { Tunnels.reset(server); RealityManager.reset(); });
        ServerTickEvents.END_SERVER_TICK.register(RealityManager::tick);
        ServerPlayConnectionEvents.JOIN.register((handler, sender, server) -> RealityManager.joined(handler.player));
        ServerPlayConnectionEvents.DISCONNECT.register((handler, server) -> RealityManager.disconnect(handler.player));
        ServerEntityWorldChangeEvents.AFTER_PLAYER_CHANGE_WORLD.register((player, origin, destination) -> RealityManager.changedWorld(player));
        ServerPlayerEvents.AFTER_RESPAWN.register(RealityManager::respawned);
        BeyondSmoke.register();
        LOGGER.info("Beyond Minecraft 0.2 · {} seeded realms, {} blocks, built-in GLSL, bounded server physics",
            CATALOG.realms().size(), BeyondContent.ALL.size() - 6);
    }
}
