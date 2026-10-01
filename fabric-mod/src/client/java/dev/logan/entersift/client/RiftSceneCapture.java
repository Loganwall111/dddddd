package dev.logan.entersift.client;

import com.mojang.blaze3d.systems.RenderSystem;
import com.mojang.renderpearl.api.textures.FilterMode;
import com.mojang.renderpearl.api.textures.GpuTexture;
import dev.logan.entersift.SiftContent;
import net.fabricmc.fabric.api.client.rendering.v1.level.LevelRenderEvents;
import net.minecraft.client.Minecraft;
import net.minecraft.client.renderer.texture.AbstractTexture;
import net.minecraft.resources.Identifier;

/** One scene copy per frame, shared by all rifts. Never sample the active color attachment. */
public final class RiftSceneCapture {
    public static final Identifier SCENE = SiftContent.id("dynamic/rift_scene");
    private static SceneTexture copy;
    private static long requested;
    private static boolean failed;
    private RiftSceneCapture() {}

    public static void register() {
        LevelRenderEvents.AFTER_OPAQUE_TERRAIN.register(context -> capture());
    }

    public static boolean request() {
        requested = System.nanoTime();
        // Iris owns different framebuffer attachments; never sample vanilla's stale target under a pack.
        return !failed && !SiftRenderTypes.shaderPackInUseCached() && copy != null && copy.valid();
    }

    private static void capture() {
        if (failed || System.nanoTime() - requested > 250_000_000L || SiftRenderTypes.irisShadowPass()
                || SiftRenderTypes.shaderPackInUseCached()) return;
        var mc = Minecraft.getInstance();
        if (mc.level == null) return;
        var source = mc.getMainRenderTarget().getColorTexture();
        if (source == null || source.isClosed()) return;
        try {
            if (copy == null || !copy.matches(source)) {
                copy = new SceneTexture(source);
                mc.getTextureManager().register(SCENE, copy); // closes the old texture on replacement
            }
            var encoder = RenderSystem.getDevice().createCommandEncoder();
            encoder.copyTextureToTexture(source, copy.getTexture(), 0, 0, 0, 0, 0, source.getWidth(0), source.getHeight(0));
            encoder.submit();
        } catch (RuntimeException error) {
            failed = true;
            dev.logan.entersift.EnterTheSift.LOGGER.warn("Rift scene capture unavailable; retaining translucent rift fallback", error);
        }
    }

    private static final class SceneTexture extends AbstractTexture {
        SceneTexture(GpuTexture source) {
            var device = RenderSystem.getDevice();
            texture = device.createTexture("Rift scene copy", GpuTexture.USAGE_COPY_DST | GpuTexture.USAGE_TEXTURE_BINDING,
                source.getFormat(), source.getWidth(0), source.getHeight(0), 1, 1);
            textureView = device.createTextureView(texture);
            sampler = RenderSystem.getSamplerCache().getClampToEdge(FilterMode.LINEAR);
        }
        boolean valid() { return texture != null && !texture.isClosed(); }
        boolean matches(GpuTexture source) {
            return valid() && texture.getWidth(0) == source.getWidth(0) && texture.getHeight(0) == source.getHeight(0)
                && texture.getFormat() == source.getFormat();
        }
    }
}
