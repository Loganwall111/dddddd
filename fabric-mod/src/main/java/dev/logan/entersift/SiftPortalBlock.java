package dev.logan.entersift;

import java.util.ArrayDeque;
import java.util.HashSet;
import java.util.Set;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.level.BlockGetter;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.phys.shapes.CollisionContext;
import net.minecraft.world.phys.shapes.Shapes;
import net.minecraft.world.phys.shapes.VoxelShape;

/**
 * 0.17 ancient-city portal block (like a nether portal sheet): no collision, light 15, translucent
 * animated cyan mosaic, glass-like faces between neighbours are hidden. Breaking one block collapses
 * the whole connected sheet; the datapack's portal/check then sees the gap and closes the portal.
 */
public class SiftPortalBlock extends Block {
    private static final int MAX_SHEET = 1024;

    public SiftPortalBlock(Properties properties) { super(properties); }

    @Override
    protected VoxelShape getCollisionShape(BlockState state, BlockGetter level, BlockPos pos, CollisionContext context) {
        return Shapes.empty();
    }

    @Override
    protected boolean skipRendering(BlockState state, BlockState adjacent, Direction direction) {
        return adjacent.getBlock() instanceof SiftPortalBlock || super.skipRendering(state, adjacent, direction);
    }

    @Override
    public BlockState playerWillDestroy(Level level, BlockPos pos, BlockState state, Player player) {
        if (level instanceof ServerLevel) collapse(level, pos);
        return super.playerWillDestroy(level, pos, state, player);
    }

    /** Removes every portal block connected to {@code origin} (not origin itself; the player breaks that one). */
    static void collapse(Level level, BlockPos origin) {
        Set<BlockPos> seen = new HashSet<>();
        ArrayDeque<BlockPos> queue = new ArrayDeque<>();
        queue.add(origin);
        seen.add(origin);
        while (!queue.isEmpty() && seen.size() < MAX_SHEET) {
            BlockPos p = queue.poll();
            for (Direction d : Direction.values()) {
                BlockPos n = p.relative(d);
                if (seen.contains(n) || !(level.getBlockState(n).getBlock() instanceof SiftPortalBlock)) continue;
                seen.add(n);
                queue.add(n);
            }
        }
        for (BlockPos p : seen) if (!p.equals(origin)) level.setBlock(p, Blocks.AIR.defaultBlockState(), 2);
    }
}
