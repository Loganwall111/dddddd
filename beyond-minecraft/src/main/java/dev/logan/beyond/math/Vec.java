package dev.logan.beyond.math;

/** Engine-independent math so simulation invariants can be tested without launching Minecraft. */
public record Vec(double x, double y, double z) {
    public static final Vec ZERO = new Vec(0, 0, 0);
    public Vec add(Vec b) { return new Vec(x + b.x, y + b.y, z + b.z); }
    public Vec subtract(Vec b) { return new Vec(x - b.x, y - b.y, z - b.z); }
    public Vec multiply(double s) { return new Vec(x * s, y * s, z * s); }
    public double dot(Vec b) { return x * b.x + y * b.y + z * b.z; }
    public double length() { return Math.sqrt(dot(this)); }
    public boolean finite() { return Double.isFinite(x) && Double.isFinite(y) && Double.isFinite(z); }
    public Vec limited(double max) {
        double length = length();
        return length > max && length > 1e-12 ? multiply(max / length) : this;
    }
}
