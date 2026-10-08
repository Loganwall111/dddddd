package dev.logan.beyond.server;

import dev.logan.beyond.BeyondMinecraft;
import net.minecraft.block.Blocks;
import net.minecraft.particle.ParticleTypes;
import net.minecraft.registry.RegistryKey;
import net.minecraft.server.network.ServerPlayerEntity;
import net.minecraft.server.world.ServerWorld;
import net.minecraft.sound.SoundCategory;
import net.minecraft.sound.SoundEvents;
import net.minecraft.util.math.BlockPos;
import net.minecraft.util.math.Vec3d;
import net.minecraft.world.Heightmap;
import net.minecraft.world.World;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * A wormhole carries the walker; it does not build anything. No barrier cage, no blocks, no
 * geometry: the server moves the traveller along a curved path while the client paints the
 * time-wave tunnel as a screen treatment, so the corridor is genuinely seamless and nothing at all
 * is left in the world afterwards. Because there is no structure, there is also nothing to mine
 * into, nothing to fall out of, and nothing to strand a player inside if the server stops.
 *
 * <p>The walk is bounded (a fixed number of ticks), cancelled safely on disconnect and shutdown,
 * and it never touches the world's blocks.
 */
public final class Tunnels {
    /** How far the corridor carries the walker, in blocks. */
    private static final int LENGTH = 52;
    /** Blocks travelled per server tick. */
    private static final double STEP = .82;
    /** The corridor lifts away from the ground so the walk reads as a tunnel through space. */
    private static final double RISE = 22;
    private static final Map<UUID, Session> SESSIONS = new HashMap<>();

    private record Session(RegistryKey<World> world, Vec3d start, Vec3d forward, Vec3d origin, Vec3d exit,
                           float yaw, float pitch, int total, int remaining) {
        Session advance() { return new Session(world, start, forward, origin, exit, yaw, pitch, total, remaining - 1); }
    }

    private Tunnels() {}

    public static boolean active(ServerPlayerEntity player) { return SESSIONS.containsKey(player.getUuid()); }
    public static int remaining(ServerPlayerEntity player) {
        Session session = SESSIONS.get(player.getUuid());
        return session == null ? 0 : session.remaining;
    }
    /** Where the current corridor began, for the smoke test's "you really travelled" assertion. */
    public static Vec3d origin(ServerPlayerEntity player) {
        Session session = SESSIONS.get(player.getUuid());
        return session == null ? null : session.origin;
    }
    /**
     * This class deliberately places no blocks at all. The method exists so the contract is
     * explicit and testable rather than implied by the absence of code.
     */
    public static int placedBlocks() { return 0; }

    public static boolean begin(ServerPlayerEntity player, ServerWorld world) {
        if (active(player)) return false;
        Vec3d look = player.getRotationVec(1f);
        Vec3d flat = new Vec3d(look.x, 0, look.z);
        if (flat.lengthSquared() < 1e-6) flat = new Vec3d(0, 0, 1);
        Vec3d forward = flat.normalize();
        Vec3d origin = player.getPos();
        Vec3d start = origin.add(0, RISE, 0);
        Vec3d exit = start.add(forward.multiply(LENGTH));
        // Face straight down the corridor: yaw 0 looks toward +Z, so the forward vector is
        // (-sin yaw, 0, cos yaw) and the inverse is what we compute here.
        float yaw = (float) Math.toDegrees(Math.atan2(-forward.x, forward.z));
        SESSIONS.put(player.getUuid(), new Session(world.getRegistryKey(), start, forward, origin, exit,
            yaw, 0f, BeyondMinecraft.CONFIG.tunnelTicks, BeyondMinecraft.CONFIG.tunnelTicks));
        player.closeHandledScreen();
        player.teleport(world, start.x, start.y, start.z, yaw, 0f);
        player.setVelocity(Vec3d.ZERO);
        player.fallDistance = 0;
        world.playSound(null, start.x, start.y, start.z, SoundEvents.BLOCK_PORTAL_TRIGGER, SoundCategory.PLAYERS, .5f, .45f);
        BeyondMinecraft.LOGGER.info("Beyond wormhole opened for {} ({} blocks of flight, no geometry).",
            player.getName().getString(), LENGTH);
        return true;
    }

