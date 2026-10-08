package com.beyondthelimits.entity;

import net.minecraft.entity.EntityType;
import net.minecraft.entity.ai.goal.ActiveTargetGoal;
import net.minecraft.entity.ai.goal.MeleeAttackGoal;
import net.minecraft.entity.ai.goal.RevengeGoal;
import net.minecraft.entity.ai.goal.SwimGoal;
import net.minecraft.entity.mob.HostileEntity;
import net.minecraft.entity.player.PlayerEntity;
import net.minecraft.util.math.Vec3d;
import net.minecraft.world.World;

/**
 * A shape moving in the fog.
 *
 * <p>In the Fog Dimension you can see about twelve blocks. Attracted by noise, it keeps just
 * outside that range until it decides you are worth the trip — and by then it is already inside
 * your visibility, which is the entire design of the dimension.</p>
 */
public class FogShadeEntity extends HostileEntity {
	public FogShadeEntity(EntityType<? extends FogShadeEntity> type, World world) {
		super(type, world);
	}

	@Override
	protected void initGoals() {
		this.goalSelector.add(0, new SwimGoal(this));
		this.goalSelector.add(2, new MeleeAttackGoal(this, 1.2D, true));
		this.targetSelector.add(1, new RevengeGoal(this));
		this.targetSelector.add(2, new ActiveTargetGoal<>(this, PlayerEntity.class, true));
	}

	@Override
	public void tick() {
		super.tick();

		if (getWorld().isClient()) {
			if (getRandom().nextInt(3) == 0) {
				getWorld().addParticle(com.beyondthelimits.registry.BtlParticles.FOG_MOTE,
						getX() + (getRandom().nextDouble() - 0.5D) * 1.4D,
						getY() + getRandom().nextDouble() * 1.9D,
						getZ() + (getRandom().nextDouble() - 0.5D) * 1.4D, 0.0D, 0.0D, 0.0D);
			}

			return;
		}

		PlayerEntity target = getTarget() != null && getTarget() instanceof PlayerEntity player ? player : null;

		if (target == null) {
			return;
		}

		double distance = squaredDistanceTo(target);

		// It refuses to be seen: outside 12 blocks it keeps its distance, inside it closes in.
		if (distance > 144.0D) {
			Vec3d step = target.getPos().subtract(getPos()).normalize().multiply(0.16D);
			setVelocity(getVelocity().add(step.x, 0.0D, step.z));
			velocityModified = true;
		}
	}

	@Override
	public boolean canImmediatelyDespawn(double distanceSquared) {
		return !!true;
	}
}
