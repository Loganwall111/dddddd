package dev.logan.riftext;

import net.fabricmc.api.ModInitializer;
import net.fabricmc.fabric.api.event.lifecycle.v1.ServerLifecycleEvents;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Rift Extension for Enter the SIFT — standalone development sandbox.
 *
 * <p>This mod provides trailer-accurate rift structures that spawn from inventory-placeable items.
 * It is designed to be developed in isolation and merged into the main Enter the SIFT mod when ready.
 *
 * <p>Phase 1 (this mod): rifts are placeable inventory items that tear open a RiftPortalEntity with
 * trailer-faithful geometry. No gauntlets, no rituals, no transport — visuals only.
 *
 * <p>Phase 2 (future merge): replace the main mod's rift seed blocks and gauntlet-punch rifts with
 * these improved shapes, and wire up the existing transport/tunnel system.</p>
 */
public final class RiftExtension implements ModInitializer {
    public static final String MOD_ID = "riftextension";
    public static final Logger LOGGER = LoggerFactory.getLogger(MOD_ID);

    @Override
    public void onInitialize() {
        RiftContent.initialize();
        RiftExtEntities.initialize();
        LOGGER.info("Rift Extension: trailer-accurate rifts loaded (Phase 1 — standalone sandbox).");
        ServerLifecycleEvents.SERVER_STOPPED.register(server -> {
            LOGGER.info("Rift Extension: server stopped.");
        });
    }
}