package com.beyondthelimits.item;

import com.beyondthelimits.registry.BtlSounds;
import net.minecraft.entity.player.PlayerEntity;
import net.minecraft.item.Item;
import net.minecraft.item.ItemStack;
import net.minecraft.sound.SoundCategory;
import net.minecraft.util.Hand;
import net.minecraft.util.TypedActionResult;
import net.minecraft.world.World;

/**
 * The Guide.
 *
 * <p>Every player is handed one of these when they first join, because Chapter One does not tell
 * you what it is doing and a mod that quietly rewrites the world needs a manual that is written
 * like a field journal. The book opens a custom client screen (see
 * {@code client.GuidebookScreen}) with the twelve chapters of what has been happening to you.</p>
 */
public class GuidebookItem extends Item {
	public GuidebookItem(Settings settings) {
		super(settings);
	}

	@Override
	public TypedActionResult<ItemStack> use(World world, PlayerEntity user, Hand hand) {
		ItemStack stack = user.getStackInHand(hand);

		if (world.isClient()) {
			// Client-only class: referenced inside an isClient() branch on purpose.
			com.beyondthelimits.client.ClientHooks.openGuidebook();
		} else {
			world.playSound(null, user.getBlockPos(), BtlSounds.GUIDE_OPEN, SoundCategory.PLAYERS, 0.8F, 1.0F);
			com.beyondthelimits.core.engine.LoreEngine.onGuideOpened(user);
		}

		return TypedActionResult.success(stack);
	}
}
