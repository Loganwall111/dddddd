package dev.logan.entersift;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import net.fabricmc.loader.api.FabricLoader;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.level.ServerLevel;

/**
 * 0.22 server side of the Sift tides.
 *
 * Until now the Sift followed the Overworld clock on its own ("Day and Night Cycle"), so the skybox could
 * not be chosen. A tide is now an explicit, persisted state, changed with {@code /sifttide <tide>}:
 *
 *  - the command parks the Overworld clock (which drives the Sift timeline) on the tide's canonical tick
 *    and, while the tide is LOCKED, re-asserts it every 5 seconds, so the Sift stays in that tide instead
 *    of drifting through the day;
 *  - the client reads the tide back off that clock (the bands in {@link #tideOf}), so the two sides can
 *    never disagree — which is why every tide's canonical tick must fall inside its own band;
 *  - {@code /sifttide cycle on} releases the lock, and the sky follows the clock again (the old behaviour);
 *  - {@code /sifttide cycle off} locks to whichever tide the clock is currently in.
 *
 * Because the tide is a pure function of the synced clock, every player sees the same skybox without a
 * single custom packet. The state is stored in {@code config/entersift-tide.txt}.
 */
public final class SiftTideServer {
    private SiftTideServer() {}

    private static SiftTide tide = SiftTide.LAVA_LAMP;
    private static boolean locked;
    /** The tick the lock holds the clock at. Usually {@link SiftTide#ticks}, but {@code /sifttide time}
     *  can park it anywhere, which is how you walk a tide through its own stages. */
    private static long lockedTick = SiftTide.LAVA_LAMP.ticks;
    private static long ticks;
    private static boolean loaded;

    public static SiftTide tide() { return tide; }
    public static boolean locked() { return locked; }
    public static long lockedTick() { return lockedTick; }

    /** The tide the given clock tick falls in (same bands as the client state). */
    public static SiftTide tideOf(long clockTick) {
        long t = ((clockTick % 24000L) + 24000L) % 24000L;
        if (t < 8500L) return SiftTide.FLOW;
        if (t < 15500L) return SiftTide.THRIVE;
        return SiftTide.LAVA_LAMP;
    }

    /** Sets the tide: 0 = lock it (and set the time), 1 = go back to the free-running cycle. */
    public static void set(ServerLevel level, SiftTide newTide) {
        tide = newTide;
        locked = true;
        lockedTick = newTide.ticks;
        apply(level);
        save();
    }

    public static void setCycling(ServerLevel level, boolean cycling) {
        locked = !cycling;
        if (locked) {
            lockedTick = level.getOverworldClockTime();
            tide = tideOf(lockedTick);
        }
        apply(level);
        save();
    }

    /**
     * Sets the time of day directly (the same clock the Sift sky reads) and adopts the tide of that time,
     * so the server's idea of the tide keeps matching the skybox the client derives from the clock.
     * Returns the tide the clock now sits in.
     */
    public static SiftTide setTime(ServerLevel level, long dayTime) {
        SiftTide now = tideOf(dayTime);
        if (locked) lockedTick = dayTime;
        tide = now;
        run(level, "time set " + dayTime);
        save();
        return now;
    }

    /** Pushes the current tide into the world: sets the clock when locked. */
    private static void apply(ServerLevel level) {
        if (locked && tide != null) run(level, "time set " + lockedTick);
    }

    /** Called every server tick; re-asserts the clock while a tide is locked (every 100 ticks). */
    public static void tick(MinecraftServer server) {
        if (!loaded) { load(); loaded = true; }
        if (++ticks % 100L != 0L || !locked || tide == null) return;
        ServerLevel level = server.overworld();
        if (level != null) run(level, "time set " + lockedTick);
    }

    /** Called every server tick: snaps the clock back if another mod or {@code /time} moved it while a
     *  tide is locked (the 5-second re-assert alone would let the sky wander up to 100 ticks off). */
    public static void syncIfDrifted(ServerLevel level) {
        if (!locked || tide == null) return;
        long t = ((level.getOverworldClockTime() % 24000L) + 24000L) % 24000L;
        long want = ((lockedTick % 24000L) + 24000L) % 24000L;
        if (Math.abs(t - want) > 40L) run(level, "time set " + lockedTick);
    }

    private static void run(ServerLevel level, String command) {
        level.getServer().getCommands().performPrefixedCommand(
            level.getServer().createCommandSourceStack().withSuppressedOutput(), command);
    }

    // ------------------------------------------------------------------ persistence

    private static Path file() { return FabricLoader.getInstance().getConfigDir().resolve("entersift-tide.txt"); }

    private static void load() {
        Path p = file();
        try {
            if (!Files.isRegularFile(p)) return;
            for (String line : Files.readAllLines(p)) {
                int eq = line.indexOf('=');
                if (eq <= 0) continue;
                String k = line.substring(0, eq).trim(), v = line.substring(eq + 1).trim();
                if (k.equals("tide")) { SiftTide t = SiftTide.byName(v); if (t != null) tide = t; }
                if (k.equals("locked")) locked = Boolean.parseBoolean(v);
                if (k.equals("tick")) { try { lockedTick = Long.parseLong(v); } catch (NumberFormatException ignored) { } }
            }
        } catch (IOException error) {
            EnterTheSift.LOGGER.warn("[Sift] could not read {}", p, error);
        }
    }

    private static void save() {
        Path p = file();
        try {
            Files.createDirectories(p.getParent());
            Files.writeString(p, "# Enter the Sift tide (0.22). tide = " + SiftTide.names() + ", locked = true|false\n"
                + "tide=" + (tide == null ? "lava_lamp" : tide.tide) + "\nlocked=" + locked + "\ntick=" + lockedTick + "\n");
        } catch (IOException error) {
            EnterTheSift.LOGGER.warn("[Sift] could not write {}", p, error);
        }
    }
}
