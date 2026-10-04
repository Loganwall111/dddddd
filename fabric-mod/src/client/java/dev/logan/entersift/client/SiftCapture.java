package dev.logan.entersift.client;

import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents;
import net.minecraft.client.Minecraft;
import net.minecraft.client.Screenshot;
import net.minecraft.client.gui.screens.ConnectScreen;
import net.minecraft.client.gui.screens.TitleScreen;
import net.minecraft.client.multiplayer.ServerData;
import net.minecraft.client.multiplayer.resolver.ServerAddress;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Comparator;
import java.util.stream.Stream;

/**
 * 0.23 headless capture hook (CI visual playtest).
 *
 * When the environment variable ENTERSIFT_CAPTURE_DIR is set (CI only; never set in a real player's
 * client), this turns the client into a passive screenshot robot driven by an external orchestrator
 * (tools/ci_capture.py) through a tiny file mailbox:
 *
 *   <dir>/<name>.req   orchestrator asks for a screenshot named <name>
 *   <dir>/<name>.png   the client copies the freshest vanilla screenshot here once the grab lands
 *   <dir>/<name>.done  written after the png is complete; the orchestrator polls for it
 *
 * The camera itself is positioned server-side by the orchestrator over RCON (/tp with yaw/pitch),
 * so nothing here touches gameplay code. Screenshot.grab(Minecraft, boolean) is the vanilla entry
 * point (26.3 signature verified via the API probe), so captures are exactly what a player sees.
 */
public final class SiftCapture {
    private SiftCapture() {}

    private static Path dir;
    private static String pending;      // name grabbed, waiting for the file to land
    private static int pendingTicks;
    private static long lastCount;
    private static String serverAddr;   // ENTERSIFT_CAPTURE_SERVER, e.g. 127.0.0.1:25565
    private static boolean joinAttempted;
    private static int bootTicks;

    public static void register() {
        String d = System.getenv("ENTERSIFT_CAPTURE_DIR");
        if (d == null || d.isBlank()) return;
        dir = Path.of(d);
        serverAddr = System.getenv("ENTERSIFT_CAPTURE_SERVER");
        org.slf4j.LoggerFactory.getLogger("entersift").info("[Sift] capture mode active: {} server: {}", dir, serverAddr);
        ClientTickEvents.END_CLIENT_TICK.register(SiftCapture::tick);
    }

    private static void tick(Minecraft mc) {
        if (dir == null) return;
        // 26.3 ignores --server/--port and quickPlay silently stalls in the dev launcher,
        // so join programmatically ~15s after boot (26.3 API: gui.screens.ConnectScreen;
        // Minecraft has no public screen getter, so gate on ticks + level==null instead).
        bootTicks++;
        if (!joinAttempted && serverAddr != null && !serverAddr.isBlank()
                && mc.level == null && bootTicks > 300) {
            joinAttempted = true;
            org.slf4j.LoggerFactory.getLogger("entersift").info("[Sift] capture joining {}", serverAddr);
            ConnectScreen.startConnecting(new TitleScreen(), mc, ServerAddress.parseString(serverAddr),
                new ServerData("Sift Capture", serverAddr, ServerData.Type.OTHER), false, null);
            return;
        }
        if (mc.level == null || mc.player == null) return;
        try {
            if (pending != null) {
                // Wait for the vanilla screenshot file to appear and stop growing, then publish it.
                if (++pendingTicks < 10) return;
                Path shot = newestScreenshot(mc);
                if (shot == null || System.currentTimeMillis() - shot.toFile().lastModified() < 700) return;
                Files.copy(shot, dir.resolve(pending + ".png"), java.nio.file.StandardCopyOption.REPLACE_EXISTING);
                Files.writeString(dir.resolve(pending + ".done"), "ok\n");
                org.slf4j.LoggerFactory.getLogger("entersift").info("[Sift] capture saved: {}", pending);
                pending = null;
                return;
            }
            Path req = null;
            try (Stream<Path> s = Files.list(dir)) {
                req = s.filter(p -> p.toString().endsWith(".req")).min(Comparator.naturalOrder()).orElse(null);
            }
            if (req == null) return;
            String name = req.getFileName().toString().substring(0, req.getFileName().toString().length() - 4);
            Files.deleteIfExists(req);
            lastCount = countPng(mc);
            Screenshot.grab(mc, false);
            pending = name;
            pendingTicks = 0;
        } catch (Exception e) {
            org.slf4j.LoggerFactory.getLogger("entersift").warn("[Sift] capture tick failed", e);
        }
    }

    private static long countPng(Minecraft mc) throws Exception {
        Path shots = mc.gameDirectory.toPath().resolve("screenshots");
        if (!Files.isDirectory(shots)) return 0;
        try (Stream<Path> s = Files.list(shots)) {
            return s.filter(p -> p.toString().endsWith(".png")).count();
        }
    }

    private static Path newestScreenshot(Minecraft mc) throws Exception {
        Path shots = mc.gameDirectory.toPath().resolve("screenshots");
        if (!Files.isDirectory(shots)) return null;
        try (Stream<Path> s = Files.list(shots)) {
            return s.filter(p -> p.toString().endsWith(".png"))
                .max(Comparator.comparingLong(p -> p.toFile().lastModified())).orElse(null);
        }
    }
}
