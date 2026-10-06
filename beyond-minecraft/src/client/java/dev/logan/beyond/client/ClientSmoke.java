package dev.logan.beyond.client;

import dev.logan.beyond.BeyondMinecraft;
import dev.logan.beyond.client.render.CosmicRenderer;
import net.minecraft.client.MinecraftClient;

/** CI-only native OpenGL resource-load smoke. It is not a claim of interactive playtesting. */
public final class ClientSmoke {
    private static final boolean ENABLED = "1".equals(System.getenv("BEYOND_CLIENT_SMOKE"));
    private static int ticks;
    private static boolean complete;
    private ClientSmoke() {}
    public static void tick(MinecraftClient client) {
        if (!ENABLED || complete || ++ticks < 120) return;
        complete = true;
        if (CosmicRenderer.ready()) BeyondMinecraft.LOGGER.info("BEYOND_CLIENT_SHADER_SMOKE_PASS native_glsl=true resource_reload=true");
        else BeyondMinecraft.LOGGER.error("BEYOND_CLIENT_SHADER_SMOKE_FAIL {}", CosmicRenderer.status());
        client.scheduleStop();
    }
}
