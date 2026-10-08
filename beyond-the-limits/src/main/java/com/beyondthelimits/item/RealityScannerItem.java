package com.beyondthelimits.item;

import com.beyondthelimits.core.BtlState;
import com.beyondthelimits.network.BtlNetworking;
import net.minecraft.entity.player.PlayerEntity;
import net.minecraft.item.Item;
import net.minecraft.item.ItemStack;
import net.minecraft.server.network.ServerPlayerEntity;
import net.minecraft.text.Text;
import net.minecraft.util.Hand;
import net.minecraft.util.TypedActionResult;
import net.minecraft.world.World;

/**
 * Reality Scanner: the mod's "diagnostics" item.
 *
 * <p>It reads the world's current reality integrity, the player's dementia, their dimensional
 * gravity debt and how far the sky has cracked, and prints it the way a scanner would — as numbers
 * with no explanation of what they mean.</p>
 */
public class RealityScannerItem extends Item {
	public RealityScannerItem(Settings settings) {
		super(settings);
	}

	@Override
	public TypedActionResult<ItemStack> use(World world, PlayerEntity user, Hand hand) {
		if (world.isClient()) {
			com.beyondthelimits.client.ClientHooks.onScannerPulse();
			return TypedActionResult.success(user.getStackInHand(hand));
		}

		BtlState state = BtlState.get();

		user.sendMessage(Text.translatable("item.beyondthelimits.reality_scanner.readout"), false);
		user.sendMessage(Text.literal("  REALITY .......... " + state.reality() + "%"), false);
		user.sendMessage(Text.literal("  DEMENTIA ......... " + state.dementia(user.getUuid()) + "/1000"), false);
		user.sendMessage(Text.literal("  DIM. GRAVITY ..... " + state.gravity(user.getUuid()) + "/1000"), false);
		user.sendMessage(Text.literal("  SKY INTEGRITY .... " + (100 - state.skyCrack()) + "%"), false);
		user.sendMessage(Text.literal("  COLLISION ........ " + state.collision() + "%"), false);
		user.sendMessage(Text.literal("  RIFTS ............ " + state.riftCount()), false);

		if (state.blackSunStage() > 0) {
			user.sendMessage(Text.literal("  BLACK SUN ........ stage " + state.blackSunStage()), false);
		}

		if (state.hasSignal()) {
			int distance = (int) Math.sqrt(user.squaredDistanceTo(state.signalX(), state.signalY(), state.signalZ()));
			user.sendMessage(Text.literal("  SIGNAL ........... " + distance + "m"), false);
		}

		if (user instanceof ServerPlayerEntity serverPlayer) {
			BtlNetworking.sendRealitySync(serverPlayer);
		}

		return TypedActionResult.success(user.getStackInHand(hand));
	}
}
