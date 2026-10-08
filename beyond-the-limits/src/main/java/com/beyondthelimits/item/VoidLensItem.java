package com.beyondthelimits.item;

import com.beyondthelimits.core.engine.RiftEngine;
import net.minecraft.entity.player.PlayerEntity;
import net.minecraft.item.Item;
import net.minecraft.item.ItemStack;
import net.minecraft.server.world.ServerWorld;
import net.minecraft.text.Text;
import net.minecraft.util.Hand;
import net.minecraft.util.TypedActionResult;
import net.minecraft.world.World;

/**
 * Void Lens.
 *
 * <p>Rifts that are still too small to walk through are almost invisible until you are on top of
 * them. The lens shows every tear within 96 blocks for a few seconds, which turns "the world feels
 * wrong here" into a map of exactly where it is wrong.</p>
 */
public class VoidLensItem extends Item {
	public VoidLensItem(Settings settings) {
		super(settings);
	}

	@Override
	public TypedActionResult<ItemStack> use(World world, PlayerEntity user, Hand hand) {
		if (world.isClient()) {
			com.beyondthelimits.client.ClientHooks.onLensActivated();
			return TypedActionResult.success(user.getStackInHand(hand));
		}

		int revealed = RiftEngine.revealNearby((ServerWorld) world, user, 96.0D);
		user.sendMessage(Text.translatable("item.beyondthelimits.void_lens.revealed", revealed), true);
		return TypedActionResult.success(user.getStackInHand(hand));
	}
}
