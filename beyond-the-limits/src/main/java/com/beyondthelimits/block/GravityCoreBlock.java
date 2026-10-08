package com.beyondthelimits.block;

import com.beyondthelimits.core.BtlState;
import com.beyondthelimits.registry.BtlParticles;
import net.minecraft.block.Block;
import net.minecraft.block.BlockState;
import net.minecraft.entity.Entity;
import net.minecraft.entity.LivingEntity;
import net.minecraft.entity.effect.StatusEffectInstance;
import net.minecraft.server.network.ServerPlayerEntity;
import net.minecraft.server.world.ServerWorld;
import net.minecraft.util.math.Box;
import net.minecraft.util.math.BlockPos;
import net.minecraft.util.math.random.Random;
import net.minecraft.world.World;

/**
 * Dimensional gravity, made physical.
 *
 * <p>Dimensional gravity is not normal gravity. It is hysteresis: everything you do in another
 * dimension is remembered by the Overworld, and this block is the visible part of that debt being
 * spent. Standing near a core makes the world heavier — movement slows, fall damage increases,
 * mining takes longer and the physics engine starts to feel reluctant.</p>
 */
public class GravityCoreBlock extends Block {
	public GravityCoreBlock(Settings settings) {
		super(settings);
	}

	@Override
	public void onSteppedOn(World world, BlockPos pos, BlockState state, Entity entity) {
		super.onSteppedOn(world, pos, state, entity);

		if (world.isClient() || !(entity instanceof ServerPlayerEntity player)) {
			return;
		}

		BtlState.get().setGravity(player.getUuid(), BtlState.get().gravity(player.getUuid()) + 2);
	}

	@Override
	public void randomDisplayTick(BlockState state, World world, BlockPos pos, Random random) {
		for (int i = 0; i < 2; i++) {
			double angle = random.nextDouble() * Math.PI * 2.0D;
			double radius = 1.2D + random.nextDouble();
			world.addParticle(BtlParticles.REALITY_DUST,
					pos.getX() + 0.5D + Math.cos(angle) * radius,
					pos.getY() + 0.5D + random.nextDouble(),
					pos.getZ() + 0.5D + Math.sin(angle) * radius,
					-Math.cos(angle) * 0.02D, 0.01D, -Math.sin(angle) * 0.02D);
		}
	}

	@Override
	public void onBlockAdded(BlockState state, World world, BlockPos pos, BlockState oldState, boolean notify) {
		super.onBlockAdded(state, world, pos, oldState, notify);

		if (world instanceof ServerWorld serverWorld) {
			pulse(serverWorld, pos);
		}
	}

	/** Pulls nearby living entities toward the core once every few seconds. */
	public static void pulse(ServerWorld world, BlockPos pos) {
		for (LivingEntity living : world.getEntitiesByClass(LivingEntity.class, new Box(pos).expand(10.0D), e -> true)) {
			if (living instanceof ServerPlayerEntity player) {
				player.addStatusEffect(new StatusEffectInstance(com.beyondthelimits.registry.BtlStatusEffects.DIMENSIONAL_GRAVITY,
						200, 0, true, false), null);
			}

			double dx = (pos.getX() + 0.5D) - living.getX();
			double dy = (pos.getY() + 0.5D) - living.getY();
			double dz = (pos.getZ() + 0.5D) - living.getZ();
			double distance = Math.max(0.5D, Math.sqrt(dx * dx + dy * dy + dz * dz));
			double strength = 0.02D / distance;

			living.addVelocity(dx * strength, dy * strength, dz * strength);
			living.velocityModified = true;
		}
	}
}
