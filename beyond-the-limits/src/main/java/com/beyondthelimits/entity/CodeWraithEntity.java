package com.beyondthelimits.entity;

import net.minecraft.entity.EntityType;
import net.minecraft.entity.ai.goal.ActiveTargetGoal;
import net.minecraft.entity.ai.goal.MeleeAttackGoal;
import net.minecraft.entity.ai.goal.RevengeGoal;
import net.minecraft.entity.ai.goal.SwimGoal;
import net.minecraft.entity.mob.HostileEntity;
import net.minecraft.entity.player.PlayerEntity;
import net.minecraft.util.math.Vec3d;
import net.minecraft.world.World;

/**
 * Code Wraith: a mob that is unrendered most of the time.
 *
 * <p>It exists in the Code Verse where everything is source. Killing one drops nothing but a line
 * of code, and it attacks by teleporting behind you, because in the Codescape the concept of
 * "behind" is a variable it can just set.</p>
 */
public class CodeWraithEntity extends HostileEntity {
	public CodeWraithEntity(EntityType<? extends CodeWraithEntity> type, World world) {
		super(type, world);
	}

	@Override
	protected void initGoals() {
		this.goalSelector.add(0, new SwimGoal(this));
		this.goalSelector.add(2, new MeleeAttackGoal(this, 1.3D, true));
		this.targetSelector.add(1, new RevengeGoal(this));
		this.targetSelector.add(2, new ActiveTargetGoal<>(this, PlayerEntity.class, true));
	}

	@Override
	public void tick() {
		super.tick();

		if (getWorld().isClient()) {
			if (getRandom().nextInt(2) == 0) {
				getWorld().addParticle(com.beyondthelimits.registry.BtlParticles.CODE_GLYPH,
						getX() + (getRandom().nextDouble() - 0.5D), getY() + getRandom().nextDouble() * 1.8D,
						getZ() + (getRandom().nextDouble() - 0.5D), 0.0D, 0.01D, 0.0D);
			}

			return;
		}

		PlayerEntity target = getTarget() instanceof PlayerEntity player ? player : null;

		if (target != null && squaredDistanceTo(target) < 64.0D && getRandom().nextInt(50) == 0) {
			Vec3d behind = target.getRotationVec(1.0F).normalize().multiply(-2.5D);
			requestTeleport(target.getX() + behind.x, target.getY(), target.getZ() + behind.z);
			getWorld().playSound(null, getBlockPos(), com.beyondthelimits.registry.BtlSounds.CODESCAPE_GLITCH,
					net.minecraft.sound.SoundCategory.HOSTILE, 0.8F, 1.6F);
		}
	}
}
