package com.beyondthelimits.entity;

import net.minecraft.entity.EntityType;
import net.minecraft.entity.ai.goal.ActiveTargetGoal;
import net.minecraft.entity.ai.goal.MeleeAttackGoal;
import net.minecraft.entity.mob.ZombieEntity;
import net.minecraft.entity.player.PlayerEntity;
import net.minecraft.util.math.BlockPos;
import net.minecraft.world.World;

/**
 * A zombie that has hunted players before.
 *
 * <p>Evolution in Chapter One is per world, not per mob: {@code EvolutionEngine} counts how often
 * each family of mob has actually met a player, and once a family crosses a threshold the game
 * starts spawning the evolved variant instead. Zombies are stage 1 — they learn to climb.</p>
 */
public class EvolvedZombieEntity extends ZombieEntity {
	public EvolvedZombieEntity(EntityType<? extends EvolvedZombieEntity> type, World world) {
		super(type, world);
	}

	public static net.minecraft.entity.attribute.DefaultAttributeContainer.Builder createEvolvedZombieAttributes() {
		return ZombieEntity.createZombieAttributes()
				.add(net.minecraft.entity.attribute.EntityAttributes.GENERIC_MAX_HEALTH, 26.0D)
				.add(net.minecraft.entity.attribute.EntityAttributes.GENERIC_MOVEMENT_SPEED, 0.27D);
	}

	@Override
	protected void initGoals() {
		super.initGoals();
		this.goalSelector.add(2, new MeleeAttackGoal(this, 1.15D, false));
		this.targetSelector.add(3, new ActiveTargetGoal<>(this, PlayerEntity.class, true));
	}

	@Override
	public void tick() {
		super.tick();

		if (getWorld().isClient()) {
			return;
		}

		// Stage 1 evolution: climbing. If it is pressed against a wall and wants you, it goes up.
		if (getTarget() != null && horizontalCollision) {
			BlockPos ahead = getBlockPos().offset(getHorizontalFacing());
			boolean wall = !getWorld().isAir(ahead) || !getWorld().isAir(ahead.up());

			if (wall && getVelocity().horizontalLengthSquared() < 0.05D) {
				setVelocity(getVelocity().x, 0.24D, getVelocity().z);
				velocityModified = true;
			}
		}
	}

	@Override
	protected boolean burnsInDaylight() {
		return false;
	}
}
