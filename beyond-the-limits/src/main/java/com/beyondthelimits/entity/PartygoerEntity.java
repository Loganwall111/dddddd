package com.beyondthelimits.entity;

import net.minecraft.entity.EntityType;
import net.minecraft.entity.effect.StatusEffectInstance;
import net.minecraft.entity.effect.StatusEffects;
import net.minecraft.entity.player.PlayerEntity;
import net.minecraft.util.math.Vec3d;
import net.minecraft.world.World;

/**
 * Partygoer.
 *
 * <p>Chaotic, physical and relentlessly cheerful about it: a Partygoer does not just attack you,
 * it launches itself in an arc, screams, and tries to pin you in place. Killing one is easy.
 * Surviving the six that heard it die is not.</p>
 */
public class PartygoerEntity extends AbstractBackroomsEntity {
	private int leapCooldown = 40;

	public PartygoerEntity(EntityType<? extends PartygoerEntity> type, World world) {
		super(type, world);
	}

	@Override
	public void tick() {
		super.tick();

		if (getWorld().isClient()) {
			return;
		}

		leapCooldown--;

		PlayerEntity target = getWorld().getClosestPlayer(this, 16.0D);

		if (target == null || leapCooldown > 0) {
			return;
		}

		leapCooldown = 60 + getRandom().nextInt(60);
		Vec3d direction = target.getPos().subtract(getPos()).normalize();

		setVelocity(direction.x * 0.6D, 0.46D, direction.z * 0.6D);
		velocityModified = true;

		if (squaredDistanceTo(target) < 9.0D) {
			target.addStatusEffect(new StatusEffectInstance(StatusEffects.SLOWNESS, 60, 2, true, false), null);
		}
	}
}
