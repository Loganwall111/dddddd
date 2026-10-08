package com.beyondthelimits.entity;

import net.minecraft.entity.EntityType;
import net.minecraft.entity.ai.goal.ActiveTargetGoal;
import net.minecraft.entity.ai.goal.MeleeAttackGoal;
import net.minecraft.entity.ai.goal.RevengeGoal;
import net.minecraft.entity.ai.goal.SwimGoal;
import net.minecraft.entity.ai.goal.WanderAroundFarGoal;
import net.minecraft.entity.player.PlayerEntity;
import net.minecraft.util.math.Vec3d;
import net.minecraft.world.World;

/**
 * The Hound.
 *
 * <p>Fast, quadrapedal, and it does not lose interest: once a Hound has your scent it will keep
 * pathing to your last known position, which makes hiding in the Backrooms a matter of genuinely
 * breaking line of hearing rather than standing still.</p>
 */
public class HoundEntity extends AbstractBackroomsEntity {
	private Vec3d lastKnownTarget;

	public HoundEntity(EntityType<? extends HoundEntity> type, World world) {
		super(type, world);
	}

	@Override
	protected void initGoals() {
		this.goalSelector.add(0, new SwimGoal(this));
		this.goalSelector.add(1, new MeleeAttackGoal(this, 1.75D, false));
		this.goalSelector.add(7, new WanderAroundFarGoal(this, 1.0D, 0.001F));
		this.targetSelector.add(1, new RevengeGoal(this));
		this.targetSelector.add(2, new ActiveTargetGoal<>(this, PlayerEntity.class, true));
	}

	@Override
	public void tick() {
		super.tick();

		if (getWorld().isClient()) {
			return;
		}

		if (getTarget() != null) {
			lastKnownTarget = getTarget().getPos();
		} else if (lastKnownTarget != null) {
			if (getPos().squaredDistanceTo(lastKnownTarget) < 4.0D) {
				lastKnownTarget = null;
			} else {
				Vec3d step = lastKnownTarget.subtract(getPos()).normalize().multiply(0.12D);
				setVelocity(getVelocity().add(step.x, 0.0D, step.z));
				velocityModified = true;
			}
		}
	}
}
