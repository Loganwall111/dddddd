package dev.logan.beyond.server;

import net.minecraft.block.Block;
import net.minecraft.block.Blocks;
import net.minecraft.server.world.ServerWorld;
import net.minecraft.util.math.BlockPos;
import net.minecraft.util.math.Box;
import net.minecraft.util.math.Direction;
import net.minecraft.util.math.Vec3d;
import net.minecraft.world.Heightmap;
import java.util.Optional;

/** Bounded search, no terrain carving and no permanent chunk tickets. */
public final class SafeLanding {
    private SafeLanding() {}
    private static final int[][] OFFSETS = {{0,0}, {4,0}, {-4,0}, {0,4}, {0,-4}, {8,8}, {-8,8}, {8,-8}, {-8,-8}};
    public static Optional<Vec3d> find(ServerWorld world, Vec3d preferred, double width, double height, boolean allowAirPad, Block pad) {
        if (!Double.isFinite(preferred.x) || !Double.isFinite(preferred.y) || !Double.isFinite(preferred.z)) return Optional.empty();
        BlockPos base = BlockPos.ofFloored(preferred);
        for (int[] offset : OFFSETS) {
            BlockPos p = base.add(offset[0], 0, offset[1]);
            if (!world.getWorldBorder().contains(p)) continue;
            world.getChunk(p); // synchronous but at most nine nearby chunks; never permanently force-loaded
            for (int dy : new int[]{0, 1, 2, 3, -1}) {
                BlockPos feet = p.up(dy);
                if (safe(world, feet, width, height)) return Optional.of(feet.toBottomCenterPos());
            }
            BlockPos surface = world.getTopPosition(Heightmap.Type.MOTION_BLOCKING_NO_LEAVES, p);
            if (safe(world, surface, width, height)) return Optional.of(surface.toBottomCenterPos());
        }
        if (!allowAirPad) return Optional.empty();
        int radius = Math.max(2, (int) Math.ceil(width / 2) + 1);
        int clearance = (int) Math.ceil(height);
        // Put an explicitly authored arrival plinth just above the local terrain. Fixed altitudes
        // fail in tall noise realms; sample the whole footprint and only modify air blocks.
        for (int[] offset : OFFSETS) {
            BlockPos centerColumn = base.add(offset[0], 0, offset[1]);
            int highestSurface = world.getBottomY() + 1;
            boolean insideBorder = true;
            for (int dx = -radius; dx <= radius && insideBorder; dx++) {
                for (int dz = -radius; dz <= radius; dz++) {
                    BlockPos sample = centerColumn.add(dx, 0, dz);
                    if (!world.getWorldBorder().contains(sample)) { insideBorder = false; break; }
                    highestSurface = Math.max(highestSurface,
                        world.getTopPosition(Heightmap.Type.MOTION_BLOCKING_NO_LEAVES, sample).getY());
                }
            }
            if (!insideBorder) continue;
            int y = Math.max(base.getY(), highestSurface + 1);
            if (y + clearance + 1 >= world.getTopY()) continue;
            BlockPos center = new BlockPos(centerColumn.getX(), y, centerColumn.getZ());
            boolean clear = true;
            for (BlockPos p : BlockPos.iterate(center.add(-radius, -1, -radius), center.add(radius, clearance, radius))) {
                if (!world.getWorldBorder().contains(p) || !world.isAir(p)) { clear = false; break; }
            }
            if (!clear) continue;
            for (BlockPos p : BlockPos.iterate(center.add(-radius, -1, -radius), center.add(radius, -1, radius)))
                world.setBlockState(p, pad.getDefaultState(), Block.NOTIFY_ALL);
            return Optional.of(center.toBottomCenterPos());
        }
        return Optional.empty();
    }
    private static boolean safe(ServerWorld world, BlockPos feet, double width, double height) {
        if (feet.getY() <= world.getBottomY() || feet.getY() + height + 2 >= world.getTopY()) return false;
        var floor = world.getBlockState(feet.down());
        if (!floor.isSideSolidFullSquare(world, feet.down(), Direction.UP) || floor.isOf(Blocks.MAGMA_BLOCK) ||
            floor.isOf(Blocks.CACTUS) || floor.isOf(Blocks.CAMPFIRE) || floor.isOf(Blocks.SOUL_CAMPFIRE)) return false;
        Vec3d point = feet.toBottomCenterPos();
        // One extra block of headroom on top of the body: an arrival must also leave room for a
        // membrane or well to open in front of you, which is how Beyond spaces are meant to be
        // entered. Without it, arrivals landed in the maze's two-high slots with nowhere to go.
        Box box = new Box(point.x - width / 2, point.y, point.z - width / 2, point.x + width / 2, point.y + height + 1, point.z + width / 2);
        return world.isSpaceEmpty(box) && !world.containsFluid(box);
    }
}
