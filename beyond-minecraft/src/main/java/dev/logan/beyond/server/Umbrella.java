package dev.logan.beyond.server;

import dev.logan.beyond.BeyondMinecraft;
import net.minecraft.block.Block;
import net.minecraft.block.BlockState;
import net.minecraft.block.Blocks;
import net.minecraft.registry.RegistryKey;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.network.ServerPlayerEntity;
import net.minecraft.server.world.ServerWorld;
import net.minecraft.text.Text;
import net.minecraft.util.Formatting;
import net.minecraft.util.math.BlockPos;
import net.minecraft.util.math.Vec3d;
import net.minecraft.world.Heightmap;
import net.minecraft.world.World;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.HashMap;
import java.util.Map;

/**
 * The Umbrella Effect. Every branch of reality you displace through increments your era; the root
 * reality you come back to is rewritten to match the branch you came from. Rewrites are confined
 * to a configurable radius around your arrival point, run on a per-tick budget, never touch
 * containers / fluids / unbreakable blocks, and are recorded so the effect is repeatable from the
 * journey's era seed rather than random noise.
 */
public final class Umbrella {
    public enum Era {
        PRISTINE("the untouched branch"),
        GIANT_WOOD("a branch of gigantic living trees"),
        NEON_CITY("a branch frozen in the neon eighties"),
        PRIMEVAL("a branch from before the continents split"),
        ALIEN("a branch the visitors re-wrote"),
        VEINED("a branch where the rock is veined with something else"),
        BLEACHED("a branch bleached to nothing"),
        ASHEN("a branch that already burned");
        public final String description;
        Era(String description) { this.description = description; }
        public static Era of(int value) { return values()[Math.floorMod(value, values().length)]; }
    }
    private record Job(ServerWorld world, BlockPos center, int radius, Era era, long seed, int index) {
        Job step() { return new Job(world, center, radius, era, seed, index + 1); }
        int columns() { return (radius * 2 + 1) * (radius * 2 + 1); }
    }
    private static final Map<RegistryKey<World>, Deque<Job>> JOBS = new HashMap<>();
    private static final int COLUMNS_PER_TICK = 18;
    private Umbrella() {}
    public static void reset() { JOBS.clear(); }
    /** True while any branch rewrite still has columns left to process. */
    public static boolean busy() { return JOBS.values().stream().anyMatch(queue -> !queue.isEmpty()); }

    /** Records the branch shift and queues the rewrite. Called when a tunnel or wormhole completes. */
    public static void shift(ServerPlayerEntity player, ServerWorld world, Vec3d at) {
        Journey journey = Journey.of(player);
        journey.era = Math.min(64, journey.era + 1);
        if (journey.eraSeed == 0) journey.eraSeed = world.getSeed() ^ player.getUuid().getLeastSignificantBits() ^ 0x5DEECE66DL;
        Era era = Era.of(journey.era);
        player.sendMessage(Text.literal("Umbrella Effect · you returned to " + era.description + ".").formatted(Formatting.LIGHT_PURPLE), false);
        BeyondMinecraft.LOGGER.info("Beyond Umbrella: {} arrived in era {} ({})", player.getName().getString(), journey.era, era);
        if (!BeyondMinecraft.CONFIG.umbrellaEffect || era == Era.PRISTINE) return;
        queue(world, BlockPos.ofFloored(at), BeyondMinecraft.CONFIG.umbrellaRadius, era, journey.eraSeed);
    }

    public static void queue(ServerWorld world, BlockPos center, int radius, Era era, long seed) {
        JOBS.computeIfAbsent(world.getRegistryKey(), key -> new ArrayDeque<>())
            .add(new Job(world, center, Math.clamp(radius, 4, 40), era, seed == 0 ? world.getSeed() : seed, 0));
    }

    public static void tick(MinecraftServer server) {
        for (var entry : JOBS.entrySet()) {
            ServerWorld world = server.getWorld(entry.getKey());
            Deque<Job> queue = entry.getValue();
            if (world == null) { queue.clear(); continue; }
            Job job = queue.peek();
            if (job == null) continue;
            int processed = 0;
            int side = job.radius * 2 + 1;
            while (processed < COLUMNS_PER_TICK && job.index < job.columns()) {
                int x = job.index % side - job.radius;
                int z = job.index / side - job.radius;
                rewriteColumn(world, job.center.add(x, 0, z), job.era, job.seed);
                job = job.step();
                processed++;
            }
            queue.poll();
            if (job.index < job.columns()) queue.addFirst(job);
        }
    }

