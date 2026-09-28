package dev.logan.entersift;

/**
 * Dimensional variant of a rift. The id equals the travel target used by the data pack
 * (rift marker score sift.target / travel/destination_N), so the colour tells you where it leads.
 */
public enum RiftType {
    /** Leads to the overworld: golden-yellow edges, stepped staircase cluster (badlands ref). */
    OVERWORLD(0, 0xFFE45C, "overworld"),
    /** Leads to the Nether: emissive dark red #FF3333, aggressive chaotic squares. */
    NETHER(1, 0xFF3333, "nether"),
    /** Leads to the End: violet edges, tall stacked cluster. */
    END(2, 0xC9A2FF, "end"),
    /** Leads to the Sift: emissive pink/white #FFBFE0, the wide jagged puzzle cluster. */
    SIFT(3, 0xFFBFE0, "sift"),
    /** The ritual portal into the Sift: large, cyan pixel mosaic. */
    PORTAL(4, 0x8CF6FF, "portal");

    public final int id, edge;
    public final String name;

    RiftType(int id, int edge, String name) { this.id = id; this.edge = edge; this.name = name; }

    public static RiftType byId(int id) {
        for (RiftType t : values()) if (t.id == id) return t;
        return SIFT;
    }
}
