package dev.logan.beyond.server;

import dev.logan.beyond.BeyondMinecraft;
import net.minecraft.particle.ParticleTypes;
import net.minecraft.registry.RegistryKey;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.world.ServerWorld;
import net.minecraft.util.math.BlockPos;
import net.minecraft.util.math.Vec3d;
import net.minecraft.world.World;
import java.util.HashMap;
import java.util.Map;

/**
 * The colossal singularity in the sky: a persistent, reachable, growing well anchored above a
 * world's spawn. It is a real anomaly, not a painted backdrop — its lens distorts the actual
 * terrain (see cosmos.fsh), its gravity pulls entities, and the nebula shell around it is real
 * particles you can fly through and look back from.
 */
public final class SkyWells {
    private static final Map<RegistryKey<World>, Anomaly> WELLS = new HashMap<>();
    /** Height above the spawn surface, in blocks. Inside the build limit, so it is flyable. */
    private static final int ALTITUDE = 232;
    private SkyWells() {}
    public static void reset() { WELLS.clear(); }
    public static Anomaly of(RegistryKey<World> world) { return WELLS.get(world); }
    public static Iterable<Anomaly> all() { return WELLS.values(); }
    public static boolean isPrime(Anomaly anomaly) { return anomaly != null && anomaly.kind == Anomaly.Kind.PRIME; }

    /** Anchored relative to spawn: the same well for every player on a server, so it can be shared. */
    public static Vec3d anchor(ServerWorld world) {
        BlockPos spawn = world.getSpawnPos();
        long seedish = world.getSeed() & 0xFFFF;
        double angle = (seedish / 65535.0) * Math.PI * 2;
        return new Vec3d(spawn.getX() + Math.cos(angle) * 760, Math.min(ALTITUDE, world.getTopY() - 24), spawn.getZ() + Math.sin(angle) * 760);
    }

    public static void ensure(MinecraftServer server) {
        if (!BeyondMinecraft.CONFIG.skyWells) return;
        ServerWorld overworld = server.getOverworld();
        if (overworld != null) install(overworld);
        if (!BeyondMinecraft.CONFIG.skyWellsInRealms) return;
        for (var realm : BeyondMinecraft.CATALOG.realms()) {
            ServerWorld world = server.getWorld(RegistryKey.of(net.minecraft.registry.RegistryKeys.WORLD, BeyondMinecraft.id(realm.id())));
            if (world != null) install(world);
        }
    }

    private static void install(ServerWorld world) {
        if (WELLS.containsKey(world.getRegistryKey())) return;
        Vec3d at = anchor(world);
        // A signature player is not needed for the geometry; the well belongs to the world itself.
        Anomaly well = new Anomaly(world.getServer(), at, Anomaly.Kind.PRIME,
            BeyondMinecraft.CATALOG.indexOf("realm_08") >= 0 ? BeyondMinecraft.CATALOG.indexOf("realm_08") : 0, 1_000_000);
        well.radius = Anomaly.Kind.PRIME.baseRadius;
        WELLS.put(world.getRegistryKey(), well);
        BeyondMinecraft.LOGGER.info("Beyond sky well installed in {} at {} (radius {}).", world.getRegistryKey().getValue(), at, well.radius);
    }

    /** Keeps the well fed by rarer, larger meals: the nebula thickens as the well grows. */
    public static void tick(ServerWorld world, Anomaly well) {
        if (world.getTime() % 4 != 0) return;
        int points = 6 + (int) (well.radius / 24f);
        double shell = well.radius * (2.4 + 0.5 * Math.sin(world.getTime() * .01));
        for (int i = 0; i < points; i++) {
            double t = (world.getTime() * .013 + i * 0.37) % 1.0;
            double angle = i * 2.399 + world.getTime() * .004;
            double radius = well.radius * (1.25 + t * 2.6);
            double x = well.center.x + Math.cos(angle) * radius;
            double y = well.center.y + Math.sin(t * Math.PI) * shell * .35 - shell * .12;
            double z = well.center.z + Math.sin(angle) * radius;
            world.spawnParticles(ParticleTypes.CLOUD, x, y, z, 1, .4, .2, .4, .01);
            if (i % 3 == 0) world.spawnParticles(ParticleTypes.END_ROD, x, y, z, 1, .2, .1, .2, .004);
        }
    }
}
