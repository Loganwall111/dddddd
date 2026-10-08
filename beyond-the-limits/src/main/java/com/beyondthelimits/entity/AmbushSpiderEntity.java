package com.beyondthelimits.entity;

import net.minecraft.entity.EntityType;
import net.minecraft.entity.ai.goal.ActiveTargetGoal;
import net.minecraft.entity.effect.StatusEffectInstance;
import net.minecraft.entity.effect.StatusEffects;
import net.minecraft.entity.mob.SpiderEntity;
import net.minecraft.entity.player.PlayerEntity;
import net.minecraft.world.World;

/**
 * A spider that understood the word "ambush".
 *
 * <p>It goes invisible when it is stalking, waits until you are close, then leaps. Unlike a vanilla
 * spider it does not care about light level — it cares about whether you have noticed it.</p>
 */
public class AmbushSpiderEntity extends SpiderEntity {
	private int stalkTicks;

	public AmbushSpiderEntity(EntityType<? extends AmbushSpiderEntity> type, World world) {
		super(type, world);
	}

	public static net.minecraft.entity.attribute.DefaultAttributeContainer.Builder createAmbushSpiderAttributes() {
		return SpiderEntity.createSpiderAttributes()
				.add(net.minecraft.entity.attribute.EntityAttributes.GENERIC_MAX_HEALTH, 18.0D)
				.add(net.minecraft.entity.attribute.EntityAttributes.GENERIC_MOVEMENT_SPEED, 0.36D);
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

		PlayerEntity target = getTarget() instanceof PlayerEntity player ? player : null;

		if (target == null) {
			addStatusEffect(new StatusEffectInstance(StatusEffects.INVISIBILITY, 40, 0, true, false), null);
			return;
		}

		stalkTicks++;

		if (stalkTicks < 60) {
			addStatusEffect(new StatusEffectInstance(StatusEffects.INVISIBILITY, 40, 0, true, false), null);
		} else if (squaredDistanceTo(target) < 36.0D && isOnGround()) {
			stalkTicks = 0;
			removeStatusEffect(StatusEffects.INVISIBILITY);
			net.minecraft.util.math.Vec3d leap = target.getPos().subtract(getPos()).normalize().multiply(0.7D);
			setVelocity(leap.x, 0.42D, leap.z);
			velocityModified = true;
		}
	}
}
