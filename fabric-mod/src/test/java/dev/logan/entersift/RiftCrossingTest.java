package dev.logan.entersift;

import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class RiftCrossingTest {
    final RiftShape shape = RiftShape.build(RiftType.SIFT, 42, 7, 5);
    @Test void crossesBothDirections() {
        assertTrue(RiftCrossing.crosses(shape, 0, 1.2, 1, 0, 1.2, -1));
        assertTrue(RiftCrossing.crosses(shape, 0, 1.2, -1, 0, 1.2, 1));
    }
    @Test void nearbyStationaryAndParallelMotionDoNotTrigger() {
        assertFalse(RiftCrossing.crosses(shape, 0, 1.2, 0.2, 0, 1.2, 0.2));
        assertFalse(RiftCrossing.crosses(shape, -1, 1.2, 0.2, 1, 1.2, 0.2));
        assertFalse(RiftCrossing.crosses(shape, 0, 1.2, 1, 0, 1.2, 0.1));
    }
    @Test void missesAboveBelowAndInNotch() {
        assertFalse(RiftCrossing.crosses(shape, 0, 8, 1, 0, 8, -1));
        assertFalse(RiftCrossing.crosses(shape, 0, 0, 1, 0, 0, -1));
        assertFalse(RiftCrossing.crosses(shape, 3, 4.8, 1, 3, 4.8, -1));
    }
    @Test void intersectsSegmentRatherThanOnlyEndPosition() {
        assertTrue(RiftCrossing.crosses(shape, -4, 1.2, 2, 4, 1.2, -2));
        assertFalse(RiftCrossing.crosses(shape, 8, 1.2, 1, 8, 1.2, -1));
    }
}
