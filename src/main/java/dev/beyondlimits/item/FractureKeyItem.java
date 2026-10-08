package dev.beyondlimits.item;

import dev.beyondlimits.ModBlocks;
import dev.beyondlimits.block.RiftTearBlock;
import net.minecraft.block.BlockState;
import net.minecraft.block.Block;
import net.minecraft.item.Item;
import net.minecraft.item.ItemUsageContext;
import net.minecraft.server.world.ServerWorld;
import net.minecraft.text.Text;
import net.minecraft.util.ActionResult;
import net.minecraft.util.math.BlockPos;
import net.minecraft.world.World;

public final class FractureKeyItem extends Item {
    public FractureKeyItem(Settings settings) {
        super(settings);
    }

    @Override
    public ActionResult useOnBlock(ItemUsageContext context) {
        World world = context.getWorld();
        BlockPos pos = context.getBlockPos();
        BlockState state = world.getBlockState(pos);
        if (!state.isOf(ModBlocks.REALITY_TEAR)) {
            return ActionResult.PASS;
        }
        if (world.isClient) {
            return ActionResult.SUCCESS;
        }

        world.setBlockState(pos, state.with(RiftTearBlock.STAGE, 3), Block.NOTIFY_ALL);
        if (context.getPlayer() != null && !context.getPlayer().getAbilities().creativeMode) {
            context.getStack().damage(1, context.getPlayer(), ignored -> { });
        }
        if (context.getPlayer() != null) {
            context.getPlayer().sendMessage(Text.literal("The fracture key forces the seam open."), true);
        }
        ((ServerWorld) world).spawnParticles(net.minecraft.particle.ParticleTypes.END_ROD,
                pos.getX() + 0.5, pos.getY() + 0.5, pos.getZ() + 0.5, 18, 0.35, 0.45, 0.35, 0.06);
        return ActionResult.CONSUME;
    }
}
