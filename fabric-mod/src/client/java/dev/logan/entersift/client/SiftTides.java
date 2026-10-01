package dev.logan.entersift.client;

import net.minecraft.world.level.Level;

/** Sift-only interpretation of the custom world clock's three named tides. */
final class SiftTides {
    static final long PERIOD = 24_000L;
    static final long FLOW_START = 0L;
    static final long THRIVE_START = 6_000L;
    static final long ENDURE_START = 13_000L;
    /** Outside the Sift, rifts are open from tick 13000 up to (excluding) 23000 of the Overworld clock's day. */
    static final long NIGHT_START = 13_000L;
    static final long NIGHT_END = 23_000L;

    private SiftTides() {}

    /** Reads the dimension's default clock; in the Sift this is entersift:sift, not minecraft:overworld. */
    static long ticks(Level level) {
        return level == null ? 0L : Math.floorMod(level.getDefaultClockTime(), PERIOD);
    }

    static float ticks(Level level, float partialTick) {
        return (ticks(level) + partialTick) % PERIOD;
    }

    static boolean isEndure(long ticks) {
        return Math.floorMod(ticks, PERIOD) >= ENDURE_START;
    }

    static boolean isEndure(float ticks) {
        float phase = ((ticks % PERIOD) + PERIOD) % PERIOD;
        return phase >= ENDURE_START;
    }

    /**
     * Whether rifts are open here right now. Inside the Sift that is Endure on the Sift's own clock. In every
     * other dimension it is night on the Overworld clock: the Nether has no default clock and the End's is not a
     * day cycle, so both follow the Overworld, as the single shared day did before 26.1. The data pack makes the
     * same decision in data/entersift/function/rift/night.mcfunction; keep the two in sync.
     */
    static boolean isRiftNight(Level level, boolean inSift) {
        if (level == null) return false;
        if (inSift) return isEndure(ticks(level));
        long day = Math.floorMod(level.getOverworldClockTime(), PERIOD);
        return day >= NIGHT_START && day < NIGHT_END;
    }

    static String name(long ticks) {
        long t = Math.floorMod(ticks, PERIOD);
        if (t < THRIVE_START) return "Flow";
        if (t < ENDURE_START) return "Thrive";
        return "Endure";
    }
}
