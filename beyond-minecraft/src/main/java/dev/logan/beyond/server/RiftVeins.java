package dev.logan.beyond.server;

import dev.logan.beyond.BeyondMinecraft;
import net.minecraft.block.BlockState;
import net.minecraft.block.Blocks;
import net.minecraft.block.entity.BlockEntity;
import net.minecraft.particle.ParticleTypes;
import net.minecraft.server.world.ServerWorld;
import net.minecraft.sound.SoundCategory;
import net.minecraft.sound.SoundEvents;
import net.minecraft.util.math.BlockPos;
import net.minecraft.util.math.Vec3d;
import net.minecraft.world.Heightmap;
import java.util.Random;

/**
 * The ground answers a rift. When an opening is torn, a network of glowing fissures runs out across
 * the surface from beneath it — the same material the realm behind the rift is made of, which is
 * what makes the light read as coming from somewhere rather than being painted on.
 *
 * <p>Everything here is bounded and refuses protected blocks: at most {@link #MAX_BLOCKS} blocks per
 * opening, only inside chunks that are already loaded, never bedrock, barriers, command blocks,
 * structure blocks or anything with a block entity. A fissure is decoration, not a demolition tool.
 */
public final class RiftVeins {
    private static final int MAX_BLOCKS = 220;
    private static final int MIN_ARMS = 4, MAX_ARMS = 7;
    private static final Random RANDOM = new Random();

    private RiftVeins() {}

    /** Opens a fissure network around {@code center} and returns how many blocks it changed. */
    public static int open(ServerWorld world, Vec3d center, long seed, BlockState vein, Anomaly.Kind kind) {
        Random random = new Random(seed * 6364136223846793005L + 1442695040888963407L);
        BlockPos base = BlockPos.ofFloored(center);
        BlockPos ground = null;
        // Walk down from the opening to the first solid ground below it.
        for (int dy = 0; dy >= -56; dy--) {
            BlockPos at = base.add(0, dy, 0);
            if (!world.isChunkLoaded(at)) break;
            if (!world.getBlockState(at).isAir()) { ground = at; break; }
        }
        if (ground == null) {
            if (!world.isChunkLoaded(base)) return 0;
            ground = world.getTopPosition(Heightmap.Type.MOTION_BLOCKING_NO_LEAVES, base);
            if (!world.isChunkLoaded(ground)) return 0;
        }
        int arms = MIN_ARMS + random.nextInt(MAX_ARMS - MIN_ARMS + 1);
        int placed = 0;
        for (int arm = 0; arm < arms && placed < MAX_BLOCKS; arm++) {
            double angle = random.nextDouble() * Math.PI * 2;
            double x = ground.getX() + .5, z = ground.getZ() + .5;
            int length = 9 + random.nextInt(16);
            for (int step = 0; step < length && placed < MAX_BLOCKS; step++) {
                angle += (random.nextDouble() - .5) * .6;
                x += Math.cos(angle); z += Math.sin(angle);
                placed += carve(world, (int) Math.floor(x), (int) Math.floor(z), vein, random);
            }
        }
        if (placed > 0) {
            world.spawnParticles(ParticleTypes.DRAGON_BREATH, center.x, ground.getY() + 1.2, center.z,
                24, 2.2, .8, 2.2, .04);
            world.spawnParticles(ParticleTypes.END_ROD, center.x, ground.getY() + 1.5, center.z, 10, 1.4, .6, 1.4, .02);
            world.playSound(null, ground.getX(), ground.getY(), ground.getZ(),
                kind == Anomaly.Kind.TEAR ? SoundEvents.BLOCK_AMETHYST_CLUSTER_BREAK : SoundEvents.BLOCK_DEEPSLATE_BREAK,
                SoundCategory.PLAYERS, .8f, kind == Anomaly.Kind.TEAR ? .7f : .45f);
            BeyondMinecraft.LOGGER.info("Beyond rift fissure opened: {} blocks changed near {}", placed, ground.toShortString());
        }
        return placed;
    }

    /** Replaces the topmost solid block of one column, occasionally cracking a second one deeper. */
    private static int carve(ServerWorld world, int x, int z, BlockState vein, Random random) {
        if (!world.isChunkLoaded(new BlockPos(x, 0, z))) return 0;
        int surface = world.getTopPosition(Heightmap.Type.MOTION_BLOCKING_NO_LEAVES, new BlockPos(x, 0, z)).getY();
        int changed = 0;
        for (int y = surface; y > surface - 4; y--) {
            BlockPos at = new BlockPos(x, y, z);
            BlockState state = world.getBlockState(at);
            if (state.isAir()) continue;
            if (!crackable(world, at, state)) break;
            world.setBlockState(at, vein, net.minecraft.block.Block.NOTIFY_ALL);
            changed++;
            // Now and then the crack continues downward, so the glow comes from inside the ground.
            if (random.nextInt(3) != 0) break;
        }
        return changed;
    }

    private static boolean crackable(ServerWorld world, BlockPos pos, BlockState state) {
        if (state.isAir() || state.isLiquid()) return false;
        if (state.isOf(Blocks.BEDROCK) || state.isOf(Blocks.BARRIER) || state.isOf(Blocks.COMMAND_BLOCK)
            || state.isOf(Blocks.CHAIN_COMMAND_BLOCK) || state.isOf(Blocks.REPEATING_COMMAND_BLOCK)
            || state.isOf(Blocks.STRUCTURE_BLOCK) || state.isOf(Blocks.JIGSAW) || state.isOf(Blocks.LIGHT)) return false;
        if (state.getHardness(world, pos) < 0) return false;
        BlockEntity entity = world.getBlockEntity(pos);
        return entity == null;
    }
}
