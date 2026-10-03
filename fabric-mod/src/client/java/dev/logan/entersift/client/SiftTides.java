package dev.logan.entersift.client;

import dev.logan.entersift.SiftTimeState;
import net.minecraft.world.level.Level;

/** Sift-only interpretation of the custom world clock's three named tides, bridged with {@link SiftTimeState}. */
public final class SiftTides {
    public static final long PERIOD = 24_000L;
    public static final long FLOW_START = 0L;
    public static final long THRIVE_START = 6_000L;
    public static final long ENDURE_START = 13_000L;

    private SiftTides() {}

    /** Reads the dimension's default clock; in the Sift this is entersift:sift, not minecraft:overworld. */
    public static long ticks(Level level) {
        if (SiftTimeState.isLocked()) {
            return SiftTimeState.getIndependentClockTicks(0f);
        }
        long t = level == null ? 0L : Math.floorMod(level.getDefaultClockTime(), PERIOD);
        if (level != null && level.dimension().identifier().toString().startsWith("entersift:")) {
            SiftTimeState.observeClockTicks(t);
        }
        return t;
    }

    public static float ticks(Level level, float partialTick) {
        if (SiftTimeState.isLocked()) {
            return SiftTimeState.getIndependentClockFloat(partialTick);
        }
        return (ticks(level) + partialTick) % PERIOD;
    }

    public static SiftTimeState.Parameters parameters(Level level) {
        if (level != null) {
            ticks(level);
        }
        return SiftTimeState.currentParameters();
    }

    public static boolean isEndure(long ticks) {
        return Math.floorMod(ticks, PERIOD) >= ENDURE_START;
    }

    public static boolean isEndure(float ticks) {
        float phase = ((ticks % PERIOD) + PERIOD) % PERIOD;
        return phase >= ENDURE_START;
    }

    public static String name(long ticks) {
        long t = Math.floorMod(ticks, PERIOD);
        if (t < THRIVE_START) return "Flow";
        if (t < ENDURE_START) return "Thrive";
        return "Endure";
    }
}
