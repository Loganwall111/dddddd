package dev.logan.beyond.math;

/** Softened inverse-square GAMEPLAY attraction, not an N-body or relativistic simulation. */
public final class Gravity {
    private Gravity() {}
    public static Vec integrate(Vec position, Vec velocity, Vec center, double horizon,
                                double influence, double strength, double speedLimit) {
        if (!position.finite() || !velocity.finite() || !center.finite() ||
            !Double.isFinite(horizon) || !Double.isFinite(influence) || !Double.isFinite(strength) ||
            !Double.isFinite(speedLimit) || horizon <= 0 || influence <= horizon || strength <= 0 || speedLimit <= 0) {
            return velocity.finite() ? velocity : Vec.ZERO;
        }
        Vec delta = center.subtract(position);
        double distance = delta.length();
        if (distance < 1e-9 || distance >= influence) return velocity;
        double taper = 1 - distance / influence;
        double acceleration = Math.min(.095, strength * taper * taper /
            (distance * distance + horizon * horizon));
        return velocity.add(delta.multiply(acceleration / distance)).limited(speedLimit);
    }
}
