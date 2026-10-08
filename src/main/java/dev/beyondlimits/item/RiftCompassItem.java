package dev.beyondlimits.item;

import dev.beyondlimits.ModDimensions;
import dev.beyondlimits.ModBlocks;
import dev.beyondlimits.world.RealityState;
import net.minecraft.entity.player.PlayerEntity;
import net.minecraft.item.Item;
import net.minecraft.item.ItemStack;
import net.minecraft.server.world.ServerWorld;
import net.minecraft.text.Text;
import net.minecraft.util.Hand;
import net.minecraft.util.TypedActionResult;
import net.minecraft.util.math.BlockPos;
import net.minecraft.util.math.MathHelper;
import net.minecraft.world.World;

public final class RiftCompassItem extends Item {
    public RiftCompassItem(Settings settings) {
        super(settings);
    }

    @Override
    public TypedActionResult<ItemStack> use(World world, PlayerEntity user, Hand hand) {
        ItemStack stack = user.getStackInHand(hand);
        if (world.isClient) {
            return TypedActionResult.success(stack, true);
        }
        if (world.getRegistryKey().equals(ModDimensions.CODEVERSE)) {
            user.sendMessage(Text.literal("The compass needle has no north in the Codeverse."), true);
            return TypedActionResult.success(stack, false);
        }

        RealityState ledger = RealityState.get((ServerWorld) world);
        if (!ledger.hasLastRift()) {
            user.sendMessage(Text.literal("The needle is still. No seam has opened yet."), true);
            return TypedActionResult.success(stack, false);
        }

        BlockPos target = ledger.getLastRiftPos();
        double distance = Math.sqrt(user.squaredDistanceTo(target.getX() + 0.5, target.getY() + 0.5, target.getZ() + 0.5));
        String status = world.getBlockState(target).isOf(ModBlocks.REALITY_TEAR) ? "open" : "quiet";
        int blocks = MathHelper.floor(distance);
        user.sendMessage(Text.literal("Rift bearing: " + blocks + " blocks — last seam is " + status + "."), true);
        return TypedActionResult.success(stack, false);
    }
}
