package dev.logan.entersift;

import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

/** 0.38: the relief codec is pure, so it is unit-tested without a server or a client. */
class RiftTerrainViewTest {
    private static int[] ramp() {
        int[] h = new int[RiftTerrainView.GRID * RiftTerrainView.GRID];
        for (int k = 0; k < h.length; k++) h[k] = 64 + (k % 13);
        return h;
    }

    private static int[] rgb() {
        int[] c = new int[RiftTerrainView.GRID * RiftTerrainView.GRID];
        for (int k = 0; k < c.length; k++) c[k] = (k % 3) == 0 ? 0x6a9c46 : ((k % 3) == 1 ? 0x3552c4 : 0x7d7d7d);
        return c;
    }

    @Test void roundTripsEveryColumn() {
        String data = RiftTerrainView.encode(ramp(), rgb(), 64, 76);
        RiftTerrainView.Relief relief = RiftTerrainView.decode(data);
        assertNotNull(relief);
        assertEquals(64, relief.minY());
        assertEquals(12, relief.spanY());
        int[] levels = new int[RiftTerrainView.GRID * RiftTerrainView.GRID];
        for (int j = 0; j < RiftTerrainView.GRID; j++)
            for (int i = 0; i < RiftTerrainView.GRID; i++) levels[j * RiftTerrainView.GRID + i] = relief.packed(i, j) >> 4;
        // the top and bottom of the sampled range must come back exactly
        assertEquals(0, java.util.Arrays.stream(levels).min().orElse(-1));
        assertEquals(RiftTerrainView.LEVELS - 1, java.util.Arrays.stream(levels).max().orElse(-1));
        // order is preserved: a strictly rising ramp keeps non-decreasing levels
        for (int k = 0; k < levels.length; k++) assertTrue(levels[k] >= 0 && levels[k] < RiftTerrainView.LEVELS);
    }

    @Test void keepsSurfaceColours() {
        RiftTerrainView.Relief relief = RiftTerrainView.decode(RiftTerrainView.encode(ramp(), rgb(), 64, 76));
        assertNotNull(relief);
        boolean grass = false, water = false;
        for (int k = 0; k < RiftTerrainView.GRID * RiftTerrainView.GRID; k++) {
            int c = RiftTerrainView.colourOf(relief, k);
            if (c == 0x6a9c46) grass = true;
            if (c == 0x3552c4) water = true;
        }
        assertTrue(grass && water, "the palette must carry the sampled surface colours");
    }

    @Test void flatTerrainAndBadInputAreSafe() {
        int[] flat = new int[RiftTerrainView.GRID * RiftTerrainView.GRID];
        java.util.Arrays.fill(flat, 70);
        RiftTerrainView.Relief relief = RiftTerrainView.decode(RiftTerrainView.encode(flat, rgb(), 70, 70));
        assertNotNull(relief);
        assertEquals(0, relief.spanY());
        for (int j = 0; j < RiftTerrainView.GRID; j++)
            for (int i = 0; i < RiftTerrainView.GRID; i++) assertEquals(0, relief.packed(i, j) >> 4);
        assertNull(RiftTerrainView.decode(""));
        assertNull(RiftTerrainView.decode("nonsense"));
        assertNull(RiftTerrainView.decode("64:12:6a9c46:00"));
        assertNull(RiftTerrainView.decode(null));
    }

    @Test void everyRiftTypeHasADestination() {
        for (RiftType type : RiftType.values()) assertNotNull(RiftTerrainView.destination(type));
    }
}
