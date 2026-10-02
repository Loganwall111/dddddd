package dev.logan.riftext;

import dev.logan.riftext.client.RiftPortalRenderer;
import dev.logan.riftext.client.SiftBudget;
import dev.logan.riftext.client.SiftRenderTypes;
import java.io.InputStream;
import java.nio.ByteBuffer;
import net.fabricmc.api.ClientModInitializer;
import net.fabricmc.fabric.api.client.rendering.v1.EntityRendererRegistry;
import net.fabricmc.loader.api.FabricLoader;
import org.lwjgl.opengl.GL11;
import org.lwjgl.opengl.GL12;
import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;

/**
 * Client entrypoint for the Rift Extension mod.
 */
public final class RiftExtensionClient implements ClientModInitializer {

    /** The GL texture ID of the rift atlas, or 0 if not loaded. */
    public static int riftAtlasGlId = 0;
    private static boolean atlasLoadAttempted = false;

    @Override
    public void onInitializeClient() {
        SiftRenderTypes.initialize();
        SiftRenderTypes.registerWithIris();
        SiftBudget.load(FabricLoader.getInstance().getConfigDir());
        net.fabricmc.fabric.api.client.rendering.v1.level.LevelRenderEvents.COLLECT_SUBMITS.register(
            context -> SiftBudget.reset());
        EntityRendererRegistry.register(RiftExtEntities.RIFT_PORTAL, RiftPortalRenderer::new);
        // DON'T load atlas here — GL context doesn't exist yet!
        RiftExtension.LOGGER.info("Rift Extension client: renderer registered.");
    }

    /**
     * Load the rift dimension panorama atlas. Called lazily on first render
     * when the GL context is guaranteed to exist.
     */
    public static void ensureAtlasLoaded() {
        if (atlasLoadAttempted) return;
        atlasLoadAttempted = true;
        try {
            try (InputStream is = RiftExtensionClient.class.getResourceAsStream(
                    "/assets/riftextension/textures/environment/rift_atlas.png")) {
                if (is == null) {
                    RiftExtension.LOGGER.warn("[RiftExt] rift atlas not found in resources");
                    return;
                }
                BufferedImage img = ImageIO.read(is);
                int w = img.getWidth(), h = img.getHeight();
                int[] pixels = new int[w * h];
                img.getRGB(0, 0, w, h, pixels, 0, w);

                byte[] rgba = new byte[w * h * 4];
                for (int i = 0; i < pixels.length; i++) {
                    int p = pixels[i];
                    rgba[i * 4 + 0] = (byte) ((p >> 16) & 0xFF);
                    rgba[i * 4 + 1] = (byte) ((p >> 8) & 0xFF);
                    rgba[i * 4 + 2] = (byte) (p & 0xFF);
                    rgba[i * 4 + 3] = (byte) ((p >> 24) & 0xFF);
                }

                ByteBuffer buf = ByteBuffer.allocateDirect(rgba.length);
                buf.put(rgba);
                buf.flip();

                riftAtlasGlId = GL11.glGenTextures();
                GL11.glBindTexture(GL11.GL_TEXTURE_2D, riftAtlasGlId);
                GL11.glTexParameteri(GL11.GL_TEXTURE_2D, GL11.GL_TEXTURE_MIN_FILTER, GL11.GL_LINEAR);
                GL11.glTexParameteri(GL11.GL_TEXTURE_2D, GL11.GL_TEXTURE_MAG_FILTER, GL11.GL_LINEAR);
                GL11.glTexParameteri(GL11.GL_TEXTURE_2D, GL11.GL_TEXTURE_WRAP_S, GL12.GL_CLAMP_TO_EDGE);
                GL11.glTexParameteri(GL11.GL_TEXTURE_2D, GL11.GL_TEXTURE_WRAP_T, GL12.GL_CLAMP_TO_EDGE);
                GL11.glTexImage2D(GL11.GL_TEXTURE_2D, 0, GL11.GL_RGBA8, w, h, 0,
                    GL11.GL_RGBA, GL11.GL_UNSIGNED_BYTE, buf);
                GL11.glBindTexture(GL11.GL_TEXTURE_2D, 0);

                RiftExtension.LOGGER.info("[RiftExt] loaded rift atlas {}x{}, GL id={}", w, h, riftAtlasGlId);
            }
        } catch (Exception e) {
            RiftExtension.LOGGER.error("[RiftExt] failed to load rift atlas", e);
        }
    }
}