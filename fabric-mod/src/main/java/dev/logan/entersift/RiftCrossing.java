package dev.logan.entersift;

/** Pure swept membrane test, shared silhouette with the renderer. No proximity activation. */
public final class RiftCrossing {
    private RiftCrossing() {}
    public static boolean crosses(RiftShape shape, double ax, double ay, double az,
                                  double bx, double by, double bz) {
        if (az == bz) return false;
        for (int i = 0; i < shape.cols; i++) for (int j = 0; j < shape.rows; j++) {
            if (!shape.on(i, j)) continue;
            double from = az + shape.d(i, j), to = bz + shape.d(i, j);
            if (from == 0 || from * to > 0) continue;
            double t = from / (from - to);
            double x = ax + (bx - ax) * t, y = ay + (by - ay) * t;
            if (x >= shape.x(i) && x < shape.x(i + 1) && y >= shape.y(j) && y < shape.y(j + 1)) return true;
        }
        return false;
    }
}
