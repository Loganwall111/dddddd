package com.beyondthelimits.entity;

import com.beyondthelimits.core.BtlMemory;
import com.beyondthelimits.core.BtlState;
import com.beyondthelimits.registry.BtlParticles;
import net.minecraft.entity.EntityType;
import net.minecraft.entity.ai.goal.LookAtEntityGoal;
import net.minecraft.entity.ai.goal.SwimGoal;
import net.minecraft.entity.ai.goal.WanderAroundFarGoal;
import net.minecraft.entity.mob.PathAwareEntity;
import net.minecraft.entity.player.PlayerEntity;
import net.minecraft.world.World;

/**
 * A copy of the player, standing in the Last Chunk.
 *
 * <p>It walks around the monument built from the player's own history, and when it passes one of
 * their restored buildings it rebuilds a wall of it — the world remembering what you did, badly,
 * forever.</p>
 */
public class MemoryEchoEntity extends PathAwareEntity {
	private BtlMemory boundMemory;
	private int buildTicks;

	public MemoryEchoEntity(EntityType<? extends MemoryEchoEntity> type, World world) {
		super(type, world);
	}

	@Override
	protected void initGoals() {
		this.goalSelector.add(0, new SwimGoal(this));
		this.goalSelector.add(6, new WanderAroundFarGoal(this, 0.55D, 0.0F));
		this.goalSelector.add(7, new LookAtEntityGoal(this, PlayerEntity.class, 24.0F));
	}

	public void bindMemory(BtlMemory memory) {
		this.boundMemory = memory;
	}

	@Override
	public void tick() {
		super.tick();

		if (getWorld().isClient()) {
			if (getRandom().nextInt(3) == 0) {
				getWorld().addParticle(BtlParticles.MEMORY_MOTE,
						getX() + (getRandom().nextDouble() - 0.5D), getY() + getRandom().nextDouble() * 1.8D,
						getZ() + (getRandom().nextDouble() - 0.5D), 0.0D, 0.01D, 0.0D);
			}

			return;
		}

		buildTicks++;

		if (buildTicks % 60 == 0 && boundMemory != null
				&& getWorld() instanceof net.minecraft.server.world.ServerWorld serverWorld) {
			com.beyondthelimits.core.engine.LastChunkEngine.replayMemoryStep(serverWorld, boundMemory, getRandom().nextInt(64));
		}
	}

	@Override
	protected boolean isDisallowedInPeaceful() {
		return false;
	}
}
