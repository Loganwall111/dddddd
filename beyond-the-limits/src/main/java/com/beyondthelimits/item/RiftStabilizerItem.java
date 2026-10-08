package com.beyondthelimits.item;

import com.beyondthelimits.core.BtlConfig;
import com.beyondthelimits.core.BtlState;
import com.beyondthelimits.core.engine.RiftEngine;
import com.beyondthelimits.entity.RiftEntity;
import com.beyondthelimits.registry.BtlSounds;
import net.minecraft.entity.player.PlayerEntity;
import net.minecraft.item.Item;
import net.minecraft.item.ItemStack;
import net.minecraft.server.world.ServerWorld;
import net.minecraft.sound.SoundCategory;
import net.minecraft.text.Text;
import net.minecraft.util.Hand;
import net.minecraft.util.TypedActionResult;
import net.minecraft.util.math.Box;
import net.minecraft.world.World;

/**
 * Rift Stabilizer.
 *
 * <p>Closes every rift within 12 blocks and gives reality a little of itself back. It is the only
 * way in Chapter One to make the world <em>less</em> broken, and it is deliberately expensive: a
 * stabiliser will close a rift, but it will not undo what came through it.</p>
 */
public class RiftStabilizerItem extends Item {
	public RiftStabilizerItem(Settings settings) {
		super(settings);
	}

	@Override
	public TypedActionResult<ItemStack> use(World world, PlayerEntity user, Hand hand) {
		if (world.isClient()) {
			return TypedActionResult.success(user.getStackInHand(hand));
		}

		ServerWorld serverWorld = (ServerWorld) world;
		int closed = 0;

		for (RiftEntity rift : serverWorld.getEntitiesByClass(RiftEntity.class, new Box(user.getBlockPos()).expand(12.0D),
				entity -> true)) {
			RiftEngine.closeRift(serverWorld, rift);
			closed++;
		}

		if (closed > 0) {
			BtlState.get().addReality(BtlConfig.REALITY_PER_STABILIZER * Math.min(4, closed));
			world.playSound(null, user.getBlockPos(), BtlSounds.REALITY_TEAR, SoundCategory.PLAYERS, 1.0F, 0.6F);
			user.sendMessage(Text.translatable("item.beyondthelimits.rift_stabilizer.closed", closed), false);
			user.getStackInHand(hand).decrement(1);
		} else {
			user.sendMessage(Text.translatable("item.beyondthelimits.rift_stabilizer.none"), true);
		}

		return TypedActionResult.success(user.getStackInHand(hand));
	}
}
