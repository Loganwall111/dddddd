package dev.logan.entersift;

import java.nio.file.Files;
import net.fabricmc.api.ClientModInitializer;
import net.fabricmc.loader.api.FabricLoader;
import net.fabricmc.fabric.api.client.render.fluid.v1.FluidRenderingRegistry;
import net.minecraft.client.renderer.block.FluidModel;
import net.minecraft.client.resources.model.sprite.Material;
import dev.logan.entersift.client.SiftCreatureRenderer;
import dev.logan.entersift.client.SiftModelDefs;
import dev.logan.entersift.client.SiftSkyLayer;
import dev.logan.entersift.client.RiftRenderer;
import java.util.function.Supplier;
import net.fabricmc.fabric.api.client.rendering.v1.ModelLayerRegistry;
import net.fabricmc.fabric.api.client.rendering.v1.EntityRendererRegistry;
import net.minecraft.client.model.geom.ModelLayerLocation;
import net.minecraft.client.model.geom.builders.LayerDefinition;

public final class SiftClient implements ClientModInitializer {
    private static void creature(SiftKind kind, Supplier<LayerDefinition> layer, String[][] parts) {
        ModelLayerLocation location = new ModelLayerLocation(SiftContent.id(kind.id), "main");
        ModelLayerRegistry.registerModelLayer(location, layer::get);
        EntityRendererRegistry.register(SiftEntities.type(kind), context -> new SiftCreatureRenderer(context, kind, location, parts));
    }

    @Override public void onInitializeClient() {
        creature(SiftKind.BLUB, SiftModelDefs::blub, SiftModelDefs.BLUB_PARTS);
        creature(SiftKind.SCULKER, SiftModelDefs::sculker, SiftModelDefs.SCULKER_PARTS);
        creature(SiftKind.SCULKLING, SiftModelDefs::sculkling, SiftModelDefs.SCULKLING_PARTS);
        creature(SiftKind.ANTLERLING, SiftModelDefs::antlerling, SiftModelDefs.ANTLERLING_PARTS);
        creature(SiftKind.DRIFT_JELLY, SiftModelDefs::driftJelly, SiftModelDefs.DRIFT_JELLY_PARTS);
        creature(SiftKind.LICKER, SiftModelDefs::licker, SiftModelDefs.LICKER_PARTS);
        creature(SiftKind.OVERSEER, SiftModelDefs::overseer, SiftModelDefs.OVERSEER_PARTS);
        creature(SiftKind.NOTE_BIRD, SiftModelDefs::noteBird, SiftModelDefs.NOTE_BIRD_PARTS);
        creature(SiftKind.TWISTED_WARDEN, SiftModelDefs::twistedWarden, SiftModelDefs.TWISTED_WARDEN_PARTS);
        creature(SiftKind.SINGER, SiftModelDefs::singer, SiftModelDefs.SINGER_PARTS);
        SiftSkyLayer.register();
        RiftRenderer.register();
        FluidRenderingRegistry.register(SiftContent.ICHOR, SiftContent.FLOWING_ICHOR,
            new FluidModel.Unbaked(
                new Material(SiftContent.id("block/ichor_still")),
                new Material(SiftContent.id("block/ichor_flow")),
                new Material(SiftContent.id("block/ichor_overlay")), null));
        // Optional Iris pack: copy once, never overwrite the user's shader settings or edited files.
        var target = FabricLoader.getInstance().getGameDir().resolve("shaderpacks/Sift-Cinematic-0.8.zip");
        if (!Files.exists(target)) {
            try (var input = SiftClient.class.getResourceAsStream("/assets/entersift/shaderpacks/Sift-Cinematic-0.8.zip")) {
                if (input != null) { Files.createDirectories(target.getParent()); Files.copy(input, target); }
            } catch (Exception error) {
                EnterTheSift.LOGGER.warn("Could not install optional Sift shader pack; the mod can still run", error);
            }
        }
    }
}
