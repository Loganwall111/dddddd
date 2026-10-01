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
        // 0.16: render switches + per-frame vertex budget (terrain-stretching fix); must run before the passes below.
        dev.logan.entersift.client.SiftBudget.load(net.fabricmc.loader.api.FabricLoader.getInstance().getConfigDir());
        net.fabricmc.fabric.api.client.rendering.v1.level.LevelRenderEvents.COLLECT_SUBMITS.register(context -> dev.logan.entersift.client.SiftBudget.reset());
        dev.logan.entersift.client.SiftTransition.register(); // 0.16 chromatic + orange-flash rift transition overlay
        SiftSky.register();
        dev.logan.entersift.client.SiftTunnel.register(); // 0.18 warp-tunnel view inside the rift tunnel
        dev.logan.entersift.client.SiftClouds.register(); // 0.13 Dungeons-style Overworld clouds (no shader pack)
        dev.logan.entersift.client.SiftSouls.register(); // 0.14 wandering souls with blue comet trails (Sift only)
        // 0.10: rifts are RiftPortalEntity instances drawn by their own entity renderer.
        EntityRendererRegistry.register(SiftEntities.RIFT_PORTAL, RiftPortalRenderer::new);
        EntityRendererRegistry.register(SiftEntities.AURA_COLUMN, dev.logan.entersift.client.AuraColumnRenderer::new);
        dev.logan.entersift.client.RiftStaffRenderer.register(); // 0.22 floating animated blue cube above the rift staff
        dev.logan.entersift.client.GauntletWearRenderer.register(); // 0.22 wearable gauntlet arm effects
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
        // 0.18.2: the pack keeps ONE file name (so the user's Iris selection survives) and is updated in
        // place whenever the bundled copy differs. Before this, an existing file was never replaced, so
        // installs from 0.15 never received the Sift lighting, sunset god rays or rift support.
        var target = packs.resolve(PACK);
        try (var in = SiftClient.class.getResourceAsStream("/assets/entersift/shaderpacks/" + PACK)) {
            if (in == null) { EnterTheSift.LOGGER.error("[Sift] bundled shader pack {} is missing from the jar", PACK); return; }
            byte[] bundled = in.readAllBytes();
            if (Files.exists(target) && java.util.Arrays.equals(Files.readAllBytes(target), bundled)) return;
            boolean update = Files.exists(target);
            Files.createDirectories(packs);
            var tmp = packs.resolve(PACK + ".tmp");
            Files.write(tmp, bundled);
            Files.move(tmp, target, java.nio.file.StandardCopyOption.REPLACE_EXISTING);
            EnterTheSift.LOGGER.info(update ? "[Sift] updated shader pack {} to this mod version" : "[Sift] installed optional shader pack {} (off by default)", PACK);
        } catch (Exception error) {
            EnterTheSift.LOGGER.warn("Could not install optional shader pack {}", PACK, error);
        }
    }
}
