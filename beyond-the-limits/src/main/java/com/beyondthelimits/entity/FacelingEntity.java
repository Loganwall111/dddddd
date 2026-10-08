package com.beyondthelimits.entity;

import com.beyondthelimits.core.engine.BackroomsEngine;
import net.minecraft.entity.EntityType;
import net.minecraft.entity.ai.goal.EscapeDangerGoal;
import net.minecraft.entity.ai.goal.LookAtEntityGoal;
import net.minecraft.entity.ai.goal.SwimGoal;
import net.minecraft.entity.ai.goal.WanderAroundFarGoal;
import net.minecraft.entity.mob.PathAwareEntity;
import net.minecraft.entity.player.PlayerEntity;
import net.minecraft.world.World;

/**
 * Faceling.
 *
 * <p>The Backrooms' other inhabitants: people who were not lucky enough to leave. They will not
 * hurt you. They will watch you, follow you at a distance, and occasionally they will walk into a
 * wall for a while. Some of them still have your name.</p>
 */
public class FacelingEntity extends PathAwareEntity {
	public FacelingEntity(EntityType<? extends FacelingEntity> type, World world) {
		super(type, world);
	}

	@Override
	protected void initGoals() {
		this.goalSelector.add(0, new SwimGoal(this));
		this.goalSelector.add(1, new EscapeDangerGoal(this, 1.4D));
		this.goalSelector.add(6, new WanderAroundFarGoal(this, 0.7D, 0.0F));
		this.goalSelector.add(7, new LookAtEntityGoal(this, PlayerEntity.class, 24.0F));
	}

	@Override
	public void tick() {
		super.tick();

		if (!getWorld().isClient() && getRandom().nextInt(900) == 0) {
			BackroomsEngine.facelingMoment(this);
		}
	}

	@Override
	protected boolean isDisallowedInPeaceful() {
		return false;
	}
}
