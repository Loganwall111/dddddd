package dev.logan.beyond.math;

/** Swept finite-plane crossing. Fast-moving players cannot skip a thin portal trigger. */
public final class Membrane {
    private Membrane() {}
    public static boolean crossed(Vec before, Vec after, Vec center, double yaw,
                                  double halfWidth, double halfHeight) {
        if (!before.finite() || !after.finite() || !center.finite() || !Double.isFinite(yaw) ||
            halfWidth <= 0 || halfHeight <= 0) return false;
        Vec normal = new Vec(-Math.sin(yaw), 0, Math.cos(yaw));
        Vec right = new Vec(Math.cos(yaw), 0, Math.sin(yaw));
        double a = before.subtract(center).dot(normal);
        double b = after.subtract(center).dot(normal);
        if (a * b > 0 || Math.abs(a - b) < 1e-8) return false;
        double t = a / (a - b);
        if (t < 0 || t > 1) return false;
        Vec hit = before.add(after.subtract(before).multiply(t)).subtract(center);
        // Same rounded-rectangle envelope used by the fragment shader.
        double u = Math.abs(hit.dot(right)) / halfWidth;
        double v = Math.abs(hit.y()) / halfHeight;
        return Math.pow(u, 4) + Math.pow(v, 4) <= 1;
    }
}
