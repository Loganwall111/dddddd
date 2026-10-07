package dev.logan.beyond.math;

/**
 * The Scale Prism ladder. This is deliberately enormous rather than "a block and a tree":
 * the smallest rung is 1/1024 of a player and the largest is 4096x, which is taller than the
 * build limit. Physics safety scales with the body (see {@link #maximumTickTravel(double)}),
 * because a body a thousand times smaller than a block cannot use normal gravity steps.
 */
public final class ScaleLadder {
    public static final double MIN = 1.0 / 1024.0;
    public static final double MAX = 4096.0;
    /** Beyond this size the "is there room?" test switches from a full volume scan to a sampled scan. */
    public static final double FULL_SCAN_LIMIT = 16.0;
    /** Below this size a body moves in reduced steps so it cannot tunnel through a single block. */
    public static final double MICRO_LIMIT = 1.0 / 4.0;
    public static final double[] RUNGS = {MIN, 1 / 256d, 1 / 64d, 1 / 16d, 1 / 4d, 1 / 2d, 1, 2, 8, 32, 128, 512, 2048, MAX};
    private ScaleLadder() {}

    public static boolean valid(double scale) { return Double.isFinite(scale) && scale >= MIN && scale <= MAX; }

    public static double clamp(double scale) { return !Double.isFinite(scale) ? 1 : Math.clamp(scale, MIN, MAX); }

    /** The next rung strictly above {@code current} (saturating at MAX). */
    public static double grow(double current) {
        for (double rung : RUNGS) if (rung > current * 1.001) return rung;
        return MAX;
    }

    /** The next rung strictly below {@code current} (saturating at MIN). */
    public static double shrink(double current) {
        double best = MIN;
        for (double rung : RUNGS) if (rung < current * 0.999) best = rung; else break;
        return best;
    }

    public static String describe(double scale) {
        if (scale >= 1) return (scale == Math.rint(scale) ? String.valueOf((long) scale) : String.valueOf(scale)) + "×";
        return "1/" + Math.round(1 / scale) + "×";
    }

    /**
     * A micro body's per-tick travel is capped to a fraction of its own height, which is what stops
     * a 1/1024x player from skipping an entire block per gravity step. Returns {@code null} when the
     * body is large enough for vanilla physics to be safe.
     */
    public static Double maximumTickTravel(double scale) {
        if (scale >= MICRO_LIMIT) return null;
        double height = 1.8 * scale;
        return Math.max(0.0025, height * 0.4);
    }
}
