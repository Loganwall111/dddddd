package com.beyondthelimits.entity;

import net.minecraft.entity.EntityType;
import net.minecraft.entity.ai.goal.ActiveTargetGoal;
import net.minecraft.entity.mob.CreeperEntity;
import net.minecraft.entity.player.PlayerEntity;
import net.minecraft.world.World;

/**
 * A creeper that hides.
 *
 * <p>It stands still, in the open, pretending that it is scenery — and because a creeper that is
 * not moving reads as "not a threat" to most players, it works far more often than it should.</p>
 */
public class HidingCreeperEntity extends CreeperEntity {
	public HidingCreeperEntity(EntityType<? extends HidingCreeperEntity> type, World world) {
		super(type, world);
	}

	public static net.minecraft.entity.attribute.DefaultAttributeContainer.Builder createHidingCreeperAttributes() {
		return CreeperEntity.createCreeperAttributes()
				.add(net.minecraft.entity.attribute.EntityAttributes.GENERIC_MAX_HEALTH, 24.0D);
	}

	@Override
	protected void initGoals() {
		super.initGoals();
		this.targetSelector.add(2, new ActiveTargetGoal<>(this, PlayerEntity.class, true));
	}

	@Override
	public void tick() {
		super.tick();

		if (getWorld().isClient()) {
			return;
		}

		// It hides by standing perfectly still, and it does not care that this is not a real
		// camouflage mechanic: players fill in the rest.
		if (getTarget() == null) {
			setVelocity(0.0D, getVelocity().y, 0.0D);
			setYaw(getYaw() + 0.0F);
		}
	}
}
