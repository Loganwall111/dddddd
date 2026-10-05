package dev.logan.beyondthreshold.item;

import dev.logan.beyondthreshold.config.BTTConfig;
import dev.logan.beyondthreshold.entity.BlackHoleEntity;
import net.minecraft.entity.player.PlayerEntity;
import net.minecraft.item.Item;
import net.minecraft.item.ItemStack;
import net.minecraft.server.network.ServerPlayerEntity;
import net.minecraft.sound.SoundCategory;
import net.minecraft.sound.SoundEvents;
import net.minecraft.util.Hand;
import net.minecraft.util.TypedActionResult;
import net.minecraft.util.hit.HitResult;
import net.minecraft.util.math.BlockPos;
import net.minecraft.util.math.Vec3d;
import net.minecraft.world.World;

/**
 * A shattered relic of the membrane. Use: anchor a black hole where you
 * aim. Sneak + use: the relic overloads and the hole collapses instantly
 * — nuke physics.
 */
public class ShatteredRelicItem extends Item {
	public ShatteredRelicItem(Settings settings) {
		super(settings);
	}

	@Override
	public TypedActionResult<ItemStack> use(World world, PlayerEntity user, Hand hand) {
		if (!world.isClient) {
			HitResult hit = user.raycast(24.0, 0.0F, false);
			Vec3d pos;
			if (hit.getType() != HitResult.Type.MISS && hit.getPos() != null) {
				pos = hit.getPos().add(0.0, 2.0, 0.0);
			} else {
				pos = user.getPos().add(user.getRotationVec(1.0F).multiply(8.0)).add(0.0, 3.0, 0.0);
			}
			BlackHoleEntity hole = new BlackHoleEntity(world, pos.x, pos.y, pos.z,
					5.0F * BTTConfig.get().gravityScale);
			if (user.isSneaking()) {
				hole.triggerCollapse();
			}
			world.spawnEntity(hole);
			world.playSound(null, new BlockPos((int) pos.x, (int) pos.y, (int) pos.z),
					SoundEvents.BLOCK_RESPAWN_ANCHOR_SET_SPAWN, SoundCategory.HOSTILE, 2.0F, 0.5F);
			if (user instanceof ServerPlayerEntity sp) {
				sp.getItemCooldownManager().set(this, 30);
			}
		}
		return TypedActionResult.success(user.getStackInHand(hand));
	}
}
