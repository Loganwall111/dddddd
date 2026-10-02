package dev.logan.riftext;

import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.RenderShape;
import net.minecraft.world.level.block.state.BlockState;

/**
 * Invisible anchor block used as a fallback for legacy rift rendering.
 * In the current system, rifts are {@link RiftPortalEntity} instances and this block is unused,
 * but it is kept for compatibility with the main SIFT mod's data pack functions.
 */
public final class RiftAnchorBlock extends Block {
    public RiftAnchorBlock(Properties properties) { super(properties); }

    @Override
    protected RenderShape getRenderShape(BlockState state) { return RenderShape.INVISIBLE; }
}