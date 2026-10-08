package com.beyondthelimits.item;

import com.beyondthelimits.entity.RealityWarheadEntity;
import com.beyondthelimits.registry.BtlEntities;
import net.minecraft.entity.SpawnReason;
import net.minecraft.entity.player.PlayerEntity;
import net.minecraft.item.Item;
import net.minecraft.item.ItemStack;
import net.minecraft.server.world.ServerWorld;
import net.minecraft.text.Text;
import net.minecraft.util.Hand;
import net.minecraft.util.TypedActionResult;
import net.minecraft.util.math.BlockPos;
import net.minecraft.world.World;

/**
 * Reality Warhead: place, back away, and watch a shockwave eat the landscape.
 *
 * <p>Because the mod's explosions are real timelines rather than single-tick events, the block
 * damage is not instant. The player has time to watch the ring approach, which is the difference
 * between "an explosion happened" and "something is happening to the world and it is coming this
 * way".</p>
 */
public class RealityWarheadItem extends Item {
	public RealityWarheadItem(Settings settings) {
		super(settings);
	}

	@Override
	public TypedActionResult<ItemStack> use(World world, PlayerEntity user, Hand hand) {
		if (world.isClient()) {
			return TypedActionResult.success(user.getStackInHand(hand));
		}

		ServerWorld serverWorld = (ServerWorld) world;
		BlockPos target = user.getBlockPos().add(user.getHorizontalFacing().getVector().multiply(4));

		RealityWarheadEntity warhead = BtlEntities.WARHEAD.create(serverWorld, SpawnReason.TRIGGERED);

		if (warhead == null) {
			return TypedActionResult.fail(user.getStackInHand(hand));
		}

		warhead.refreshPositionAndAngles(target.getX() + 0.5D, target.getY() + 1.0D, target.getZ() + 0.5D, 0.0F, 0.0F);
		// 200 ticks = ten seconds of fuse: enough time to get clear, short enough to be terrifying.
		warhead.arm(200, 42.0F);
		serverWorld.spawnEntity(warhead);

		user.sendMessage(Text.translatable("item.beyondthelimits.reality_warhead.armed"), false);
		user.getStackInHand(hand).decrement(1);
		return TypedActionResult.success(user.getStackInHand(hand));
	}
}
