package dev.logan.beyond.server;

import dev.logan.beyond.BeyondMinecraft;
import net.minecraft.block.Block;
import net.minecraft.block.Blocks;
import net.minecraft.particle.ParticleTypes;
import net.minecraft.registry.RegistryKey;
import net.minecraft.server.network.ServerPlayerEntity;
import net.minecraft.server.world.ServerWorld;
import net.minecraft.sound.SoundCategory;
import net.minecraft.sound.SoundEvents;
import net.minecraft.util.math.BlockPos;
import net.minecraft.util.math.Vec3d;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * A wormhole does not cut to a loading screen: it drops you into a bounded corridor of real
 * barrier blocks in the sky and lets you walk it while the client renders the time-wave overlay.
 * When the corridor ends the branch breaks — the ground you return to has been rewritten by the
 * Umbrella Effect. Corridors are torn down on completion, disconnect and shutdown (a server crash
 * can leave one floating; the blocks are barriers, so it can never be mined into a trap).
 */
public final class Tunnels {
    private static final int WIDTH = 2;   // blocks either side of the centre line
    private static final int HEIGHT = 4;
    private static final int LENGTH = 46;
    private static final Map<UUID, Session> SESSIONS = new HashMap<>();
    private record Session(RegistryKey<World> world, List<BlockPos> blocks, Vec3d exit, Vec3d origin,
                           float yaw, float pitch, int total, int remaining) {
        Session advance() { return new Session(world, blocks, exit, origin, yaw, pitch, total, remaining - 1); }
    }
    private Tunnels() {}
    public static boolean active(ServerPlayerEntity player) { return SESSIONS.containsKey(player.getUuid()); }
    public static int remaining(ServerPlayerEntity player) {
        Session session = SESSIONS.get(player.getUuid());
        return session == null ? 0 : session.remaining;
    }

    public static boolean begin(ServerPlayerEntity player, ServerWorld world) {
        if (active(player)) return false;
        var config = BeyondMinecraft.CONFIG;
        double y = Math.min(world.getTopY() - HEIGHT - 4, Math.max(player.getY() + 24, 200));
        double startX = Math.floor(player.getX()) + .5;
        double startZ = Math.floor(player.getZ()) + .5 - WIDTH;
        BlockPos origin = BlockPos.ofFloored(startX, y, startZ);
        List<BlockPos> placed = new ArrayList<>();
        for (int step = 0; step < LENGTH; step++) {
            BlockPos cell = origin.add(step, 0, 0);
            if (!world.isChunkLoaded(cell)) world.getChunk(cell); // bounded: a fixed 46-block run
            for (int dx = 0; dx < WIDTH * 2 + 1; dx++) {
                for (int dz = -WIDTH; dz <= WIDTH; dz++) {
                    for (int dy = -1; dy <= HEIGHT; dy++) {
                        BlockPos at = cell.add(-dx, dy, dz);
                        boolean edge = dy == -1 || dy == HEIGHT || dz == -WIDTH || dz == WIDTH || dx == 0 || dx == WIDTH * 2;
                        if (!edge) continue;
                        // Barriers only: nothing here can be mined, and the corridor never overwrites terrain.
                        if (!world.isAir(at)) continue;
                        world.setBlockState(at, Blocks.BARRIER.getDefaultState(), Block.NOTIFY_ALL);
                        placed.add(at);
                    }
                }
            }
        }
        SESSIONS.put(player.getUuid(), new Session(world.getRegistryKey(), placed,
            new Vec3d(startX, y, startZ).add(LENGTH + 2, 0, WIDTH), player.getPos(), player.getYaw(), player.getPitch(),
            config.tunnelTicks, config.tunnelTicks));
        player.closeHandledScreen();
        player.teleport(world, startX, y, startZ + WIDTH, -90, 0);
        player.setVelocity(Vec3d.ZERO);
        player.fallDistance = 0;
        world.playSound(null, player.getX(), player.getY(), player.getZ(), SoundEvents.BLOCK_PORTAL_TRIGGER, SoundCategory.PLAYERS, .5f, .45f);
        BeyondMinecraft.LOGGER.info("Beyond wormhole corridor opened for {} ({} barrier blocks).", player.getName().getString(), placed.size());
        return true;
    }

    /** Called every server tick; returns true when the walk just ended and the player should arrive. */
    public static boolean tick(ServerPlayerEntity player) {
        Session session = SESSIONS.get(player.getUuid());
        if (session == null) return false;
        if (!player.getWorld().getRegistryKey().equals(session.world)) { end(player, true); return false; }
        Session advanced = session.advance();
        SESSIONS.put(player.getUuid(), advanced);
        // Keep the walker inside the tube and drifting forward; this is a corridor, not a room.
        Vec3d velocity = player.getVelocity();
        double toward = session.exit.x - player.getX();
        if (toward > 0) player.setVelocity(Math.min(.28, Math.max(velocity.x, .16)), velocity.y, velocity.z * .6);
        player.velocityModified = true;
        if (player.getWorld().getTicks() % 4 == 0)
            player.getServerWorld().spawnParticles(ParticleTypes.END_ROD, player.getX() - 1.5, player.getY() + 1.6, player.getZ(), 2, .2, .2, .2, .02);
        if (advanced.remaining > 0) return false;
        end(player, true);
        return true;
    }

    public static void end(ServerPlayerEntity player, boolean teleport) {
        Session session = SESSIONS.remove(player.getUuid());
        if (session == null) return;
        ServerWorld world = player.getServer().getWorld(session.world);
        if (world != null) for (BlockPos pos : session.blocks) if (world.isChunkLoaded(pos)) world.setBlockState(pos, Blocks.AIR.getDefaultState(), Block.NOTIFY_ALL);
        if (!teleport) return;
        ServerWorld destination = world == null ? player.getServerWorld() : world;
        Vec3d exit = session.exit;
        var landing = SafeLanding.find(destination, new Vec3d(exit.x, Math.min(exit.y, 120), exit.z), player.getWidth(), player.getHeight(), false, Blocks.BARRIER);
        Vec3d target = landing.orElse(new Vec3d(session.origin.x, session.origin.y, session.origin.z));
        Umbrella.shift(player, destination, target);
        destination.playSound(null, target.x, target.y, target.z, SoundEvents.ENTITY_ENDERMAN_TELEPORT, SoundCategory.PLAYERS, .6f, .6f);
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
