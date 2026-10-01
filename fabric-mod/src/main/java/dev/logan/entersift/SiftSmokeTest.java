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
            // 0.16: the arena chunks are force-loaded first and built 80 ticks later (a slow runner may not
            // have generated them in the same tick), and the portal gets ~200 ticks of slack after opening.
            if (ticks == 30) forceRitualChunks(server);
            if (ticks == 110) buildRitual(server);
            if (ticks == 130) playRitual(server);
            if (ticks == 680) checkRitual(server);
            if (ticks == 700) {
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
        // 0.25 rifts are gated to the local window (night, or Endure inside the Sift), so move both clocks
        // into place and prove that the gate refuses daytime rifts before one is allowed to open.
        run(server, "time of minecraft:overworld set 6000");
        run(server, "execute in minecraft:overworld store result score #smoke_gate sift.clock run function entersift:rift/gate");
        run(server, "execute if score #smoke_gate sift.clock matches 1 run say SIFT-SMOKE FAIL rift gate allowed a rift at noon");
        run(server, "time of minecraft:overworld set 13000");
        run(server, "execute in entersift:the_sift run time of entersift:sift set 6000");
        run(server, "execute in entersift:the_sift store result score #smoke_gate sift.clock run function entersift:rift/gate");
        run(server, "execute if score #smoke_gate sift.clock matches 1 run say SIFT-SMOKE FAIL rift gate allowed a Thrive rift");
        run(server, "execute in entersift:the_sift run time of entersift:sift set 13000");
        run(server, "execute in entersift:the_sift store result score #smoke_gate sift.clock run function entersift:rift/gate");
        run(server, "execute if score #smoke_gate sift.clock matches 0 run say SIFT-SMOKE FAIL rift gate blocked Endure");
        run(server, "execute in entersift:the_sift positioned 10 140 -20 run function entersift:rift/natural");
        run(server, "execute in minecraft:overworld positioned 0 100 0 run function entersift:rift/natural");
        run(server, "execute in entersift:the_sift run function entersift:world/tick");
        // Client-rendered rifts/portals: the invisible anchor display must actually spawn.
        run(server, "execute in entersift:the_sift unless entity @e[type=entersift:rift_portal,tag=sift.rift_anchor] run say SIFT-SMOKE FAIL rift anchor missing");
        run(server, "execute in minecraft:overworld unless entity @e[type=entersift:rift_portal,tag=sift.rift_anchor] run say SIFT-SMOKE FAIL overworld rift anchor missing");
        // Arrival landings are surface-based: the origin chunks must be loaded, and the plaza the players
        // arrive on (with its return gate + anchor) must build. Built in the air at y=100 in the smoke world.
        for (String dim : new String[]{"minecraft:overworld", "minecraft:the_nether", "minecraft:the_end", "entersift:the_sift"})
            run(server, "execute in " + dim + " unless loaded 0 64 0 run say SIFT-SMOKE FAIL origin chunk not loaded in " + dim);
        run(server, "execute in minecraft:overworld positioned 0 100 0 run function entersift:travel/plaza");
        run(server, "execute in minecraft:overworld positioned 0 100 0 unless entity @e[type=minecraft:marker,tag=sift.return_gate,distance=..4] run say SIFT-SMOKE FAIL arrival plaza has no return gate");
        run(server, "execute in entersift:the_sift positioned 30 140 -20 run function entersift:portal/visual {sx:4.0f,sy:4.0f,sz:0.07f,tx:-2.0f,tz:-0.035f,pw:4.0f,yaw:0.0f}");
        run(server, "execute in entersift:the_sift positioned 30 140 -20 unless entity @e[type=entersift:rift_portal,tag=sift.portal_anchor,distance=..1] run say SIFT-SMOKE FAIL portal anchor missing");
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

    // ------------------------------------------------------------------ ritual (0.14.1)
    // The dev arena layout in the Overworld: a 10x7 reinforced deepslate frame and eight note blocks on
    // sonorous deepslate tuned to pitches 1..8, left to right. The guardian is marked as defeated.
    private static final int RX = 4000, RY = -40, RZ = 4000;

    private static void forceRitualChunks(MinecraftServer server) {
        run(server, "execute in minecraft:overworld run forceload add " + (RX - 16) + " " + (RZ - 16) + " " + (RX + 16) + " " + (RZ + 16));
    }

    private static void buildRitual(MinecraftServer server) {
        String in = "execute in minecraft:overworld run ";
        boolean loaded = server.overworld().isLoaded(new net.minecraft.core.BlockPos(RX, RY, RZ + 7));
        EnterTheSift.LOGGER.info("SIFT-SMOKE ritual arena loaded before build: {}", loaded);
        run(server, in + "forceload add " + (RX - 16) + " " + (RZ - 16) + " " + (RX + 16) + " " + (RZ + 16));
        run(server, in + "fill " + (RX - 8) + " " + (RY - 1) + " " + (RZ - 4) + " " + (RX + 8) + " " + (RY + 9) + " " + (RZ + 12) + " minecraft:air");
        run(server, in + "fill " + (RX - 6) + " " + (RY - 1) + " " + (RZ - 2) + " " + (RX + 6) + " " + (RY - 1) + " " + (RZ + 10) + " entersift:salt");
        run(server, in + "fill " + (RX - 5) + " " + RY + " " + (RZ + 7) + " " + (RX + 5) + " " + (RY + 7) + " " + (RZ + 7) + " minecraft:reinforced_deepslate");
        run(server, in + "fill " + (RX - 4) + " " + (RY + 1) + " " + (RZ + 7) + " " + (RX + 4) + " " + (RY + 6) + " " + (RZ + 7) + " minecraft:air");
        for (int k = 0; k < 8; k++) {
            run(server, in + "setblock " + (RX - 4 + k) + " " + RY + " " + RZ + " entersift:sonorous_deepslate");
            run(server, in + "setblock " + (RX - 4 + k) + " " + (RY + 1) + " " + RZ + " minecraft:note_block[note=" + k + "]");
        }
        // Frame centre = bottom-left rim (RX-5, RY, RZ+7) + half the width along X.
        run(server, in + "summon minecraft:marker " + (RX + 0.5) + " " + (RY + 1.0) + " " + (RZ + 7.5) + " {Tags:[\"sift.encounter\",\"sift.ready\"]}");
    }

    private static void playRitual(MinecraftServer server) {
        net.minecraft.server.level.ServerLevel level = server.overworld();
        for (int pitch : RitualSequence.ORDER) {
            net.minecraft.core.BlockPos pos = new net.minecraft.core.BlockPos(RX - 4 + pitch - 1, RY + 1, RZ);
            EnterTheSift.strike(level, pos, null);
            EnterTheSift.strike(level, pos, null); // a real click can reach the server twice: must not reset
        }
    }

    private static void checkRitual(MinecraftServer server) {
        net.minecraft.server.level.ServerLevel level = server.overworld();
        boolean portalMarker = false, portalAnchor = false;
        for (net.minecraft.world.entity.Entity e : level.getAllEntities()) {
            if (e.distanceToSqr(RX + 0.5, RY + 1.0, RZ + 7.5) > 4) continue;
            if (e.entityTags().contains("sift.portal")) portalMarker = true;
            if (e instanceof RiftPortalEntity && e.entityTags().contains("sift.portal_anchor")) portalAnchor = true;
        }
        boolean ritualMarker = false;
        for (net.minecraft.world.entity.Entity e : level.getAllEntities())
            if (e.distanceToSqr(RX + 0.5, RY + 1.0, RZ + 7.5) <= 4 && e.entityTags().contains("sift.ritual")) ritualMarker = true;
        // 0.17: the open portal is a block portal; filling the frame retires the old anchor entity.
        boolean portalBlocks = false;
        for (int y = RY + 1; y <= RY + 6; y++) {
            var st = level.getBlockState(new net.minecraft.core.BlockPos(RX, y, RZ + 7));
            if (st.is(SiftContent.SIFT_PORTAL) || st.is(SiftContent.SIFT_PORTAL_BASE)) portalBlocks = true;
        }
        EnterTheSift.LOGGER.info("SIFT-SMOKE ritual: portalMarker={} portalAnchor={} portalBlocks={} stillOpening={} frameBlock={}", portalMarker, portalAnchor,
            portalBlocks, ritualMarker, level.getBlockState(new net.minecraft.core.BlockPos(RX - 5, RY, RZ + 7)));
        if (!portalMarker || !(portalAnchor || portalBlocks))
            EnterTheSift.LOGGER.error("SIFT-SMOKE FAIL ritual 1,3,7,6,5,2,4,8 did not open the portal (marker={}, anchor={})", portalMarker, portalAnchor);
    }

    private SiftSmokeTest() {}
}