    private static void rewriteColumn(ServerWorld world, BlockPos at, Era era, long seed) {
        if (!world.isChunkLoaded(at)) return;
        BlockPos surface = world.getTopPosition(Heightmap.Type.MOTION_BLOCKING_NO_LEAVES, at);
        if (surface.getY() <= world.getBottomY() + 1 || surface.getY() > world.getTopY() - 24) return;
        int hash = hash(at.getX(), at.getZ(), seed);
        int h = Math.floorMod(hash, 1000);
        switch (era) {
            case GIANT_WOOD -> {
                if (at.getX() % 11 == 0 && at.getZ() % 11 == 0) {
                    int height = 20 + h % 12;
                    for (int y = 0; y < height; y++) set(world, surface.up(y), Blocks.OAK_LOG.getDefaultState());
                    for (int dx = -3; dx <= 3; dx++)
                        for (int dy = 0; dy < 5; dy++)
                            for (int dz = -3; dz <= 3; dz++)
                                if (Math.abs(dx) + Math.abs(dz) + Math.abs(dy - 2) < 6)
                                    set(world, surface.up(height - 2 + dy).add(dx, 0, dz), Blocks.OAK_LEAVES.getDefaultState());
                } else if (h % 5 == 0) set(world, surface, Blocks.GRASS_BLOCK.getDefaultState());
                else if (h % 17 == 0) set(world, surface.up(1), Blocks.SHORT_GRASS.getDefaultState());
            }
            case NEON_CITY -> {
                if (at.getX() % 13 == 0 && at.getZ() % 13 == 0) {
                    int height = 9 + h % 19;
                    BlockState body = (h % 3 == 0 ? Blocks.LIGHT_GRAY_CONCRETE : Blocks.GRAY_CONCRETE).getDefaultState();
                    for (int y = 0; y < height; y++) {
                        set(world, surface.up(y), body);
                        if (y % 4 == 2) {
                            set(world, surface.up(y).add(1, 0, 0), Blocks.SEA_LANTERN.getDefaultState());
                            set(world, surface.up(y).add(0, 0, 1), Blocks.SEA_LANTERN.getDefaultState());
                            set(world, surface.up(y).add(-1, 0, 0), Blocks.MAGENTA_CONCRETE.getDefaultState());
                            set(world, surface.up(y).add(0, 0, -1), Blocks.CYAN_CONCRETE.getDefaultState());
                        }
                    }
                } else if (h % 7 == 0) set(world, surface, Blocks.YELLOW_CONCRETE.getDefaultState());
                else if (h % 3 == 0) set(world, surface, Blocks.BLACK_CONCRETE.getDefaultState());
            }
            case PRIMEVAL -> {
                if (at.getX() % 9 == 0 && at.getZ() % 9 == 0) {
                    int height = 12 + h % 16;
                    for (int y = 0; y < height; y++) set(world, surface.up(y), Blocks.JUNGLE_LOG.getDefaultState());
                    for (int dy = height - 3; dy < height + 2; dy++)
                        for (int dx = -3; dx <= 3; dx++)
                            for (int dz = -3; dz <= 3; dz++)
                                if (Math.abs(dx) + Math.abs(dz) < 5) set(world, surface.up(dy).add(dx, 0, dz), Blocks.JUNGLE_LEAVES.getDefaultState());
                    for (int dy = 3; dy < height - 4; dy += 2) set(world, surface.up(dy).add(1, 0, 0), Blocks.VINE.getDefaultState());
                } else if (h % 4 == 0) set(world, surface, Blocks.MOSS_BLOCK.getDefaultState());
                else if (h % 6 == 0) set(world, surface.up(1), Blocks.LARGE_FERN.getDefaultState());
            }
            case ALIEN -> {
                if (h % 11 == 0) {
                    for (int y = 0; y < 3; y++) set(world, surface.up(y), Blocks.PURPLE_CONCRETE.getDefaultState());
                    set(world, surface.up(3), Blocks.SHROOMLIGHT.getDefaultState());
                } else {
                    set(world, surface, (h % 3 == 0 ? Blocks.SCULK : Blocks.OBSIDIAN).getDefaultState());
                    if (h % 9 == 0) set(world, surface.up(1), Blocks.SCULK_VEIN.getDefaultState());
                }
            }
            case VEINED -> {
                set(world, surface, Blocks.NETHERRACK.getDefaultState());
                if (h % 2 == 0) set(world, surface.down(), Blocks.BLACKSTONE.getDefaultState());
                if (h % 5 == 0) set(world, surface.up(1), Blocks.RED_NETHER_BRICKS.getDefaultState());
            }
            case BLEACHED -> {
                for (int y = 0; y < 4; y++) set(world, surface.down(y), Blocks.WHITE_CONCRETE.getDefaultState());
                if (h % 6 == 0) set(world, surface.up(1), Blocks.WHITE_WOOL.getDefaultState());
            }
            case ASHEN -> {
                for (int y = 0; y < 3; y++) set(world, surface.down(y), (h % 2 == 0 ? Blocks.BASALT : Blocks.CRACKED_STONE_BRICKS).getDefaultState());
                if (h % 8 == 0) set(world, surface.up(1), Blocks.COBWEB.getDefaultState());
            }
            default -> { }
        }
    }

    private static void set(ServerWorld world, BlockPos pos, BlockState state) {
        if (pos.getY() <= world.getBottomY() + 1 || pos.getY() >= world.getTopY() - 1 || !world.isChunkLoaded(pos)) return;
        BlockState current = world.getBlockState(pos);
        if (current.isAir() && state.isAir()) return;
        if (current.isOf(Blocks.BEDROCK) || current.isOf(Blocks.BARRIER) || current.isLiquid()) return;
        if (world.getBlockEntity(pos) != null) return;
        world.setBlockState(pos, state, Block.NOTIFY_ALL);
    }

    private static int hash(int x, int z, long seed) {
        long value = x * 341873128712L + z * 132897987541L + seed * 2654435761L;
        value ^= value >>> 29; value *= 0xBF58476D1CE4E5B9L; value ^= value >>> 32;
        return (int) value;
    }
}
