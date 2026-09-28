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
        "ruined_arch", "ribcage", "crystals", "soul_salt", "flowers", "sift_grass", "glow_bulb", "sift_coral_red", "sift_coral_yellow",
        "giant_skull", "bone_tusk", "coral_tree", "titan_crag", "crag_spire", "crag_boulder", "crag_tree"};
    private static final String[] BIOMES = {"carapace", "singer_meadow", "saltwound_expanse", "rose_spires", "pale_grove", "tidepool_reef", "boneyard", "coral_expanse", "titan_crags"};

    static void register() {
        if (!"1".equals(System.getenv("SIFT_SMOKE"))) return;
        EnterTheSift.LOGGER.info("SIFT-SMOKE enabled");
        ServerLifecycleEvents.SERVER_STARTED.register(server -> ticks = 0);
        ServerTickEvents.END_SERVER_TICK.register(server -> {
            if (ticks < 0) return;
            ticks++;
            if (ticks == 20) stageOne(server);
            if (ticks == 120) stageTwo(server);
            if (ticks == 140) checkAnchors(server);
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
            // Plants need soil, like in real terrain: give every feature a little grass pad.
            run(server, "execute in entersift:the_sift run fill " + (x - 2) + " 199 18 " + (x + 2) + " 199 22 minecraft:grass_block");
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
        // Client-rendered rifts/portals: the invisible anchor display must actually spawn.
        run(server, "execute in entersift:the_sift unless entity @e[type=minecraft:block_display,tag=sift.rift_anchor] run say SIFT-SMOKE FAIL rift anchor missing");
        run(server, "execute in entersift:the_sift positioned 30 140 -20 run function entersift:portal/visual {sx:4.0f,sy:4.0f,sz:0.07f,tx:-2.0f,tz:-0.035f,pw:4.0f,yaw:0.0f}");
        run(server, "execute in entersift:the_sift positioned 30 140 -20 unless entity @e[type=minecraft:block_display,tag=sift.portal_anchor,distance=..1] run say SIFT-SMOKE FAIL portal anchor missing");
        for (SiftKind kind : SiftKind.values())
            run(server, "execute in entersift:the_sift store result score #smoke_" + kind.id + " sift.clock if entity @e[type=entersift:" + kind.id + "]");
        run(server, "scoreboard players list");
    }

    /** Rifts and portals are RiftPortalEntity instances (0.10); they must exist with the right variant. */
    private static void checkAnchors(MinecraftServer server) {
        int rifts = 0, portals = 0, wrong = 0;
        for (net.minecraft.server.level.ServerLevel level : server.getAllLevels())
            for (net.minecraft.world.entity.Entity e : level.getAllEntities()) {
                if (!(e instanceof RiftPortalEntity rift)) continue;
                if (e.entityTags().contains("sift.rift_anchor")) { if (rift.riftType() != RiftType.PORTAL) rifts++; else wrong++; }
                if (e.entityTags().contains("sift.portal_anchor")) { if (rift.riftType() == RiftType.PORTAL) portals++; else wrong++; }
            }
        EnterTheSift.LOGGER.info("SIFT-SMOKE anchors: rifts={} portals={} wrongType={}", rifts, portals, wrong);
        if (rifts == 0 || portals == 0 || wrong > 0)
            EnterTheSift.LOGGER.error("SIFT-SMOKE FAIL rift_portal entities: rifts={} portals={} wrongType={}", rifts, portals, wrong);
    }

    private SiftSmokeTest() {}
}
