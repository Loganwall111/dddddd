package dev.logan.entersift;

import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.RenderShape;
import net.minecraft.world.level.block.state.BlockState;

/**
 * Never placed in the world: shown by one block display per rift/portal as an invisible anchor.
 * (Legacy, pre-0.10: rifts are now RiftPortalEntity.) The old client renderer found these displays and draws the shader-like opening. The display's
 * glow_color_override picks the style (0 overworld, 1 sift day, 2 end, 3 sift night, 4 nether,
 * 5 portal), width/height give the opening size and yaw (Rotation) gives its facing.
 */
public final class RiftAnchorBlock extends Block {
    public RiftAnchorBlock(Properties properties) { super(properties); }

    @Override
    protected RenderShape getRenderShape(BlockState state) { return RenderShape.INVISIBLE; }
}
