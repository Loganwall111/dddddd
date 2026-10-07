package dev.logan.beyond.client;

import dev.logan.beyond.network.RealityPayload;
import net.minecraft.client.util.math.MatrixStack;
import net.minecraft.entity.Entity;
import org.joml.Quaternionf;
import org.joml.Vector3f;
import java.util.IdentityHashMap;

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
    public static volatile long hooksFired;
    /** How many of those renders were this mod's own creature — the CI fixture. */
    public static volatile long critterHooks;
    public static volatile float lastStretch = 1f;
    private static final Vector3f UP = new Vector3f(0f, 1f, 0f);
    private static final ThreadLocal<IdentityHashMap<Entity, Integer>> ACTIVE_RENDER_DEPTH =
        ThreadLocal.withInitial(IdentityHashMap::new);
    public record Stretch(float amount, Vector3f direction) {}
    private Spaghettification() {}

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

    /** Begin a renderer-specific matrix scope; nested superclass render calls do not double-stretch. */
    public static void beginRender(Entity entity, float tickDelta, MatrixStack matrices) {
        matrices.push();
        hooksFired++;
        if (entity instanceof dev.logan.beyond.entity.RealmCritter) critterHooks++;
        if (hooksFired <= 24 || hooksFired % 400 == 0)
            dev.logan.beyond.BeyondMinecraft.LOGGER.info("BEYOND_RENDER hook={} entity={} stretch={}", hooksFired,
                entity.getType().toString(), forEntity(entity) != null);
        var depths = ACTIVE_RENDER_DEPTH.get();
        Integer depth = depths.get(entity);
        if (depth != null) { depths.put(entity, depth + 1); return; }
        depths.put(entity, 1);

        var stretch = forEntity(entity);
        if (stretch == null) return;
        // Express the world-space pull in the entity's rotated frame before its renderer applies yaw.
        Vector3f local = new Vector3f(stretch.direction()).rotateY((float) Math.toRadians(-entity.getYaw(tickDelta))).normalize();
        Quaternionf tilt = rotationTowards(local);
        Quaternionf untilt = tilt == null ? null : tilt.conjugate(new Quaternionf());
        if (tilt != null) matrices.multiply(tilt);
        float amount = stretch.amount();
        float thin = 1f / (float) Math.sqrt(amount);
        matrices.scale(thin, amount, thin);
        if (untilt != null) matrices.multiply(untilt);
        lastStretch = amount;
        applied++;
    }

    public static void endRender(Entity entity, MatrixStack matrices) {
        matrices.pop();
        var depths = ACTIVE_RENDER_DEPTH.get();
        Integer depth = depths.get(entity);
        if (depth == null || depth <= 1) depths.remove(entity);
        else depths.put(entity, depth - 1);
        if (depths.isEmpty()) ACTIVE_RENDER_DEPTH.remove();
    }

    /** Shortest rotation taking +Y onto {@code direction}, or null when already aligned. */
    private static Quaternionf rotationTowards(Vector3f direction) {
        float dot = Math.clamp(UP.dot(direction), -1f, 1f);
        if (dot > .9999f) return null;
        Vector3f axis = new Vector3f(UP).cross(direction);
        if (axis.lengthSquared() < 1e-7f) return new Quaternionf().rotationAxis((float) Math.PI, 1f, 0f, 0f);
        return new Quaternionf().rotationAxis((float) Math.acos(dot), axis.normalize());
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
