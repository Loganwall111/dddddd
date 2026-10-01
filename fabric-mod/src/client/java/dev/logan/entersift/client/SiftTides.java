package dev.logan.entersift.client;

import net.minecraft.world.level.Level;

/** Sift-only interpretation of the custom world clock's three named tides. */
final class SiftTides {
    static final long PERIOD = 24_000L;
    static final long FLOW_START = 0L;
    static final long THRIVE_START = 6_000L;
    static final long ENDURE_START = 13_000L;

    private SiftTides() {}

    /** Reads the dimension's default clock; in the Sift this is entersift:sift, not minecraft:overworld. */
    static long ticks(Level level) {
        return level == null ? 0L : Math.floorMod(level.getDefaultClockTime(), PERIOD);
    }

    static float ticks(Level level, float partialTick) {
        return ticks(level) + partialTick;
    }

    static boolean isEndure(long ticks) {
        return Math.floorMod(ticks, PERIOD) >= ENDURE_START;
    }

    static boolean isEndure(float ticks) {
        return ticks >= ENDURE_START && ticks < PERIOD;
    }

    static String name(long ticks) {
        long t = Math.floorMod(ticks, PERIOD);
        if (t < THRIVE_START) return "Flow";
        if (t < ENDURE_START) return "Thrive";
        return "Endure";
    }
}
