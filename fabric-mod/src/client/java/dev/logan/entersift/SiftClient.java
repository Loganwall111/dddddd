package dev.logan.entersift;

import java.nio.file.Files;
import net.fabricmc.api.ClientModInitializer;
import net.fabricmc.loader.api.FabricLoader;
import net.fabricmc.fabric.api.client.render.fluid.v1.FluidRenderingRegistry;
import net.minecraft.client.renderer.block.FluidModel;
import net.minecraft.client.resources.model.sprite.Material;

public final class SiftClient implements ClientModInitializer {
    @Override public void onInitializeClient() {
        FluidRenderingRegistry.register(SiftContent.ICHOR, SiftContent.FLOWING_ICHOR,
            new FluidModel.Unbaked(
                new Material(SiftContent.id("block/ichor_still")),
                new Material(SiftContent.id("block/ichor_flow")),
                new Material(SiftContent.id("block/ichor_overlay")), null));
        // Optional Iris pack: copy once, never overwrite the user's shader settings or edited files.
        var target = FabricLoader.getInstance().getGameDir().resolve("shaderpacks/Sift-Cinematic-0.2.zip");
        if (!Files.exists(target)) {
            try (var input = SiftClient.class.getResourceAsStream("/assets/entersift/shaderpacks/Sift-Cinematic-0.2.zip")) {
                if (input != null) { Files.createDirectories(target.getParent()); Files.copy(input, target); }
            } catch (Exception error) {
                EnterTheSift.LOGGER.warn("Could not install optional Sift shader pack; the mod can still run", error);
            }
        }
    }
}
