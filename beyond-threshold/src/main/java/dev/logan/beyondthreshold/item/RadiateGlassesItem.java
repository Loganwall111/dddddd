package dev.logan.beyondthreshold.item;

import dev.logan.beyondthreshold.BeyondTheThreshold;
import dev.logan.beyondthreshold.BTTNet;
import net.minecraft.entity.player.PlayerEntity;
import net.minecraft.item.Item;
import net.minecraft.item.ItemStack;
import net.minecraft.server.network.ServerPlayerEntity;
import net.minecraft.sound.SoundCategory;
import net.minecraft.sound.SoundEvents;
import net.minecraft.text.Text;
import net.minecraft.util.Hand;
import net.minecraft.util.TypedActionResult;
import net.minecraft.world.World;

/**
 * Radiate Reality glasses. While worn, the Mandela Effect shader suite
 * is unlocked: cycle procedural realities with the V key (or /btt mandela).
 */
public class RadiateGlassesItem extends Item {
	public RadiateGlassesItem(Settings settings) {
		super(settings);
	}

	@Override
	public TypedActionResult<ItemStack> use(World world, PlayerEntity user, Hand hand) {
		if (!world.isClient && user instanceof ServerPlayerEntity sp) {
			boolean worn = !user.getCommandTags().contains(BeyondTheThreshold.TAG_GLASSES);
			if (worn) {
				user.getCommandTags().add(BeyondTheThreshold.TAG_GLASSES);
			} else {
				user.getCommandTags().remove(BeyondTheThreshold.TAG_GLASSES);
			}
			BTTNet.sendGlasses(sp, worn);
			user.sendMessage(Text.translatable(worn
					? "message.beyondthreshold.glasses_on"
					: "message.beyondthreshold.glasses_off"), true);
			world.playSound(null, user.getBlockPos(), SoundEvents.ITEM_ARMOR_EQUIP_GENERIC,
					SoundCategory.PLAYERS, 1.0F, worn ? 1.4F : 0.7F);
		}
		return TypedActionResult.success(user.getStackInHand(hand));
	}
}
