package dev.logan.entersift;

/** Shared aperture geometry. A rift is a plane, never a proximity sphere. */
public final class RiftCrossing {
    public static final float BASE = 0.25f;
    private RiftCrossing() {}

    public static boolean cell(RiftType type, int i, int j) {
        if (i < 0 || i >= 11 || j < 0 || j >= 8) return false;
        return switch (type) {
            case SIFT, OVERWORLD -> (i == 5 && j >= 6)
                || (i >= 3 && i <= 7 && j <= 5)
                || (i <= 9 && j >= 2 && j <= 3)
                || (i >= 1 && i <= 2 && j <= 1);
            case NETHER -> (i >= 2 && i <= 8 && j <= 5)
                || (j >= 6 && (i == 3 || i == 4 || i == 6 || i == 7))
                || (j >= 1 && j <= 3 && (i == 1 || i == 9));
            case END -> (i >= 2 && i <= 8 && j <= 5)
                || (j >= 6 && (i == 2 || i == 4 || i == 5 || i == 7))
                || (i == 1 && (j == 2 || j == 5))
                || (i == 9 && (j == 1 || j == 3 || j == 4));
            case PORTAL -> true;
        };
    }

    /** Positions are relative to the entity, y is the player's torso. Mirrors renderer yaw. */
    public static boolean crosses(RiftType type, double w, double h, double yaw,
            double ax, double ay, double az, double bx, double by, double bz) {
        double angle = Math.toRadians(yaw + 180), c = Math.cos(angle), s = Math.sin(angle);
        double x0 = c * ax + s * az, z0 = -s * ax + c * az;
        double x1 = c * bx + s * bz, z1 = -s * bx + c * bz;
        if (!Double.isFinite(x0+x1+z0+z1+ay+by+w+h) || w <= 0 || h <= 0) return false;
        if ((bx-ax)*(bx-ax) + (by-ay)*(by-ay) + (bz-az)*(bz-az) > 64) return false;
        // Attached left boxes have their own recess; test their actual plane too.
        for (double depth : new double[]{0.4837, 0.2637, 0.3537, 0.28}) {
            double d0 = z0 + depth, d1 = z1 + depth;
            if (Math.abs(d1-d0) < 1e-7 || !((d0 > 0 && d1 <= 0) || (d0 < 0 && d1 >= 0))) continue;
            double t = d0/(d0-d1), x = x0+(x1-x0)*t, y = ay+(by-ay)*t;
            if (x <= -w/2 || x >= w/2 || y < BASE || y >= BASE+h) continue;
            int i = (int)((x/w+0.5)*11), j = (int)((y-BASE)/h*8);
            if (cell(type,i,j) && Math.abs(depth-depth(type,i,j)) < 1e-5) return true;
        }
        return false;
    }

    public static float depth(RiftType type, int i, int j) {
        if (type == RiftType.PORTAL) return 0.28f;
        if (type == RiftType.SIFT || type == RiftType.OVERWORLD) {
            if (i <= 1 && j >= 2 && j <= 3) return 0.2637f;
            if (i <= 2 && j <= 1) return 0.3537f;
        }
        return 0.4837f;
    }
}
