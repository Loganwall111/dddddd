package dev.logan.entersift.client;

import com.mojang.blaze3d.systems.RenderSystem;
import com.mojang.renderpearl.api.commands.CommandEncoder;
import com.mojang.renderpearl.api.device.GpuDevice;
import com.mojang.renderpearl.api.textures.FilterMode;
import com.mojang.renderpearl.api.textures.GpuSampler;
import com.mojang.renderpearl.api.textures.GpuTexture;
import com.mojang.renderpearl.api.textures.GpuTextureView;
import dev.logan.entersift.SiftContent;
import net.fabricmc.fabric.api.client.rendering.v1.hud.HudElementRegistry;
import net.minecraft.client.Minecraft;
import net.minecraft.client.renderer.texture.AbstractTexture;
import net.minecraft.resources.Identifier;

/**
 * 0.18 real gravitational lensing for rifts: a copy of the rendered scene that the rift lens shader samples.
 *
 * Once per frame, and only while a rift is on screen, the colour of the main render target is copied
 * into our own texture (registered in the TextureManager as {@link #ID}, bound as Sampler0 by
 * {@link SiftRenderTypes#RIFT_LENS}). The copy runs from a HUD element: by then the level has been
 * drawn and no render pass is open, so copying the colour texture is legal. The lens pass therefore
 * sees the previous frame's image, which is one frame behind. The lens shader maps every pixel
 * around a rift to a point-mass lens source position (beta = theta - thetaE^2 / theta), so the scene
 * behind the rift is really bent around it, with an Einstein ring and a mirrored inner image.
 *
 * Anything that goes wrong (for example a render target that cannot be copied) switches lensing off for
 * the session, logs it once and leaves the rest of the rift untouched.
 */
public final class SiftLens {
    private SiftLens() {}

    public static final Identifier ID = SiftContent.id("dynamic/rift_lens");

    private static LensTexture texture;
    private static boolean failed, captured;
    private static long wantedAt;

    /** Our texture object: the AbstractTexture fields are protected, so this subclass fills them in. */
    static final class LensTexture extends AbstractTexture {
        void set(GpuTexture t, GpuTextureView v, GpuSampler s) { this.texture = t; this.textureView = v; this.sampler = s; }

        void free() {
            try { if (this.textureView != null) this.textureView.close(); } catch (Throwable ignored) { }
            try { if (this.texture != null) this.texture.close(); } catch (Throwable ignored) { }
            this.textureView = null;
            this.texture = null;
        }
    }

    public static void register() {
        HudElementRegistry.addFirst(SiftContent.id("rift_lens_capture"), (graphics, delta) -> capture());
    }

    /** Called by the rift renderer every frame a GPU rift is drawn. */
    static void want() { wantedAt = System.nanoTime(); }

    /** True when the lens texture holds a captured frame and may be sampled. */
    static boolean ready() {
        return SiftBudget.riftLens && !failed && captured && texture != null && texture.getTexture() != null;
    }

    static void capture() {
        if (failed || !SiftBudget.riftLens) return;
        if (System.nanoTime() - wantedAt > 1_000_000_000L) return; // no rift on screen: no copy at all
        try {
            Minecraft mc = Minecraft.getInstance();
            if (mc.level == null || mc.gameRenderer == null) return;
            GpuTexture src = mc.gameRenderer.mainRenderTarget().getColorTexture();
            if (src == null || src.isClosed()) return;
            if ((src.usage() & GpuTexture.USAGE_COPY_SRC) == 0) { fail("the main colour target cannot be copied (no COPY_SRC)", null); return; }
            int w = src.getWidth(0), h = src.getHeight(0);
            if (w <= 0 || h <= 0) return;
            GpuDevice device = RenderSystem.getDevice();
            if (texture == null) {
                texture = new LensTexture();
                mc.getTextureManager().register(ID, texture);
            }
            GpuTexture dst = texture.getTexture();
            if (dst == null || dst.isClosed() || dst.getWidth(0) != w || dst.getHeight(0) != h) {
                texture.free();
                GpuTexture t = device.createTexture("entersift rift lens", GpuTexture.USAGE_COPY_DST | GpuTexture.USAGE_TEXTURE_BINDING,
                    src.getFormat(), w, h, 1, 1);
                texture.set(t, device.createTextureView(t), RenderSystem.getSamplerCache().getClampToEdge(FilterMode.LINEAR));
                dst = t;
            }
            CommandEncoder encoder = device.createCommandEncoder();
            encoder.copyTextureToTexture(src, dst, 0, 0, 0, 0, 0, w, h);
            encoder.submit();
            captured = true;
        } catch (Throwable error) {
            fail("copying the scene failed", error);
        }
    }

    private static void fail(String why, Throwable error) {
        failed = true;
        captured = false;
        org.slf4j.LoggerFactory.getLogger("entersift").warn("[Sift] rift lensing disabled: {}", why, error);
    }
}
