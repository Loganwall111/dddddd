package dev.logan.beyond.server;

import dev.logan.beyond.network.RealityPayload;
import net.minecraft.server.network.ServerPlayerEntity;
import net.minecraft.util.math.Vec3d;
import java.util.UUID;

/**
 * One transient or persistent distortion. Radius grows by consuming matter, which is what makes a
 * fed singularity visibly larger than a fresh one. Budgets (count, lifetime, speed, entity caps)
 * still live in {@link ServerConfig}; nothing here writes terrain by itself.
 */
public final class Anomaly {
    public enum Kind {
        MEMBRANE(0, 1.6f, 1.45f, false, false),
        SINGULARITY(1, 1.15f, 1.5f, false, false),
        TEAR(2, 2.4f, 1.6f, false, false),
        WORMHOLE(3, 1.8f, 1.5f, false, true),
        QUASAR(4, 1.9f, 1.5f, false, true),
        PRIME(5, 132f, 1.7f, true, true);
        public final int wire;
        public final float baseRadius;
        /** Horizontal footprint multiplier for the swept-plane crossing test. */
        public final float rim;
        public final boolean persistent;
        /** Kinds that lens real scene geometry rather than showing a destination vista. */
        public final boolean lensing;
        Kind(int wire, float baseRadius, float rim, boolean persistent, boolean lensing) {
            this.wire = wire; this.baseRadius = baseRadius; this.rim = rim; this.persistent = persistent; this.lensing = lensing;
        }
        public boolean membraneLike() { return this == MEMBRANE || this == TEAR; }
        public static Kind fromWire(int wire) {
            for (Kind kind : values()) if (kind.wire == wire) return kind;
            return MEMBRANE;
        }
    }
    private static int nextId;
    public final int id = nextId++;
    public final UUID owner;
    public final Kind kind;
    public final Vec3d center;
    public final float yaw;
    public final int realm;
    public final int lifetime;
    public int age;
    public float radius;
    public int consumed;
    public double spin;
    /** Real blocks detached by the tornado, bounded by config. */
    public int torn;
    public Anomaly(ServerPlayerEntity player, Vec3d center, Kind kind, int realm, int lifetime) {
        this.owner = player.getUuid(); this.center = center; this.kind = kind; this.realm = realm;
        this.lifetime = lifetime; this.yaw = (float) Math.toRadians(player.getYaw()); this.radius = kind.baseRadius;
    }
    /** World-owned wells (the sky singularities) belong to the world, not to whoever found them. */
    public Anomaly(net.minecraft.server.MinecraftServer server, Vec3d center, Kind kind, int realm, int lifetime) {
        this.owner = null; this.center = center; this.kind = kind; this.realm = realm;
        this.lifetime = lifetime; this.yaw = 0; this.radius = kind.baseRadius;
    }
    public void consume(double growthPerEntity, double maxRadius) {
        consumed++;
        radius = (float) Math.min(maxRadius, radius + growthPerEntity);
    }

    /** Matter torn from the ground swells the well more slowly than live bodies do. */
    public void absorbBlock(double growthPerBlock, double maxRadius, int blockBudget) {
        if (torn >= blockBudget) return;
        torn++;
        radius = (float) Math.min(maxRadius, radius + growthPerBlock);
    }
    public RealityPayload.Node snapshot() {
        return new RealityPayload.Node(id, kind.wire, center.x, center.y, center.z, radius, yaw, realm, age, lifetime);
    }
    public static void resetIds() { nextId = 0; }
    /** Persistent wells never expire; transient anomalies do. */
    public boolean expired() { return !kind.persistent && age >= lifetime; }
    public boolean active() { return age > 24 && (kind.persistent || age < lifetime - 20); }
}
