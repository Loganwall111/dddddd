package com.beyondthelimits.item;

import com.beyondthelimits.core.engine.StormEngine;
import net.minecraft.entity.player.PlayerEntity;
import net.minecraft.item.Item;
import net.minecraft.item.ItemStack;
import net.minecraft.server.world.ServerWorld;
import net.minecraft.text.Text;
import net.minecraft.util.Hand;
import net.minecraft.util.TypedActionResult;
import net.minecraft.world.World;

/**
 * Storm Beacon.
 *
 * <p>Forces a dimensional storm. This is a tool for players and modpack authors who want to see
 * what the mod does without waiting for the world to do it to them — and a warning, because a
 * storm in Chapter One is not weather.</p>
 */
public class StormBeaconItem extends Item {
	public StormBeaconItem(Settings settings) {
		super(settings);
	}

	@Override
	public TypedActionResult<ItemStack> use(World world, PlayerEntity user, Hand hand) {
		if (world.isClient()) {
			return TypedActionResult.success(user.getStackInHand(hand));
		}

		ServerWorld serverWorld = (ServerWorld) world;

		if (StormEngine.isStormActive()) {
			user.sendMessage(Text.translatable("item.beyondthelimits.storm_beacon.active"), true);
			return TypedActionResult.fail(user.getStackInHand(hand));
		}

		StormEngine.beginStorm(serverWorld, 80, 2400);
		user.sendMessage(Text.translatable("item.beyondthelimits.storm_beacon.started"), false);
		user.getStackInHand(hand).decrement(1);
		return TypedActionResult.success(user.getStackInHand(hand));
	}
}
