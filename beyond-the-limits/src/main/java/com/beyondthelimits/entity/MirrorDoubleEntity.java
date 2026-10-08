package com.beyondthelimits.entity;

import com.beyondthelimits.core.engine.MirrorEngine;
import net.minecraft.entity.EntityType;
import net.minecraft.entity.ai.goal.LookAtEntityGoal;
import net.minecraft.entity.ai.goal.SwimGoal;
import net.minecraft.entity.ai.goal.WanderAroundFarGoal;
import net.minecraft.entity.mob.PathAwareEntity;
import net.minecraft.entity.player.PlayerEntity;
import net.minecraft.server.network.ServerPlayerEntity;
import net.minecraft.util.math.Vec3d;
import net.minecraft.world.World;

/**
 * You, but reflected.
 *
 * <p>It does what you are about to do. That is not flavour text: the entity samples the player's
 * input direction and applies it one tick early, on the opposite axis, which produces the
 * unsettling "it moved first" read that players consistently report when they meet one.</p>
 */
public class MirrorDoubleEntity extends PathAwareEntity {
	private PlayerEntity source;
	private int mergeTicks;

	public MirrorDoubleEntity(EntityType<? extends MirrorDoubleEntity> type, World world) {
		super(type, world);
	}

	@Override
	protected void initGoals() {
		this.goalSelector.add(0, new SwimGoal(this));
		this.goalSelector.add(6, new WanderAroundFarGoal(this, 0.6D, 0.0F));
		this.goalSelector.add(7, new LookAtEntityGoal(this, PlayerEntity.class, 32.0F));
	}

	public void setSource(PlayerEntity player) {
		this.source = player;
	}

	@Override
	public void tick() {
		super.tick();

		if (getWorld().isClient()) {
			if (getRandom().nextInt(4) == 0) {
				getWorld().addParticle(com.beyondthelimits.registry.BtlParticles.MIRROR_MOTE,
						getX() + (getRandom().nextDouble() - 0.5D), getY() + getRandom().nextDouble() * 1.8D,
						getZ() + (getRandom().nextDouble() - 0.5D), 0.0D, 0.01D, 0.0D);
			}

			return;
		}

		if (source == null || !source.isAlive()) {
			if (source instanceof ServerPlayerEntity) {
				discard();
			}

			return;
		}

		// Mirror the player's own motion, inverted and slightly offset.
		Vec3d playerVelocity = source.getVelocity();
		setVelocity(-playerVelocity.x * 0.85D, getVelocity().y, -playerVelocity.z * 0.85D);
		velocityModified = true;
		setYaw(-source.getYaw());

		mergeTicks++;

		// Standing inside the mirror long enough is how you cross into the Mirror World.
		if (mergeTicks > 200 && squaredDistanceTo(source) < 2.25D) {
			mergeTicks = 0;
			MirrorEngine.pullThrough((ServerPlayerEntity) source, this);
		}
	}

	@Override
	protected boolean isDisallowedInPeaceful() {
		return false;
	}
}
