package com.beyondthelimits.item;

import com.beyondthelimits.core.BtlState;
import com.beyondthelimits.registry.BtlSounds;
import net.minecraft.entity.player.PlayerEntity;
import net.minecraft.item.Item;
import net.minecraft.item.ItemStack;
import net.minecraft.sound.SoundCategory;
import net.minecraft.text.Text;
import net.minecraft.util.Hand;
import net.minecraft.util.TypedActionResult;
import net.minecraft.util.math.BlockPos;
import net.minecraft.world.World;

/**
 * Signal Receiver.
 *
 * <p>A radio that does not have an off switch. It picks up the Signal from a machine buried
 * thousands of blocks underground, and it gets louder the closer you are. The trick is that the
 * coordinates the machine transmits are always your own.</p>
 */
public class SignalReceiverItem extends Item {
	public SignalReceiverItem(Settings settings) {
		super(settings);
	}

	@Override
	public TypedActionResult<ItemStack> use(World world, PlayerEntity user, Hand hand) {
		if (world.isClient()) {
			return TypedActionResult.success(user.getStackInHand(hand));
		}

		BtlState state = BtlState.get();

		if (!state.hasSignal()) {
			user.sendMessage(Text.translatable("item.beyondthelimits.signal_receiver.silent"), true);
			return TypedActionResult.success(user.getStackInHand(hand));
		}

		BlockPos signal = new BlockPos(state.signalX(), state.signalY(), state.signalZ());
		int distance = (int) Math.sqrt(user.squaredDistanceTo(signal.getX(), signal.getY(), signal.getZ()));
		double bearing = Math.toDegrees(Math.atan2(signal.getZ() - user.getZ(), signal.getX() - user.getX()));

		int strength = Math.max(0, 15 - distance / 64);

		world.playSound(null, user.getBlockPos(), BtlSounds.SIGNAL_STATIC, SoundCategory.PLAYERS,
				0.4F + strength / 15.0F * 0.6F, 1.0F);

		user.sendMessage(Text.literal("§7[UNKNOWN TRANSMISSION] §fstrength " + "▮".repeat(Math.max(1, strength))
				+ "§7" + "▯".repeat(15 - Math.max(1, strength))), false);
		user.sendMessage(Text.literal("  bearing: " + (int) bearing + "°   distance: " + distance + "m"), false);
		state.hearSignal();
		return TypedActionResult.success(user.getStackInHand(hand));
	}
}
