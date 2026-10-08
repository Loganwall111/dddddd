package dev.beyondlimits.block;

import dev.beyondlimits.ModItems;
import dev.beyondlimits.world.RealityState;
import net.minecraft.block.Block;
import net.minecraft.block.BlockState;
import net.minecraft.entity.player.PlayerEntity;
import net.minecraft.item.ItemStack;
import net.minecraft.server.world.ServerWorld;
import net.minecraft.sound.SoundCategory;
import net.minecraft.sound.SoundEvents;
import net.minecraft.text.Text;
import net.minecraft.util.ActionResult;
import net.minecraft.util.Hand;
import net.minecraft.util.math.BlockPos;
import net.minecraft.util.hit.BlockHitResult;
import net.minecraft.world.World;

public final class RealityAnchorBlock extends Block {
    public RealityAnchorBlock(Settings settings) {
        super(settings);
    }

    @Override
    public ActionResult onUse(BlockState state, World world, BlockPos pos, PlayerEntity player, Hand hand, BlockHitResult hit) {
        ItemStack held = player.getStackInHand(hand);
        if (!held.isOf(ModItems.RIFT_SHARD)) {
            return ActionResult.PASS;
        }
        if (world.isClient) {
            return ActionResult.SUCCESS;
        }

        if (!player.getAbilities().creativeMode) {
            held.decrement(1);
        }
        RealityState.get((ServerWorld) world).adjustStability(8);
        world.playSound(null, pos, SoundEvents.BLOCK_BEACON_POWER_SELECT, SoundCategory.BLOCKS, 0.9F, 1.25F);
        player.sendMessage(Text.literal("The anchor stitches the local reality back together. +8 integrity."), true);
        return ActionResult.CONSUME;
    }
}
