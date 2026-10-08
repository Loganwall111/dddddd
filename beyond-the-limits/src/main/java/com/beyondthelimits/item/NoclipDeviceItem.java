package com.beyondthelimits.item;

import com.beyondthelimits.core.engine.BackroomsEngine;
import net.minecraft.entity.player.PlayerEntity;
import net.minecraft.item.Item;
import net.minecraft.item.ItemStack;
import net.minecraft.server.network.ServerPlayerEntity;
import net.minecraft.util.Hand;
import net.minecraft.util.TypedActionResult;
import net.minecraft.world.World;

/**
 * Noclip Device.
 *
 * <p>Entry number three into the Backrooms, on demand. It is deliberately the least creepy way in:
 * the device is a working piece of equipment that does exactly what it says, which makes the
 * <em>other</em> two ways (falling through corrupted grass, and the warehouse gate) feel worse by
 * comparison.</p>
 */
public class NoclipDeviceItem extends Item {
	public NoclipDeviceItem(Settings settings) {
		super(settings);
	}

	@Override
	public TypedActionResult<ItemStack> use(World world, PlayerEntity user, Hand hand) {
		if (world.isClient()) {
			return TypedActionResult.success(user.getStackInHand(hand));
		}

		if (user instanceof ServerPlayerEntity serverPlayer) {
			BackroomsEngine.enterViaNoclipDevice(serverPlayer);
			user.getStackInHand(hand).decrement(1);
		}

		return TypedActionResult.success(user.getStackInHand(hand));
	}
}
