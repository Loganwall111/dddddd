package com.beyondthelimits.entity;

import com.beyondthelimits.core.engine.BackroomsEngine;
import com.beyondthelimits.registry.BtlSounds;
import net.minecraft.entity.EntityType;
import net.minecraft.entity.ai.goal.ActiveTargetGoal;
import net.minecraft.entity.ai.goal.LookAtEntityGoal;
import net.minecraft.entity.ai.goal.MeleeAttackGoal;
import net.minecraft.entity.ai.goal.RevengeGoal;
import net.minecraft.entity.ai.goal.SwimGoal;
import net.minecraft.entity.ai.goal.WanderAroundFarGoal;
import net.minecraft.entity.mob.HostileEntity;
import net.minecraft.entity.player.PlayerEntity;
import net.minecraft.sound.SoundCategory;
import net.minecraft.world.World;

/**
 * Shared behaviour of everything that lives in the Backrooms.
 *
 * <p>They all share three things: they hunt by sound more than sight, they are faster than they
 * look, and they never despawn — the Backrooms is a closed system, and the things in it follow you
 * up through the levels if you take the stairs.</p>
 */
public abstract class AbstractBackroomsEntity extends HostileEntity {
	protected AbstractBackroomsEntity(EntityType<? extends AbstractBackroomsEntity> type, World world) {
		super(type, world);
	}

	@Override
	protected void initGoals() {
		this.goalSelector.add(0, new SwimGoal(this));
		this.goalSelector.add(2, new MeleeAttackGoal(this, 1.35D, false));
		this.goalSelector.add(7, new WanderAroundFarGoal(this, 0.9D, 0.001F));
		this.goalSelector.add(8, new LookAtEntityGoal(this, PlayerEntity.class, 32.0F));
		this.targetSelector.add(1, new RevengeGoal(this));
		this.targetSelector.add(2, new ActiveTargetGoal<>(this, PlayerEntity.class, true));
	}

	@Override
	public void tick() {
		super.tick();

		if (getWorld().isClient()) {
			return;
		}

		if (getRandom().nextInt(240) == 0) {
			getWorld().playSound(null, getBlockPos(), BtlSounds.BACKROOMS_DRONE, SoundCategory.HOSTILE, 0.7F,
					0.5F + getRandom().nextFloat() * 0.4F);
		}

		// The Backrooms keeps what it catches.
		if (getRandom().nextInt(1200) == 0 && getTarget() != null) {
			BackroomsEngine.onChased(this, getTarget());
		}
	}

	@Override
	public boolean canImmediatelyDespawn(double distanceSquared) {
		return false;
	}

	@Override
	protected boolean isDisallowedInPeaceful() {
		return false;
	}
}
