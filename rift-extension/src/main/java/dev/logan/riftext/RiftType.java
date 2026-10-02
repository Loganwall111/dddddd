package dev.logan.riftext;

/**
 * Dimensional variant of a rift. Each type has a unique colour palette and voxel cluster silhouette
 * that matches the Dungeons II trailer references. The id doubles as the destination index for
 * transport (Phase 2).
 */
public enum RiftType {
    /** Leads to the Overworld: golden-yellow edges, stepped staircase cluster (badlands ref). */
    OVERWORLD(0, 0xFFE45C, "overworld"),
    /** Leads to the Nether: emissive dark red #FF3333, aggressive chaotic squares. */
    NETHER(1, 0xFF3333, "nether"),
    /** Leads to the End: violet edges, tall stacked cluster. */
    END(2, 0xC9A2FF, "end"),
    /** Leads to the Sift: emissive pink/white #FFBFE0, the wide jagged cross cluster. */
    SIFT(3, 0xFFBFE0, "sift"),
    /** The ritual portal: large, cyan pixel mosaic. */
    PORTAL(4, 0x8CF6FF, "portal");

    public final int id, edge;
    public final String name;

    RiftType(int id, int edge, String name) {
        this.id = id;
        this.edge = edge;
        this.name = name;
    }

    public static RiftType byId(int id) {
        for (RiftType t : values()) if (t.id == id) return t;
        return SIFT;
    }
}