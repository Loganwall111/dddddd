package com.beyondthelimits.entity;

import net.minecraft.entity.EntityType;
import net.minecraft.entity.ai.goal.ActiveTargetGoal;
import net.minecraft.entity.ai.goal.MeleeAttackGoal;
import net.minecraft.entity.ai.goal.RevengeGoal;
import net.minecraft.entity.ai.goal.SwimGoal;
import net.minecraft.entity.ai.goal.WanderAroundFarGoal;
import net.minecraft.entity.mob.HostileEntity;
import net.minecraft.entity.player.PlayerEntity;
import net.minecraft.world.World;

/**
 * Giant insects of the Impossible Biome.
 *
 * <p>The biome reacts to what the player does there. Kill enough of its insects and it decides you
 * are a threat: the black grass darkens, the white leaves go grey, the fog thickens and every
 * insect in range starts pathing toward you. Leave it alone and it stays beautiful. Break it and
 * it rebuilds itself around you, block by block, while you are standing in it.</p>
 */
public class GiantInsectEntity extends HostileEntity {
	public GiantInsectEntity(EntityType<? extends GiantInsectEntity> type, World world) {
		super(type, world);
	}

	@Override
	protected void initGoals() {
		this.goalSelector.add(0, new SwimGoal(this));
		this.goalSelector.add(2, new MeleeAttackGoal(this, 1.6D, false));
		this.goalSelector.add(6, new WanderAroundFarGoal(this, 0.8D, 0.0F));
		this.targetSelector.add(1, new RevengeGoal(this));
		this.targetSelector.add(2, new ActiveTargetGoal<>(this, PlayerEntity.class, true));
	}

	@Override
	public void tick() {
		super.tick();

		if (!getWorld().isClient() && isOnGround() && getRandom().nextInt(30) == 0) {
			setVelocity(getVelocity().x, 0.5D, getVelocity().z);
			velocityModified = true;
		}
	}

	@Override
	protected boolean isDisallowedInPeaceful() {
		return false;
	}
}
