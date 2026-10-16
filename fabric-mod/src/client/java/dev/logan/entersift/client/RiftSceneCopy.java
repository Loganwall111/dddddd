package dev.logan.entersift.client;

import com.mojang.blaze3d.systems.RenderSystem;
import com.mojang.renderpearl.api.textures.GpuTexture;
import com.mojang.renderpearl.api.textures.FilterMode;
import dev.logan.entersift.SiftContent;
import net.fabricmc.fabric.api.client.rendering.v1.level.LevelRenderEvents;
import net.minecraft.client.Minecraft;
import net.minecraft.client.renderer.texture.AbstractTexture;
import net.minecraft.resources.Identifier;

/** Copies opaque terrain once per frame, never samples the attachment being written. */
public final class RiftSceneCopy extends AbstractTexture {
    public static final Identifier ID = SiftContent.id("rift_scene_copy");
    private static RiftSceneCopy instance;
    private static boolean failed;
    private RiftSceneCopy() {}

    public static void register() {
        instance = new RiftSceneCopy();
        Minecraft.getInstance().getTextureManager().register(ID, instance);
        LevelRenderEvents.AFTER_OPAQUE_TERRAIN.register(context -> {
            if (failed || !SiftBudget.riftShader || SiftRenderTypes.irisShadowPass() || SiftRenderTypes.shaderPackInUseCached()) return;
            boolean visible = context.levelState().entityRenderStates.stream().anyMatch(s -> s instanceof RiftPortalRenderer.State);
            if (!visible) return;
            try { instance.capture(); }
            catch (RuntimeException error) {
                failed = true;
                dev.logan.entersift.EnterTheSift.LOGGER.warn("Rift refraction unavailable; using translucent fallback", error);
            }
        });
    }

    private void capture() {
        var source = Minecraft.getInstance().gameRenderer.mainRenderTarget().getColorTexture();
        if (source == null) return;
        int w = source.getWidth(0), h = source.getHeight(0);
        if (texture == null || texture.isClosed() || texture.getWidth(0) != w || texture.getHeight(0) != h || texture.getFormat() != source.getFormat()) {
            releaseTextures();
            texture = RenderSystem.getDevice().createTexture("Sift rift scene copy",
                GpuTexture.USAGE_COPY_DST | GpuTexture.USAGE_TEXTURE_BINDING, source.getFormat(), w, h, 1, 1);
            textureView = RenderSystem.getDevice().createTextureView(texture);
            sampler = RenderSystem.getSamplerCache().getClampToEdge(FilterMode.LINEAR);
        }
        var encoder = RenderSystem.getDevice().createCommandEncoder();
        encoder.copyTextureToTexture(source, texture, 0, 0, 0, 0, 0, w, h);
        encoder.submit();
    }

    public static boolean available() {
        return !failed && instance != null && instance.textureView != null && !instance.texture.isClosed()
            && !SiftRenderTypes.shaderPackInUseCached();
    }
}
