package dev.logan.entersift.client;

import dev.logan.entersift.SiftTide;
import net.minecraft.client.Minecraft;

/**
 * 0.22 client side of the Sift tides.
 *
 * The tide IS a clock band, full stop. The server command {@code /sifttide <tide>} parks the Overworld
 * clock (which drives the Sift timeline) on that tide's canonical tick and re-asserts it every 5 seconds
 * while a tide is locked, so the client reads the tide straight off the clock vanilla already syncs: no
 * custom packets, no scoreboard polling, and the skybox can never desync from the fog, light and water
 * colours, which come from that same clock.
 *
 *   ticks     0 -  8500   FLOW        the wavy dome tide (day)
 *   ticks  8500 - 15500   THRIVE      the god-ray tide (evening, near night)
 *   ticks 15500 - 24000   LAVA_LAMP   the shipped lava-lamp sky, its night stage
 *
 * Those bands are the contract: SiftTide's canonical ticks are checked against them by tools/test_data.py
 * and the server mirrors the same bands in SiftTideServer.tideOf, so both sides always answer alike.
 */
public final class SiftTideState {
    private SiftTideState() {}

    private static SiftTide last = SiftTide.LAVA_LAMP;

    /** Ticks inside the 24000-tick day, or -1 when no level is loaded. */
    public static float clockTick() {
        Minecraft mc = Minecraft.getInstance();
        if (mc.level == null) return -1f;
        return mc.level.getOverworldClockTime() % 24000L;
    }

    /** The tide the Sift is showing right now. */
    public static SiftTide tide() {
        float t = clockTick();
        if (t < 0f) return last;
        last = of(t);
        return last;
    }

    /** The band lookup, kept in step with {@code SiftTideServer.tideOf(long)}. */
    public static SiftTide of(float tick) {
        if (tick < 8500f) return SiftTide.FLOW;
        if (tick < 15500f) return SiftTide.THRIVE;
        return SiftTide.LAVA_LAMP;
    }
}
