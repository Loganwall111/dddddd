package dev.logan.entersift;

import net.fabricmc.fabric.api.event.lifecycle.v1.ServerLifecycleEvents;
import net.fabricmc.fabric.api.event.lifecycle.v1.ServerTickEvents;
import net.minecraft.server.MinecraftServer;

/**
 * CI-only runtime smoke test (enabled with env SIFT_SMOKE=1). Boots a real dedicated server, then
 * exercises the data pack: loads Sift chunks (worldgen + features), places every custom feature,
 * summons every creature, locates every biome and runs the core functions. Any registry/codec/
 * command problem shows up in the server log, which tools/smoke_report.py turns into CI errors.
 */
final class SiftSmokeTest {
    private static int ticks = -1;

    private static final String[] FEATURES = {"rose_spire", "rose_arch", "pale_tree", "reef_boulder", "weeping_soul_tree",
        "ruined_arch", "ribcage", "crystals", "soul_salt", "flowers", "sift_grass", "glow_bulb", "sift_coral_red", "sift_coral_yellow"};
    private static final String[] BIOMES = {"carapace", "singer_meadow", "saltwound_expanse", "rose_spires", "pale_grove", "tidepool_reef"};

    static void register() {
        if (!"1".equals(System.getenv("SIFT_SMOKE"))) return;
        EnterTheSift.LOGGER.info("SIFT-SMOKE enabled");
        ServerLifecycleEvents.SERVER_STARTED.register(server -> ticks = 0);
        ServerTickEvents.END_SERVER_TICK.register(server -> {
            if (ticks < 0) return;
            ticks++;
            if (ticks == 20) stageOne(server);
            if (ticks == 120) stageTwo(server);
            if (ticks == 260) {
                EnterTheSift.LOGGER.info("SIFT-SMOKE DONE");
                server.halt(false);
            }
        });
    }

    private static void run(MinecraftServer server, String command) {
        EnterTheSift.LOGGER.info("SIFT-SMOKE > {}", command);
        try {
            server.getCommands().performPrefixedCommand(server.createCommandSourceStack(), command);
        } catch (Throwable error) {
            EnterTheSift.LOGGER.error("SIFT-SMOKE FAIL command threw: " + command, error);
        }
    }

    private static void stageOne(MinecraftServer server) {
        run(server, "execute in entersift:the_sift run forceload add -48 -48 48 48");
        for (String biome : BIOMES) run(server, "execute in entersift:the_sift positioned 0 100 0 run locate biome entersift:" + biome);
        run(server, "function entersift:tick");
        run(server, "function entersift:world/pulse");
    }

    private static void stageTwo(MinecraftServer server) {
        int x = -40;
        for (String feature : FEATURES) {
            run(server, "execute in entersift:the_sift run place feature entersift:" + feature + " " + x + " 200 20");
            x += 6;
        }
        x = -40;
        for (SiftKind kind : SiftKind.values()) {
            run(server, "execute in entersift:the_sift run summon entersift:" + kind.id + " " + x + " 140 -20 {PersistenceRequired:1b}");
            x += 8;
        }
        run(server, "execute in entersift:the_sift positioned 0 140 -20 run function entersift:creature/twisted_warden/spawn");
        run(server, "execute in entersift:the_sift positioned 10 140 -20 run function entersift:rift/natural");
        run(server, "execute in entersift:the_sift run function entersift:world/tick");
        for (SiftKind kind : SiftKind.values())
            run(server, "execute in entersift:the_sift store result score #smoke_" + kind.id + " sift.clock if entity @e[type=entersift:" + kind.id + "]");
        run(server, "scoreboard players list");
    }

    private SiftSmokeTest() {}
}
