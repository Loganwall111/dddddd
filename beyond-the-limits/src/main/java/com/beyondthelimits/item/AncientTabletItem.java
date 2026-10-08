package com.beyondthelimits.item;

import com.beyondthelimits.core.engine.LoreEngine;
import com.beyondthelimits.registry.BtlSounds;
import net.minecraft.entity.player.PlayerEntity;
import net.minecraft.item.Item;
import net.minecraft.item.ItemStack;
import net.minecraft.sound.SoundCategory;
import net.minecraft.util.Hand;
import net.minecraft.util.TypedActionResult;
import net.minecraft.world.World;

/**
 * Ancient Tablet: a fragment of the civilization that was not there.
 *
 * <p>Every tablet prints a different piece of the story, in the order the player finds them, and
 * the story is the answer to the question the mod asks from the first rift: what was here before
 * Minecraft was?</p>
 */
public class AncientTabletItem extends Item {
	public AncientTabletItem(Settings settings) {
		super(settings);
	}

	@Override
	public TypedActionResult<ItemStack> use(World world, PlayerEntity user, Hand hand) {
		if (world.isClient()) {
			return TypedActionResult.success(user.getStackInHand(hand));
		}

		LoreEngine.readTablet(user);
		world.playSound(null, user.getBlockPos(), BtlSounds.MEMORY_CHIME, SoundCategory.PLAYERS, 0.8F, 0.7F);
		return TypedActionResult.success(user.getStackInHand(hand));
	}
}
