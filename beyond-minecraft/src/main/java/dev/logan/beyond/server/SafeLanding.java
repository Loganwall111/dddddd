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
        // A small, explicitly authored arrival plinth. Only empty space can be modified, so this
        // walks a handful of columns and a range of heights instead of giving up on a mountain.
        int ceiling = world.getTopY() - (int) Math.ceil(height) - 3;
        for (int[] offset : OFFSETS) {
            BlockPos column = base.add(offset[0], 0, offset[1]);
            if (!world.getWorldBorder().contains(column)) continue;
            int surface = world.getTopPosition(Heightmap.Type.MOTION_BLOCKING_NO_LEAVES, column).getY();
            for (int y : new int[]{surface + 5, surface + 14, 192, 224, 256, 288, world.getBottomY() + 24}) {
                if (y <= world.getBottomY() + 2 || y > ceiling) continue;
                BlockPos center = new BlockPos(column.getX(), y, column.getZ());
                boolean clear = true;
                for (BlockPos p : BlockPos.iterate(center.add(-radius, -1, -radius), center.add(radius, (int) Math.ceil(height), radius))) {
                    if (!world.getWorldBorder().contains(p) || !world.isAir(p)) { clear = false; break; }
                }
                if (!clear) continue;
                for (BlockPos p : BlockPos.iterate(center.add(-radius, -1, -radius), center.add(radius, -1, radius)))
                    if (world.isAir(p)) world.setBlockState(p, pad.getDefaultState(), Block.NOTIFY_ALL);
                return Optional.of(center.toBottomCenterPos());
            }
        }
        return Optional.empty();
    }
    private static boolean safe(ServerWorld world, BlockPos feet, double width, double height) {
        if (feet.getY() <= world.getBottomY() || feet.getY() + height + 1 >= world.getTopY()) return false;
        var floor = world.getBlockState(feet.down());
        if (!floor.isSideSolidFullSquare(world, feet.down(), Direction.UP) || floor.isOf(Blocks.MAGMA_BLOCK) ||
            floor.isOf(Blocks.CACTUS) || floor.isOf(Blocks.CAMPFIRE) || floor.isOf(Blocks.SOUL_CAMPFIRE)) return false;
        Vec3d point = feet.toBottomCenterPos();
        Box box = new Box(point.x - width / 2, point.y, point.z - width / 2, point.x + width / 2, point.y + height, point.z + width / 2);
        return world.isSpaceEmpty(box) && !world.containsFluid(box);
    }
}
