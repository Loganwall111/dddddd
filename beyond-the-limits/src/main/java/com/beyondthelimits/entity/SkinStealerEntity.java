package com.beyondthelimits.entity;

import net.minecraft.entity.EntityType;
import net.minecraft.entity.player.PlayerEntity;
import net.minecraft.text.Text;
import net.minecraft.world.World;

/**
 * The Skin-Stealer.
 *
 * <p>It walks like a player. It has your name tag. It will follow you for a while before it does
 * anything at all, and the only reliable tell is that it never answers the chat — the mod sends a
 * whisper in your name when one gets close, so the warning is always slightly too late.</p>
 */
public class SkinStealerEntity extends AbstractBackroomsEntity {
	private int mimicTicks;

	public SkinStealerEntity(EntityType<? extends SkinStealerEntity> type, World world) {
		super(type, world);
	}

	@Override
	public void tick() {
		super.tick();

		if (getWorld().isClient()) {
			return;
		}

		PlayerEntity closest = getWorld().getClosestPlayer(this, 32.0D);

		if (closest == null) {
			return;
		}

		mimicTicks++;

		// It copies your heading, not your position: it walks the way you just walked.
		if (mimicTicks > 40 && getRandom().nextInt(60) == 0) {
			setYaw(closest.getYaw());
			setVelocity(closest.getRotationVec(1.0F).normalize().multiply(0.22D).add(0.0D, getVelocity().y, 0.0D));
			velocityModified = true;
		}

		if (mimicTicks == 600 && !getWorld().isClient()) {
			if (getServer() != null) {
				getServer().getPlayerManager().broadcast(
						Text.translatable("message.beyondthelimits.skinstealer", closest.getName().getString()), true);
			}

			mimicTicks++;
		}
	}
}
