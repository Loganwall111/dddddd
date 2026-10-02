package dev.logan.riftext;

import dev.logan.riftext.client.RiftPortalRenderer;
import dev.logan.riftext.client.SiftBudget;
import dev.logan.riftext.client.SiftRenderTypes;
import net.fabricmc.api.ClientModInitializer;
import net.fabricmc.fabric.api.client.rendering.v1.EntityRendererRegistry;
import net.fabricmc.loader.api.FabricLoader;

/**
 * Client entrypoint for the Rift Extension mod.
 */
public final class RiftExtensionClient implements ClientModInitializer {

    @Override
    public void onInitializeClient() {
        SiftRenderTypes.initialize();
        SiftRenderTypes.registerWithIris();
        SiftBudget.load(FabricLoader.getInstance().getConfigDir());
        net.fabricmc.fabric.api.client.rendering.v1.level.LevelRenderEvents.COLLECT_SUBMITS.register(
            context -> SiftBudget.reset());
        EntityRendererRegistry.register(RiftExtEntities.RIFT_PORTAL, RiftPortalRenderer::new);
        RiftExtension.LOGGER.info("Rift Extension client: renderer registered.");
    }
}