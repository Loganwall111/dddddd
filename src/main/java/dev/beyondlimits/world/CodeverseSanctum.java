package dev.beyondlimits.world;

import dev.beyondlimits.ModBlocks;
import dev.beyondlimits.block.RiftTearBlock;
import net.minecraft.block.BlockState;
import net.minecraft.server.world.ServerWorld;
import net.minecraft.util.math.BlockPos;

/**
 * A deterministic, hand-authored first landing in a dimension whose actual terrain is otherwise void.
 * The geometry is assembled only when a player first crosses a seam, so it does not generate chunks
 * full of arbitrary noise or permanently mutate the source world's seed.
 */
public final class CodeverseSanctum {
    public static final int PLATFORM_Y = 96;
    private static final BlockState NULLSTONE = ModBlocks.NULLSTONE.getDefaultState();
    private static final BlockState CODEGLASS = ModBlocks.CODEGLASS.getDefaultState();
    private static final BlockState MEMORY = ModBlocks.MEMORY_CRYSTAL.getDefaultState();
    private static final BlockState FRACTURE = ModBlocks.FRACTURED_STONE.getDefaultState();

    private CodeverseSanctum() {
    }

    public static void ensure(ServerWorld world) {
        BlockPos gate = new BlockPos(0, PLATFORM_Y + 1, 0);
        if (world.getBlockState(gate).isOf(ModBlocks.REALITY_TEAR)) {
            return;
        }

        // The central island is a broken octagon, not a flat overworld-style floor.
        for (int x = -13; x <= 13; x++) {
            for (int z = -13; z <= 13; z++) {
                double radius = x * x + z * z;
                double edge = 154.0 + Math.sin(x * 0.7) * 3.2 + Math.cos(z * 0.51) * 2.6;
                if (radius > edge) continue;
                BlockState floor = radius > 119.0 ? CODEGLASS : NULLSTONE;
                if ((Math.abs(x) == 1 || Math.abs(z) == 1) && radius < 65.0) floor = FRACTURE;
                world.setBlockState(new BlockPos(x, PLATFORM_Y, z), floor, 3);
            }
        }

        // Concentric fragments make the landing feel like a deliberately assembled machine.
        for (int radius = 4; radius <= 11; radius += 3) {
            for (int step = 0; step < 48; step++) {
                double angle = (Math.PI * 2.0 * step) / 48.0;
                int x = (int) Math.round(Math.cos(angle) * radius);
                int z = (int) Math.round(Math.sin(angle) * radius);
                world.setBlockState(new BlockPos(x, PLATFORM_Y + 1, z), CODEGLASS, 3);
                if (step % 6 == 0) {
                    world.setBlockState(new BlockPos(x, PLATFORM_Y + 2, z), MEMORY, 3);
                }
            }
        }

        // Four broken pylons orbit the platform; gaps are intentional, like missing lines of code.
        int[][] pylons = {{-8, -8}, {8, -8}, {-8, 8}, {8, 8}};
        for (int i = 0; i < pylons.length; i++) {
            int px = pylons[i][0];
            int pz = pylons[i][1];
            int height = 7 + (i % 2) * 4;
            for (int y = 1; y <= height; y++) {
                if (y == 3 && i % 2 == 0) continue;
                world.setBlockState(new BlockPos(px, PLATFORM_Y + y, pz), y % 3 == 0 ? MEMORY : CODEGLASS, 3);
            }
            world.setBlockState(new BlockPos(px, PLATFORM_Y + height + 1, pz), MEMORY, 3);
        }

        // A split spine rises behind the gate, readable as a structure from across the void.
        for (int y = 1; y <= 18; y++) {
            int x = (y / 4) % 2 == 0 ? 0 : 1;
            int z = -10;
            world.setBlockState(new BlockPos(x, PLATFORM_Y + y, z), y % 4 == 0 ? MEMORY : NULLSTONE, 3);
            if (y % 5 != 0) {
                world.setBlockState(new BlockPos(x - 1, PLATFORM_Y + y, z), CODEGLASS, 3);
            }
        }

        // Satellite chunks hang in the darkness at slightly different heights.
        buildIsland(world, -27, PLATFORM_Y + 7, -19, 6, 17L);
        buildIsland(world, 28, PLATFORM_Y + 12, -12, 7, 43L);
        buildIsland(world, -20, PLATFORM_Y - 8, 29, 8, 71L);
        buildIsland(world, 28, PLATFORM_Y - 13, 23, 5, 103L);

        BlockState gateState = ModBlocks.REALITY_TEAR.getDefaultState().with(RiftTearBlock.STAGE, 3);
        world.setBlockState(gate, gateState, 3);
        world.setBlockState(new BlockPos(0, PLATFORM_Y + 1, -1), gateState, 3);
    }

    private static void buildIsland(ServerWorld world, int cx, int y, int cz, int radius, long seed) {
        for (int dx = -radius; dx <= radius; dx++) {
            for (int dz = -radius; dz <= radius; dz++) {
                double wobble = Math.sin((dx + seed) * 0.73) * 1.6 + Math.cos((dz - seed) * 0.47) * 1.4;
                if (dx * dx + dz * dz > radius * radius + wobble) continue;
                BlockState surface = ((dx * 13 + dz * 7 + (int) seed) & 3) == 0 ? CODEGLASS : NULLSTONE;
                world.setBlockState(new BlockPos(cx + dx, y, cz + dz), surface, 3);
                if (Math.abs(dx) + Math.abs(dz) < radius / 2 && (dx + dz) % 3 == 0) {
                    world.setBlockState(new BlockPos(cx + dx, y + 1, cz + dz), MEMORY, 3);
                }
            }
        }
        for (int i = 0; i < 4; i++) {
            int px = cx + (i % 2 == 0 ? -radius / 2 : radius / 2);
            int pz = cz + (i < 2 ? -radius / 2 : radius / 2);
            for (int yOffset = 1; yOffset <= 4 + (i % 2) * 2; yOffset++) {
                world.setBlockState(new BlockPos(px, y - yOffset, pz), yOffset % 3 == 0 ? MEMORY : FRACTURE, 3);
            }
        }
    }
}
