package dev.beyondlimits.client;

import dev.beyondlimits.BeyondLimits;
import dev.beyondlimits.ModDimensions;
import dev.beyondlimits.ModBlocks;
import dev.beyondlimits.entity.ModEntities;
import dev.beyondlimits.entity.ObserverModel;
import dev.beyondlimits.entity.ObserverRenderer;
import dev.beyondlimits.network.RealitySync;
import net.fabricmc.api.ClientModInitializer;
import net.fabricmc.fabric.api.blockrenderlayer.v1.BlockRenderLayerMap;
import net.fabricmc.fabric.api.client.networking.v1.ClientPlayNetworking;
import net.fabricmc.fabric.api.client.rendering.v1.DimensionRenderingRegistry;
import net.fabricmc.fabric.api.client.rendering.v1.EntityModelLayerRegistry;
import net.fabricmc.fabric.api.client.rendering.v1.EntityRendererRegistry;
import net.fabricmc.fabric.api.client.rendering.v1.HudRenderCallback;
import net.minecraft.client.render.DimensionEffects;
import net.minecraft.client.render.RenderLayer;
import net.minecraft.util.math.Vec3d;

public final class BeyondLimitsClient implements ClientModInitializer {
    @Override
    public void onInitializeClient() {
        BlockRenderLayerMap.INSTANCE.putBlock(ModBlocks.CODEGLASS, RenderLayer.getTranslucent());
        BlockRenderLayerMap.INSTANCE.putBlock(ModBlocks.REALITY_TEAR, RenderLayer.getTranslucent());

        EntityModelLayerRegistry.registerModelLayer(ObserverRenderer.MODEL_LAYER, ObserverModel::getTexturedModelData);
        EntityRendererRegistry.register(ModEntities.OBSERVER, ObserverRenderer::new);
        EntityRendererRegistry.register(ModEntities.MIRROR_ECHO, ObserverRenderer::new);
        EntityRendererRegistry.register(ModEntities.FRAYLING, ObserverRenderer::new);

        DimensionRenderingRegistry.registerDimensionEffects(BeyondLimits.id("codeverse"), new DimensionEffects(
                256.0F,
                true,
                DimensionEffects.SkyType.NONE,
                true,
                false
        ) {
            @Override
            public Vec3d adjustFogColor(Vec3d color, float sunHeight) {
                return new Vec3d(0.025, 0.018, 0.075);
            }

            @Override
            public boolean useThickFog(int camX, int camY) {
                return false;
            }
        });
        DimensionRenderingRegistry.registerSkyRenderer(ModDimensions.CODEVERSE, CodeverseSkyRenderer::render);
        DimensionRenderingRegistry.registerCloudRenderer(ModDimensions.CODEVERSE, context -> {
            // The Codeverse has no weather system; its moving sky is its own weather.
        });

        HudRenderCallback.EVENT.register(RealityHud::render);
        ClientPlayNetworking.registerGlobalReceiver(RealitySync.CHANNEL, (client, handler, packet, responseSender) -> {
            int stability = packet.readVarInt();
            String phase = packet.readString(64);
            int rifts = packet.readVarInt();
            client.execute(() -> RealityHud.update(stability, phase, rifts));
        });
    }
}
