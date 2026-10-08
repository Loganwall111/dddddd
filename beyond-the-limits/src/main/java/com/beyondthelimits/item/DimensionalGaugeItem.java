package com.beyondthelimits.item;

import com.beyondthelimits.core.BtlConfig;
import com.beyondthelimits.core.BtlState;
import com.beyondthelimits.core.engine.GravityEngine;
import net.minecraft.entity.player.PlayerEntity;
import net.minecraft.item.Item;
import net.minecraft.item.ItemStack;
import net.minecraft.text.Text;
import net.minecraft.util.Hand;
import net.minecraft.util.TypedActionResult;
import net.minecraft.world.World;

/**
 * Dimensional Gravity Gauge.
 *
 * <p>Dimensional gravity is the mod's butterfly effect: every change you make in another dimension
 * is stored as debt, and that debt is spent on the Overworld the moment you come back. This gauge
 * shows the debt, how many mutations are queued, and how long until it is spent.</p>
 */
public class DimensionalGaugeItem extends Item {
	public DimensionalGaugeItem(Settings settings) {
		super(settings);
	}

	@Override
	public TypedActionResult<ItemStack> use(World world, PlayerEntity user, Hand hand) {
		if (world.isClient()) {
			return TypedActionResult.success(user.getStackInHand(hand));
		}

		BtlState state = BtlState.get();
		int debt = state.gravity(user.getUuid());
		int queued = debt / BtlConfig.GRAVITY_PER_MUTATION;

		user.sendMessage(Text.literal("§b▌ DIMENSIONAL GRAVITY"), false);
		user.sendMessage(Text.literal("  debt: " + debt + " / " + BtlConfig.GRAVITY_MAX), false);
		user.sendMessage(Text.literal("  queued mutations: " + queued), false);
		user.sendMessage(Text.literal("  " + GravityEngine.describeNextMutation(state)), false);
		return TypedActionResult.success(user.getStackInHand(hand));
	}
}
