package dev.logan.entersift;

/**
 * Pure swept test against the rift's FRONT plane, sharing the renderer's silhouette.
 *
 * 0.37: crossing used to happen at each cell's own recess depth. That was fine while the recesses were
 * shallow (0.60), but the rift is now a genuinely thick volume (cell backs run 0.62..1.10 behind the
 * lip), and the crossing point slides backwards with them: on a diagonal approach the player's swept
 * segment met the deep plane so far along the segment that the intersection landed OUTSIDE the
 * silhouette, so a player could walk through the middle of the rift and never cross
 * (`RiftCrossingTest.intersectsSegmentRatherThanOnlyEndPosition` is exactly that case, and the Gradle
 * suite caught it). The portal surface is therefore the opening PLANE, independent of how deep the
 * membrane artwork sits: walk into the silhouette and you cross. No proximity activation.
 */
public final class RiftCrossing {
    private RiftCrossing() {}
    public static boolean crosses(RiftShape shape, double ax, double ay, double az,
                                  double bx, double by, double bz) {
        if (az == bz) return false;
        for (int i = 0; i < shape.cols; i++) for (int j = 0; j < shape.rows; j++) {
            if (!shape.on(i, j)) continue;
            if (az * bz > 0) continue;                 // the segment does not cross z = 0
            double t = az / (az - bz);
            double x = ax + (bx - ax) * t, y = ay + (by - ay) * t;
            if (x >= shape.x(i) && x < shape.x(i + 1) && y >= shape.y(j) && y < shape.y(j + 1)) return true;
        }
        return false;
    }
}
