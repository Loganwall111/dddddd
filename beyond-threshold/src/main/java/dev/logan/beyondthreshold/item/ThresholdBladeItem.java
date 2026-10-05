package dev.logan.beyondthreshold.item;

import dev.logan.beyondthreshold.entity.RealityTearEntity;
import dev.logan.beyondthreshold.world.BTTDimensions;
import net.minecraft.entity.player.PlayerEntity;
import net.minecraft.item.Item;
import net.minecraft.item.ItemStack;
import net.minecraft.nbt.NbtCompound;
import net.minecraft.server.network.ServerPlayerEntity;
import net.minecraft.sound.SoundCategory;
import net.minecraft.sound.SoundEvents;
import net.minecraft.text.Text;
import net.minecraft.util.Hand;
import net.minecraft.util.TypedActionResult;
import net.minecraft.util.math.Vec3d;
import net.minecraft.world.World;

/**
 * The knife that cuts the fabric of reality. Use: tear a shimmering
 * membrane open in front of you; walk through to travel.
 * Sneak + use: cycle which procedural dimension the tear connects to.
 */
public class ThresholdBladeItem extends Item {
	public ThresholdBladeItem(Settings settings) {
		super(settings);
	}

	@Override
	public TypedActionResult<ItemStack> use(World world, PlayerEntity user, Hand hand) {
		if (!world.isClient) {
			ItemStack stack = user.getStackInHand(hand);
			NbtCompound nbt = stack.getOrCreateNbt();
			int dim = nbt.getInt("btt_dim");
			if (user.isSneaking()) {
				dim = Math.floorMod(dim + 1, Math.max(1, BTTDimensions.ALL.size()));
				nbt.putInt("btt_dim", dim);
				user.sendMessage(Text.translatable("message.beyondthreshold.tear_target",
						BTTDimensions.byIndex(dim).getValue().toString()), true);
				return TypedActionResult.success(stack);
			}
			Vec3d fwd = user.getRotationVec(1.0F);
			Vec3d pos = user.getEyePos().add(fwd.multiply(3.5)).subtract(0.0, 0.6, 0.0);
			world.spawnEntity(new RealityTearEntity(world, pos.x, pos.y, pos.z, dim, user.getYaw()));
			world.playSound(null, user.getBlockPos(), SoundEvents.ITEM_TRIDENT_THROW,
					SoundCategory.PLAYERS, 1.0F, 1.3F);
			if (user instanceof ServerPlayerEntity sp) {
				sp.getItemCooldownManager().set(this, 20);
			}
		}
		return TypedActionResult.success(user.getStackInHand(hand));
	}
}
