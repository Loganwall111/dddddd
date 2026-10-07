package dev.logan.beyond.client;

import net.minecraft.client.MinecraftClient;

/**
 * Dimension changes are visual-only here: while the mod is moving you (or while you walk a
 * wormhole corridor) the vanilla "Downloading terrain" / level-loading overlays are dismissed and
 * the post-processor's warp covers the swap. Gameplay is unchanged — the server still sends the
 * new world, the client still loads it; only the full-screen interruption is removed.
 *
 * <p>Screens are matched by class name on purpose, so a different (or future) mapping set cannot
 * turn a cosmetic preference into a crash.
 */
public final class SeamlessTravel {
    public static volatile long suppressed;
    private SeamlessTravel() {}
    public static void tick(MinecraftClient client) {
        if (!BeyondClient.CONFIG.seamlessTravel || !BeyondClient.CONFIG.enabled) return;
        var screen = client.currentScreen;
        if (screen == null || !ClientReality.travelling()) return;
        String name = screen.getClass().getName();
        if (name.endsWith("DownloadingTerrainScreen") || name.endsWith("LevelLoadingScreen")
            || name.endsWith("ReceivingLevelScreen") || name.endsWith("ProgressScreen")) {
            client.setScreen(null);
            suppressed++;
        }
    }
}
