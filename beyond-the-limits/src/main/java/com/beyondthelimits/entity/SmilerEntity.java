package com.beyondthelimits.entity;

import net.minecraft.entity.EntityType;
import net.minecraft.entity.player.PlayerEntity;
import net.minecraft.particle.ParticleTypes;
import net.minecraft.util.math.Vec3d;
import net.minecraft.world.World;

/**
 * The Smiler.
 *
 * <p>Level 0's worst-kept secret: a thing that is only visible as a crescent of teeth in the dark.
 * It does not chase you in the open — it hugs the unlit corridors, closes in when your light goes
 * out, and is at its most aggressive in complete darkness, which is why the first thing every
 * Backrooms player learns is to never let their torch die.</p>
 */
public class SmilerEntity extends AbstractBackroomsEntity {
	public SmilerEntity(EntityType<? extends SmilerEntity> type, World world) {
		super(type, world);
	}

	@Override
	public void tick() {
		super.tick();

		if (getWorld().isClient()) {
			if (getRandom().nextInt(4) == 0) {
				for (int i = 0; i < 2; i++) {
					getWorld().addParticle(ParticleTypes.SCULK_SOUL,
							getX() + (getRandom().nextDouble() - 0.5D) * 0.6D,
							getY() + 1.6D, getZ() + (getRandom().nextDouble() - 0.5D) * 0.6D,
							0.0D, 0.0D, 0.0D);
				}
			}

			return;
		}

		PlayerEntity target = getWorld().getClosestPlayer(this, 24.0D);

		if (target != null && getWorld().getLightLevel(getBlockPos()) < 4) {
			Vec3d step = target.getPos().subtract(getPos()).normalize().multiply(0.14D);
			setVelocity(getVelocity().add(step.x, 0.0D, step.z));
			velocityModified = true;
		}
	}

	@Override
	public boolean isInvisibleTo(PlayerEntity player) {
		// Visible exactly when it wants to be: in the dark, briefly, as teeth.
		return getWorld().getLightLevel(getBlockPos()) > 6;
	}

	@Override
	protected boolean isDisallowedInPeaceful() {
		return true;
	}
}
