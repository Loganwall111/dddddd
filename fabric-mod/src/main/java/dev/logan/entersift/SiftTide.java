package dev.logan.entersift;

/**
 * 0.22 SIFT TIDES — the three states of the Sift sky. A tide is a time of day AND its skybox, chosen by
 * the player with {@code /sifttide <tide>} instead of following the Overworld clock on its own.
 *
 *  - FLOW: the WAVY interior dome. Bright mint/cyan day sky with a wavy glowing border and arch bands
 *    across the top, an aura round the rim, and floating light squares.
 *  - THRIVE: near night. Rose/magenta sky where thousands of god rays fan out from high above and cover
 *    the screen, with white light squares everywhere.
 *  - LAVA_LAMP: the biome-aware lava-lamp sky the mod shipped with, parked on its night stage (the old
 *    "Day and Night Cycle" look, now opt-in).
 *
 * {@code ticks} is the canonical time of day the tide sets (the Overworld clock drives the Sift timeline),
 * so the data-driven fog/light colours match the tide's skybox instead of fighting it. Because the client
 * derives the tide from the clock bands, each tide's canonical tick MUST sit inside its own band; if you
 * move a tick here, move the band in SiftTideServer.tideOf and SiftTideState with it. tools/test_data.py
 * checks exactly that.
 */
public enum SiftTide {
    FLOW("flow", 0x7FD3CF, 1000),
    THRIVE("thrive", 0xC86A92, 13000),
    LAVA_LAMP("lava_lamp", 0xDB7840, 18000);

    public final String tide;
    public final int colour;
    public final int ticks;

    SiftTide(String tide, int colour, int ticks) { this.tide = tide; this.colour = colour; this.ticks = ticks; }

    /** Accepts "flow", "thrive", "lava_lamp" and the friendly spellings "lava lamp" / "lavalamp". */
    public static SiftTide byName(String name) {
        if (name == null) return null;
        String n = name.toLowerCase(java.util.Locale.ROOT).trim().replace(' ', '_').replace('-', '_');
        if (n.equals("lavalamp") || n.equals("lamp") || n.equals("lava")) n = "lava_lamp";
        if (n.equals("sift") || n.equals("day")) n = "flow";
        if (n.equals("night") || n.equals("god_rays") || n.equals("godrays")) n = "thrive";
        for (SiftTide t : values()) if (t.tide.equals(n)) return t;
        return null;
    }

    public static String names() {
        StringBuilder sb = new StringBuilder();
        for (SiftTide t : values()) { if (sb.length() > 0) sb.append(", "); sb.append(t.tide); }
        return sb.toString();
    }
}
