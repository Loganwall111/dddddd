package dev.logan.entersift;

import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class RiftApertureTest {
    private boolean cross(double ax, double ay, double az, double bx, double by, double bz) {
        return RiftAperture.crossed(3, 7, 5, ax, ay, az - 0.4837, bx, by, bz - 0.4837);
    }
    @Test void crossesBothDirections() {
        assertTrue(cross(0, 1, -.1, 0, 1, .1));
        assertTrue(cross(0, 1, .1, 0, 1, -.1));
        assertTrue(cross(0, 1, -2, 0, 1, 2)); // fast movement can't skip the plane
    }
    @Test void proximityAndParallelWalkingDoNotTeleport() {
        assertFalse(cross(0, 1, .1, 0, 1, .1));
        assertFalse(cross(-1, 1, .1, 1, 1, .1));
        assertFalse(cross(0, 1, 1, 0, 1, .01));
        assertFalse(cross(0, 1, 0, 0, 1, 0));
    }
    @Test void rejectsOutsideSilhouetteAndInvalidCoordinates() {
        assertFalse(cross(5, 1, -1, 5, 1, 1));
        assertFalse(cross(0, -.1, -1, 0, -.1, 1));
        assertFalse(cross(0, 7, -1, 0, 7, 1));
        assertFalse(cross(-3, 4.8, -1, -3, 4.8, 1)); // empty stepped corner
        assertFalse(cross(Double.NaN, 1, -1, 0, 1, 1));
    }
    @Test void usesIntersectionRatherThanEndpoint() {
        assertTrue(cross(-6, 1, -1, 6, 1, 1));
        assertFalse(cross(-8, 1, -1, 0, 1, 1)); // intersection outside, endpoint inside
    }
    @Test void rotatedRiftsUseTheSamePlaneAsTheRenderer() {
        for (double yaw : new double[]{0, 45, 90, 135, 180, 270, -35}) {
            double angle = Math.toRadians(180 - yaw), sn = Math.sin(angle), cs = Math.cos(angle);
            double front = -0.4837 + 0.1, back = -0.4837 - 0.1;
            assertTrue(RiftAperture.crossedWorld(3, 7, 5, yaw,
                sn * front, 1, cs * front, sn * back, 1, cs * back), "yaw=" + yaw);
            assertFalse(RiftAperture.crossedWorld(3, 7, 5, yaw,
                sn * front, 1, cs * front, cs + sn * front, 1, -sn + cs * front));
        }
    }
    @Test void crossingTheLipIsNotYetCrossingTheWindow() {
        assertFalse(RiftAperture.crossed(3, 7, 5, 0, 1, .1, 0, 1, -.1));
        assertFalse(RiftAperture.crossed(3, 0, 5, 0, 1, -1, 0, 1, 1));
    }
    @Test void boundariesAreHalfOpenAndDetachedBoxesExcluded() {
        assertTrue(RiftAperture.cell(3, 5, 7));
        assertFalse(RiftAperture.cell(3, 10, 7));
        assertFalse(RiftAperture.cell(3, -1, 0));
        assertFalse(RiftAperture.cell(3, 0, 8));
    }
}
