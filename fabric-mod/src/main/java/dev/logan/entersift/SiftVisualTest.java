package dev.logan.entersift;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.concurrent.atomic.AtomicBoolean;
import net.fabricmc.fabric.api.event.lifecycle.v1.ServerLifecycleEvents;
import net.fabricmc.fabric.api.event.lifecycle.v1.ServerTickEvents;
import net.fabricmc.fabric.api.networking.v1.ServerPlayConnectionEvents;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.level.Level;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/** CI-only scene setup for {@link dev.logan.entersift.client.SiftVisualCapture} (env SIFT_VISUAL_TEST=1). */
final class SiftVisualTest {
    private static final Logger LOGGER = LoggerFactory.getLogger("entersift");
    private static final String PLAYER = "SiftVisualTest";
    private static final String DAY_SIGNAL_ENV = "SIFT_VISUAL_PHASE1_SIGNAL";
    private static final String NIGHT_SIGNAL_ENV = "SIFT_VISUAL_PHASE2_SIGNAL";
    private static final String SIFT = "entersift:the_sift";
    private static int ticks = -1;
    private static boolean sceneReady;
    private static boolean nightPhaseStarted;
    private static boolean siftTeleportSent;

    static void register() {
        if (!"1".equals(System.getenv("SIFT_VISUAL_TEST"))) return;
        LOGGER.info("[SIFT-VISUAL] server harness enabled");
        ServerLifecycleEvents.SERVER_STARTED.register(server -> {
            ticks = 0;
            sceneReady = false;
            nightPhaseStarted = false;
            siftTeleportSent = false;
        });
        ServerPlayConnectionEvents.JOIN.register((handler, sender, server) -> {
            if (!PLAYER.equals(handler.player.getGameProfile().name())) return;
            LOGGER.info("[SIFT-VISUAL] staging {} in the Overworld", PLAYER);
            run(server, "gamemode spectator " + PLAYER);
            run(server, "tp " + PLAYER + " 0.5 140 10.5 180 -14");
        });
        ServerTickEvents.END_SERVER_TICK.register(server -> {
            if (ticks < 0) return;
            ticks++;
            if (ticks == 20) prepareScene(server);
            if (!sceneReady || siftTeleportSent || ticks % 10 != 0) return;
            ServerPlayer player = findPlayer(server);
            if (player == null) return;
            if (!nightPhaseStarted && phaseSignalExists(DAY_SIGNAL_ENV)) {
                LOGGER.info("[SIFT-VISUAL] daytime Rift views captured; switching the Overworld clock to midnight");
                run(server, "execute in minecraft:overworld run time set midnight");
                run(server, "execute in minecraft:overworld run gamerule doDaylightCycle true");
                nightPhaseStarted = true;
            }
            if (nightPhaseStarted && phaseSignalExists(NIGHT_SIGNAL_ENV)) {
                LOGGER.info("[SIFT-VISUAL] night particle view captured; moving player to the Sift");
                run(server, "execute in " + SIFT + " run tp " + PLAYER + " 0.5 140 10.5 180 -14");
                siftTeleportSent = true;
            }
        });
    }

    private static void prepareScene(MinecraftServer server) {
        prepareDimension(server, Level.OVERWORLD.identifier().toString(), 140, "overworld");
        prepareDimension(server, SIFT, 140, "sift");
        boolean overworldRift = hasRift(server, Level.OVERWORLD.identifier().toString());
        boolean siftRift = hasRift(server, SIFT);
        if (!overworldRift || !siftRift) {
            LOGGER.error("[SIFT-VISUAL] FAIL scene entities missing: overworldRift={} siftRift={}", overworldRift, siftRift);
        } else {
            sceneReady = true;
            LOGGER.info("[SIFT-VISUAL] scene ready: grown Sift rifts in Overworld and Sift; player={}", PLAYER);
        }
    }

    private static void prepareDimension(MinecraftServer server, String dimension, int floorY, String label) {
        run(server, "execute in " + dimension + " run forceload add -3 -3 3 3");
        run(server, "execute in " + dimension + " run gamerule doDaylightCycle false");
        run(server, "execute in " + dimension + " run gamerule doWeatherCycle false");
        run(server, "execute in " + dimension + " run time set noon");
        if ("overworld".equals(label)) run(server, "weather clear 1000000");
        run(server, "execute in " + dimension + " positioned 0 140 0 run kill @e[type=!minecraft:player,distance=..64]");
        run(server, "execute in " + dimension + " run fill -16 " + (floorY - 3) + " -16 16 " + (floorY - 2) + " 16 minecraft:dirt");
        run(server, "execute in " + dimension + " run fill -16 " + (floorY - 1) + " -16 16 " + (floorY - 1) + " 16 minecraft:grass_block");
        run(server, "execute in " + dimension + " run summon entersift:rift_portal 0.5 " + floorY + " 0.5 {RiftType:3,Width:6.0f,Height:7.0f,Age:120}");
    }

    private static ServerPlayer findPlayer(MinecraftServer server) {
        for (ServerPlayer player : server.getPlayerList().getPlayers()) {
            if (PLAYER.equals(player.getGameProfile().name())) return player;
        }
        return null;
    }

    private static boolean hasRift(MinecraftServer server, String dimension) {
        AtomicBoolean found = new AtomicBoolean(false);
        var source = server.createCommandSourceStack().withSuppressedOutput()
            .withCallback((success, result) -> found.set(success && result > 0));
        String command = "execute in " + dimension + " positioned 0.5 140 0.5 if entity @e[type=entersift:rift_portal,distance=..4]";
        server.getCommands().performPrefixedCommand(source, command);
        return found.get();
    }

    private static boolean phaseSignalExists(String variable) {
        String value = System.getenv(variable);
        if (value == null || value.isBlank()) return false;
        try {
            return Files.isRegularFile(Path.of(value));
        } catch (RuntimeException error) {
            LOGGER.warn("[SIFT-VISUAL] invalid phase signal path from {}: {}", variable, value, error);
            return false;
        }
    }

    private static void run(MinecraftServer server, String command) {
        LOGGER.info("[SIFT-VISUAL] > {}", command);
        try {
            server.getCommands().performPrefixedCommand(server.createCommandSourceStack().withSuppressedOutput(), command);
        } catch (Throwable error) {
            LOGGER.error("[SIFT-VISUAL] FAIL command threw: " + command, error);
        }
    }

    private SiftVisualTest() {}
}
