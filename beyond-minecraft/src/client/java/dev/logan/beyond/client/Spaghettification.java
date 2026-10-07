package dev.logan.beyond.client;

import dev.logan.beyond.network.RealityPayload;
import net.minecraft.client.util.math.MatrixStack;
import net.minecraft.entity.Entity;
import org.joml.Quaternionf;
import org.joml.Vector3f;

/**
 * Tidal stretching. The server pulls bodies in; the client renders what that does to a body that
 * is not moving fast enough to escape: it stretches along the pull axis and thins out, like
 * spaghetti. This is a rendering transform only — collision, health and inventory are untouched.
 *
 * <p>The stretch is computed from the same anomaly snapshots the lens uses, so it needs no extra
 * packets and it is identical for every player who can see the well.
 */
public final class Spaghettification {
    /** Incremented by the render mixin. The CI client smoke asserts this actually ran. */
    public static volatile long applied;
    public static volatile float lastStretch = 1f;
    public record Stretch(float amount, Vector3f direction) {}
    private Spaghettification() {}

    private static final Vector3f UP = new Vector3f(0f, 1f, 0f);

    /**
     * Pushes a render matrix and applies the tidal transform to it: stretched along the pull axis,
     * thinned across it. Every entity render that funnels through a renderer calls this, and the same
     * call pops it again with {@link #unwind}.
     *
     * <p>The rotation is built from an explicit axis and angle rather than a direction-pair helper, so
     * the transform is unambiguous for both horizontal and vertical pulls.
     */
    public static void wind(Entity entity, float tickDelta, MatrixStack matrices) {
        matrices.push();
        Stretch stretch = forEntity(entity);
        if (stretch == null) return;
        // Express the world-space pull in the entity's own rotated frame: yaw leaves Y alone, so a
        // vertical pull stays vertical and the transform is correct for every renderer.
        Vector3f local = new Vector3f(stretch.direction()).rotateY((float) Math.toRadians(-entity.getYaw(tickDelta))).normalize();
        Quaternionf tilt = rotationTowards(local);   // null: the pull is already along +Y
        if (tilt != null) matrices.multiply(tilt);
        float thin = 1f / (float) Math.sqrt(stretch.amount());
        matrices.scale(thin, stretch.amount(), thin);
        if (tilt != null) matrices.multiply(tilt.conjugate(new Quaternionf()));
        lastStretch = stretch.amount();
        applied++;
    }

    /** Undoes {@link #wind}. Must be called exactly once for every call to it. */
    public static void unwind(MatrixStack matrices) { matrices.pop(); }

    /** Shortest rotation taking +Y onto {@code local}, or null when the two are already aligned. */
    private static Quaternionf rotationTowards(Vector3f local) {
        float dot = Math.clamp(UP.dot(local), -1f, 1f);
        if (dot > .9999f) return null;
        Vector3f axis = new Vector3f(UP).cross(local);
        if (axis.lengthSquared() < 1e-7f) return new Quaternionf().rotationAxis((float) Math.PI, 1f, 0f, 0f);
        return new Quaternionf().rotationAxis((float) Math.acos(dot), axis.normalize());
    }

    public static Stretch forEntity(Entity entity) {
        if (!BeyondClient.CONFIG.spaghettification || BeyondClient.CONFIG.reducedMotion || ClientReality.nodes.isEmpty()) return null;
        var position = entity.getPos();
        Stretch best = null;
        for (RealityPayload.Node node : ClientReality.nodes) {
            // Membranes and tears are doorways, not wells: they never stretch anything.
            if (node.kind() == 0 || node.kind() == 2) continue;
            double dx = node.x() - position.x, dy = node.y() - (position.y + entity.getHeight() * .5), dz = node.z() - position.z;
            double distance = Math.sqrt(dx * dx + dy * dy + dz * dz) - node.radius();
            if (distance <= 0 || distance > node.radius() * 2.4) continue;
            float t = (float) (1 - distance / (node.radius() * 2.4));
            float amount = 1f + t * t * (node.persistent() ? 7f : 5f);
            if (best == null || amount > best.amount())
                best = new Stretch(amount, new Vector3f((float) dx, (float) dy, (float) dz).normalize());
        }
        return best;
    }
    /** How close the camera is to the nearest colossal well, 0..1. Drives the nebula shader term. */
    public static float nebulaProximity() {
        if (!BeyondClient.CONFIG.nebula || ClientReality.nodes.isEmpty()) return 0;
        var camera = net.minecraft.client.MinecraftClient.getInstance().gameRenderer.getCamera().getPos();
        float best = 0;
        for (RealityPayload.Node node : ClientReality.nodes) {
            if (!node.persistent() && node.kind() != 1) continue;
            double dx = node.x() - camera.x, dy = node.y() - camera.y, dz = node.z() - camera.z;
            double distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
            float reach = (float) (node.radius() * 3.4);
            if (distance < reach) best = Math.max(best, (float) (1 - distance / reach));
        }
        return best;
    }
}
