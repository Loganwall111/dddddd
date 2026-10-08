package dev.beyondlimits.world;

import dev.beyondlimits.ModBlocks;
import dev.beyondlimits.block.RiftTearBlock;
import net.minecraft.block.BlockState;
import net.minecraft.server.world.ServerWorld;
import net.minecraft.util.math.BlockPos;

/** Small, readable scar site built around a newly surfaced tear. */
public final class RiftShrine {
    private RiftShrine() {
    }

    public static BlockPos build(ServerWorld world, BlockPos floor, int stage) {
        BlockState fractured = ModBlocks.FRACTURED_STONE.getDefaultState();
        BlockState nullstone = ModBlocks.NULLSTONE.getDefaultState();
        BlockState codeglass = ModBlocks.CODEGLASS.getDefaultState();

        for (int dx = -3; dx <= 3; dx++) {
            for (int dz = -3; dz <= 3; dz++) {
                int distance = dx * dx + dz * dz;
                if (distance > 3 && distance <= 12) {
                    BlockPos tile = floor.add(dx, 0, dz);
                    if (world.getBlockState(tile).isSolidBlock(world, tile)) {
                        world.setBlockState(tile, (distance % 2 == 0 ? fractured : nullstone), 3);
                    }
                }
            }
        }

        int[][] spires = {{-3, 0}, {3, 0}, {0, -3}, {0, 3}};
        for (int i = 0; i < spires.length; i++) {
            int height = 2 + (i % 2) + (stage >= 2 ? 1 : 0);
            for (int y = 1; y <= height; y++) {
                BlockState material = y == height && stage >= 2 ? codeglass : nullstone;
                world.setBlockState(floor.add(spires[i][0], y, spires[i][1]), material, 3);
            }
        }

        BlockPos tear = floor.up();
        BlockState tearState = ModBlocks.REALITY_TEAR.getDefaultState().with(RiftTearBlock.STAGE, stage);
        world.setBlockState(tear, tearState, 3);
        return tear;
    }
}