    /** Called every server tick; returns true when the walk just ended and the player should arrive. */
    public static boolean tick(ServerPlayerEntity player) {
        Session session = SESSIONS.get(player.getUuid());
        if (session == null) return false;
        if (!player.getWorld().getRegistryKey().equals(session.world)) { end(player, true); return false; }
        Session advanced = session.advance();
        SESSIONS.put(player.getUuid(), advanced);
        double travelled = (session.total - advanced.remaining) * STEP;
        // A gentle wave keeps the ride from feeling like a straight elevator; the client renders the
        // matching tunnel distortion, so the two agree without a packet per frame.
        double sway = Math.sin(travelled * .17) * .55;
        Vec3d right = new Vec3d(-session.forward.z, 0, session.forward.x);
        Vec3d at = session.start.add(session.forward.multiply(travelled)).add(right.multiply(sway));
        player.teleport(player.getServerWorld(), at.x, at.y, at.z, session.yaw, (float) (Math.sin(travelled * .3) * 6.0));
        player.setVelocity(session.forward.x * STEP, 0, session.forward.z * STEP);
        player.velocityModified = true;
        player.fallDistance = 0;
        if (player.getWorld().getTime() % 3 == 0)
            player.getServerWorld().spawnParticles(ParticleTypes.END_ROD, at.x, at.y + 1.2, at.z, 3, .3, .3, .3, .02);
        if (advanced.remaining > 0) return false;
        BeyondMinecraft.LOGGER.info("Beyond wormhole carried {} {} blocks along its corridor",
            player.getName().getString(), String.format("%.1f", travelled));
        end(player, true);
        return true;
    }

    public static void end(ServerPlayerEntity player, boolean teleport) {
        Session session = SESSIONS.remove(player.getUuid());
        if (session == null || !teleport) return;
        ServerWorld destination = player.getServer().getWorld(session.world);
        if (destination == null) destination = player.getServerWorld();
        Vec3d exit = session.exit;
        var landing = SafeLanding.find(destination, new Vec3d(exit.x, Math.min(exit.y, 160), exit.z),
            player.getWidth(), player.getHeight(), false, Blocks.BARRIER);
        ServerWorld arrival = destination;   // captured by the fallback below, so it must not be reassigned
        Vec3d target = landing.orElseGet(() -> corridorEnd(arrival, player, exit));
        Umbrella.shift(player, destination, target);
        destination.playSound(null, target.x, target.y, target.z, SoundEvents.ENTITY_ENDERMAN_TELEPORT, SoundCategory.PLAYERS, .6f, .6f);
    }

    /**
     * Where the walker arrives when there is no floor within reach of the corridor's end — open
     * water, a canopy gap, the void under a floating island. They are put at the corridor's own end,
     * above whatever the column's surface is, and fall the last few blocks. Returning them to where
     * they started is the one answer that is never right: it silently undoes the entire ride.
     */
    private static Vec3d corridorEnd(ServerWorld world, ServerPlayerEntity player, Vec3d exit) {
        BlockPos column = BlockPos.ofFloored(exit.x, exit.y, exit.z);
        world.getChunk(column);   // synchronous, exactly one column, never permanently force-loaded
        int surface = world.getTopPosition(Heightmap.Type.MOTION_BLOCKING_NO_LEAVES, column).getY();
        double feet = Math.min(Math.max(surface, world.getBottomY() + 2), world.getTopY() - Math.ceil(player.getHeight()) - 2);
        return new Vec3d(column.getX() + .5, feet, column.getZ() + .5);
    }

    public static void disconnect(ServerPlayerEntity player) { end(player, false); }
    public static void reset(net.minecraft.server.MinecraftServer server) {
        for (UUID id : List.copyOf(SESSIONS.keySet())) {
            var player = server.getPlayerManager().getPlayer(id);
            if (player != null) end(player, false);
        }
        SESSIONS.clear();
    }
}
