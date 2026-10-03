package dev.logan.entersift.client;

import com.mojang.blaze3d.pipeline.TextureTarget;
import com.mojang.blaze3d.systems.RenderSystem;
import com.mojang.renderpearl.api.textures.AddressMode;
import com.mojang.renderpearl.api.textures.FilterMode;
import dev.logan.entersift.EnterTheSift;
import dev.logan.entersift.SiftContent;
import java.util.OptionalDouble;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientLifecycleEvents;
import net.fabricmc.fabric.api.client.rendering.v1.level.LevelRenderEvents;
import net.minecraft.client.Minecraft;
import net.minecraft.client.renderer.texture.AbstractTexture;
import net.minecraft.resources.Identifier;

/** Copies opaque terrain + sky BEFORE entity submits. Never samples the active render attachment.
 * Iris owns different attachments: use the transparent fallback while a shader pack is active.
 * Translucent terrain/entities and a destination-world camera are intentionally not captured here.
 */
public final class RiftScene {
    public static final Identifier COLOR = SiftContent.id("dynamic/rift_scene");
    public static final Identifier DEPTH = SiftContent.id("dynamic/rift_depth");
    private static TextureTarget copy;
    private static boolean requested, ready, failed;

    private RiftScene() {}

    public static void register() {
        LevelRenderEvents.AFTER_OPAQUE_TERRAIN.register(context -> capture());
        ClientLifecycleEvents.CLIENT_STOPPING.register(client -> release(client));
        net.fabricmc.fabric.api.client.networking.v1.ClientPlayConnectionEvents.DISCONNECT.register((handler, client) -> {
            release(client);
            requested = false;
            failed = false;
        });
    }

    /** Called during submit collection. First visible frame falls back until the next capture. */
    public static boolean request() {
        requested = true;
        return ready;
    }

    private static void capture() {
        ready = false;
        var client = Minecraft.getInstance();
        boolean needed = requested;
        requested = false;
        if (!needed || failed || !SiftBudget.riftShader || !SiftBudget.riftRefraction
                || SiftRenderTypes.shaderPackInUseCached() || SiftRenderTypes.irisShadowPass()) {
            if (!needed) release(client);
            return;
        }
        try {
            var main = client.gameRenderer.mainRenderTarget();
            if (!main.hasDepth() || main.width < 1 || main.height < 1) return;
            if (copy == null || copy.width != main.width || copy.height != main.height
                    || copy.getColorTexture().getFormat() != main.getColorTexture().getFormat()
                    || copy.getDepthTexture().getFormat() != main.getDepthTexture().getFormat()) {
                release(client);
                copy = new TextureTarget("Sift rift scene", main.width, main.height,
                    main.getColorTexture().getFormat(), main.getDepthTexture().getFormat());
                client.getTextureManager().register(COLOR, new BorrowedTexture(false));
                client.getTextureManager().register(DEPTH, new BorrowedTexture(true));
            }
            copy.copyColorFrom(main);
            copy.copyDepthFrom(main);
            ready = true;
        } catch (RuntimeException error) {
            failed = true;
            release(client);
            EnterTheSift.LOGGER.warn("Rift scene copy unavailable; using transparent membrane until reconnect", error);
        }
    }

    private static void release(Minecraft client) {
        ready = false;
        if (copy == null) return;
        client.getTextureManager().release(COLOR);
        client.getTextureManager().release(DEPTH);
        copy.destroyBuffers();
        copy = null;
    }

    /** TextureManager owns the sampler; TextureTarget owns both attachment textures and views. */
    private static final class BorrowedTexture extends AbstractTexture {
        BorrowedTexture(boolean depth) {
            texture = depth ? copy.getDepthTexture() : copy.getColorTexture();
            textureView = depth ? copy.getDepthTextureView() : copy.getColorTextureView();
            sampler = RenderSystem.getDevice().createSampler(AddressMode.CLAMP_TO_EDGE, AddressMode.CLAMP_TO_EDGE,
                depth ? FilterMode.NEAREST : FilterMode.LINEAR, depth ? FilterMode.NEAREST : FilterMode.LINEAR,
                1, OptionalDouble.empty());
        }
        @Override public void close() {
            if (sampler != null) { sampler.close(); sampler = null; }
            texture = null;
            textureView = null;
        }
    }
}
