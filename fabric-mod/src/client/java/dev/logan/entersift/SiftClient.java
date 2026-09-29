package dev.logan.entersift;

import java.nio.file.Files;
import net.fabricmc.api.ClientModInitializer;
import net.fabricmc.loader.api.FabricLoader;
import net.fabricmc.fabric.api.client.render.fluid.v1.FluidRenderingRegistry;
import net.minecraft.client.renderer.block.FluidModel;
import net.minecraft.client.resources.model.sprite.Material;
import dev.logan.entersift.client.SiftCreatureRenderer;
import dev.logan.entersift.client.SiftModelDefs;
import dev.logan.entersift.client.SiftSky;
import dev.logan.entersift.client.SiftRenderTypes;
import dev.logan.entersift.client.RiftPortalRenderer;
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
        creature(SiftKind.SOUL_BEE, SiftModelDefs::soulBee, SiftModelDefs.SOUL_BEE_PARTS);
        creature(SiftKind.WATCHLING, SiftModelDefs::watchling, SiftModelDefs.WATCHLING_PARTS);
        creature(SiftKind.TWISTED_WARDEN, SiftModelDefs::twistedWarden, SiftModelDefs.TWISTED_WARDEN_PARTS);
        creature(SiftKind.SINGER, SiftModelDefs::singer, SiftModelDefs.SINGER_PARTS);
        SiftRenderTypes.initialize();
        SiftRenderTypes.registerWithIris(); // 0.12: shader packs draw the Sift sky and rifts with known programs
        SiftSky.register();
        dev.logan.entersift.client.SiftClouds.register(); // 0.13 Dungeons-style Overworld clouds (no shader pack)
        dev.logan.entersift.client.SiftSouls.register(); // 0.14 wandering souls with blue comet trails (Sift only)
        // 0.10: rifts are RiftPortalEntity instances drawn by their own entity renderer.
        EntityRendererRegistry.register(SiftEntities.RIFT_PORTAL, RiftPortalRenderer::new);
        FluidRenderingRegistry.register(SiftContent.ICHOR, SiftContent.FLOWING_ICHOR,
            new FluidModel.Unbaked(
                new Material(SiftContent.id("block/ichor_still")),
                new Material(SiftContent.id("block/ichor_flow")),
                new Material(SiftContent.id("block/ichor_overlay")), null));
        installOverworldShaderPack();
    }

    private static final String PACK = "Dungeons-II-Overworld-0.15.zip"; // must match build.gradle archiveFileName (test_data enforces it)

    /**
     * 0.11: ship the optional Dungeons II Overworld Iris pack. It is copied into shaderpacks/ only if
     * missing and is never selected or enabled (Iris settings are not touched): it is OFF by default.
     * The Sift needs no shaders. Only the old Sift-Cinematic-*.zip packs of earlier versions are removed.
     */
    private static void installOverworldShaderPack() {
        var packs = FabricLoader.getInstance().getGameDir().resolve("shaderpacks");
        try (var list = Files.isDirectory(packs) ? Files.list(packs) : java.util.stream.Stream.<java.nio.file.Path>empty()) {
            for (var old : list.filter(f -> f.getFileName().toString().matches("Sift-Cinematic-.*\\.zip")).toList()) {
                Files.deleteIfExists(old);
                EnterTheSift.LOGGER.info("[Sift] removed old shader pack {}", old.getFileName());
            }
        } catch (Exception error) {
            EnterTheSift.LOGGER.warn("Could not clean old Sift shader packs", error);
        }
        // 0.12/0.13: installed under a new name so existing installs get the fixed programs (0.13: no
        // checkerboard cloud undersides; select the 0.13 pack in Iris). Older copies
        // are left alone (one may be selected in Iris, and Iris settings are never touched).
        var target = packs.resolve(PACK);
        if (Files.exists(target)) return;
        try (var in = SiftClient.class.getResourceAsStream("/assets/entersift/shaderpacks/" + PACK)) {
            if (in == null) { EnterTheSift.LOGGER.error("[Sift] bundled shader pack {} is missing from the jar", PACK); return; }
            Files.createDirectories(packs);
            Files.copy(in, target);
            EnterTheSift.LOGGER.info("[Sift] installed optional shader pack {} (off by default)", PACK);
        } catch (Exception error) {
            EnterTheSift.LOGGER.warn("Could not install optional shader pack {}", PACK, error);
        }
    }
}
