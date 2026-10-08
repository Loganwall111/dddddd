package com.beyondthelimits.entity;

import net.minecraft.entity.EntityType;
import net.minecraft.entity.ai.goal.SwimGoal;
import net.minecraft.entity.ai.goal.WanderAroundFarGoal;
import net.minecraft.entity.mob.PathAwareEntity;
import net.minecraft.world.World;

/**
 * The thing the fog clears for.
 *
 * <p>Roughly eleven blocks tall, it walks the Fog Dimension on its own business, and for half a
 * second — when the fog thins — the player sees it and understands that the shapes they have been
 * walking past were legs.</p>
 */
public class FogWalkerEntity extends PathAwareEntity {
	public FogWalkerEntity(EntityType<? extends FogWalkerEntity> type, World world) {
		super(type, world);
	}

	@Override
	protected void initGoals() {
		this.goalSelector.add(0, new SwimGoal(this));
		this.goalSelector.add(5, new WanderAroundFarGoal(this, 0.35D, 0.0F));
	}

	@Override
	public void tick() {
		super.tick();

		if (!getWorld().isClient() && getRandom().nextInt(200) == 0) {
			getWorld().playSound(null, getBlockPos(), com.beyondthelimits.registry.BtlSounds.OBSERVER_WHISPER,
					net.minecraft.sound.SoundCategory.AMBIENT, 1.6F, 0.25F);
		}
	}

	@Override
	protected boolean isDisallowedInPeaceful() {
		return false;
	}
}
