package dev.logan.entersift.client;

import dev.logan.entersift.SiftTide;
import net.minecraft.client.Minecraft;

/**
 * 0.22 client side of the Sift tides.
 *
 * The tide is a function of the SIFT CLOCK: the server command {@code /sifttide <tide>} parks the
 * Overworld clock (which drives the Sift timeline) on that tide's canonical tick and keeps it there while
 * a tide is locked, so the client can read the tide straight off the clock that vanilla already syncs.
 * No custom packets, no scoreboard polling — and the skybox can never desync from the fog and light
 * colours, because both come from the same clock.
 *
 *   ticks     0 -  8500   FLOW        the wavy dome tide (day)
 *   ticks  8500 - 15500   THRIVE      the god-ray tide (evening, near night)
 *   ticks 15500 - 24000   LAVA_LAMP   the shipped lava-lamp night sky
 *
 * {@link #set} lets a server message (or a future sync) force a tide; with {@link #locked} set, the
 * forced tide wins over the clock until the server says otherwise.
 */
public final class SiftTideState {
    private SiftTideState() {}

    private static SiftTide forced;
    private static boolean locked;
    private static SiftTide last = SiftTide.LAVA_LAMP;

    /** Ticks inside the 24000-tick day, or -1 when no level is loaded. */
    public static float clockTick() {
        Minecraft mc = Minecraft.getInstance();
        if (mc.level == null) return -1f;
        return mc.level.getOverworldClockTime() % 24000L;
    }

    /** The tide the Sift is showing right now. */
    public static SiftTide tide() {
        if (locked && forced != null) return forced;
        float t = clockTick();
        if (t < 0f) return last;
        if (t < 8500f) return SiftTide.FLOW;
        if (t < 15500f) return SiftTide.THRIVE;
        return SiftTide.LAVA_LAMP;
    }

    /** Forces (or releases) a tide. Called by {@code /sifttide} feedback and by the server sync. */
    public static void set(SiftTide tide, boolean lock) {
        forced = tide;
        locked = lock;
        if (tide != null) last = tide;
    }

    /** 0..1 progress of the tide's own animation, so effects keep moving even while the clock is parked. */
    public static float anim(float seconds) { return seconds; }
}
