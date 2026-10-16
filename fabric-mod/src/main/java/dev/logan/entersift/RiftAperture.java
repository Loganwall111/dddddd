package dev.logan.entersift;

/** Shared render/crossing silhouette. Detached ornaments are deliberately not travel apertures. */
public final class RiftAperture {
    public static final float BASE = 0.25f;
    private RiftAperture() {}

    public static boolean cell(int type, int i, int j) {
        if (i < 0 || i >= 11 || j < 0 || j >= 8) return false;
        return switch (type) {
            case 1 -> (i >= 2 && i <= 8 && j <= 5)
                || (j >= 6 && (i == 3 || i == 4 || i == 6 || i == 7))
                || (j >= 1 && j <= 3 && (i == 1 || i == 9));
            case 2 -> (i >= 2 && i <= 8 && j <= 5)
                || (j >= 6 && (i == 2 || i == 4 || i == 5 || i == 7))
                || (i == 1 && (j == 2 || j == 5)) || (i == 9 && (j == 1 || j == 3 || j == 4));
            default -> (i == 5 && j >= 6) || (i >= 3 && i <= 7 && j <= 5)
                || (i <= 9 && j >= 2 && j <= 3) || (i >= 1 && i <= 2 && j <= 1);
        };
    }

    /** Segment/plane crossing, in the same local coordinates as the render mesh. No radius trigger. */
    public static boolean crossed(int type, double width, double height,
                                  double ax, double ay, double az, double bx, double by, double bz) {
        if (!Double.isFinite(ax + ay + az + bx + by + bz)) return false;
        if (az == bz || !((az < 0 && bz >= 0) || (az > 0 && bz <= 0))) return false;
        double t = -az / (bz - az);
        double x = ax + (bx - ax) * t, y = ay + (by - ay) * t;
        int i = (int) Math.floor((x / width + 0.5) * 11);
        int j = (int) Math.floor((y - BASE) / height * 8);
        return cell(type, i, j);
    }
}
