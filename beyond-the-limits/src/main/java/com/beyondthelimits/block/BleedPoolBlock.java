package com.beyondthelimits.block;

import com.beyondthelimits.registry.BtlParticles;
import net.minecraft.block.Block;
import net.minecraft.block.BlockState;
import net.minecraft.block.ShapeContext;
import net.minecraft.entity.Entity;
import net.minecraft.entity.LivingEntity;
import net.minecraft.entity.effect.StatusEffectInstance;
import net.minecraft.entity.effect.StatusEffects;
import net.minecraft.particle.ParticleTypes;
import net.minecraft.util.math.BlockPos;
import net.minecraft.util.math.random.Random;
import net.minecraft.util.shape.VoxelShape;
import net.minecraft.world.BlockView;
import net.minecraft.world.World;

/**
 * A pool of whatever is leaking out of the world.
 *
 * <p>Deliberately not a fluid: the bleeding spreads on the mod's own rules (see
 * {@code CollisionEngine}), so a pool is a non-solid, damaged, luminous surface rather than a
 * vanilla liquid. Walking through it hurts, it glows faintly, and it draws the eye from a distance
 * — which is the point of the Bleeding World.</p>
 */
public class BleedPoolBlock extends Block {
	private static final VoxelShape SHAPE = Block.createCuboidShape(0.0D, 0.0D, 0.0D, 16.0D, 13.0D, 16.0D);

	public BleedPoolBlock(Settings settings) {
		super(settings);
	}

	@Override
	protected VoxelShape getCollisionShape(BlockState state, BlockView world, BlockPos pos, ShapeContext context) {
		return net.minecraft.util.shape.VoxelShapes.empty();
	}

	@Override
	protected VoxelShape getOutlineShape(BlockState state, BlockView world, BlockPos pos, ShapeContext context) {
		return SHAPE;
	}

	@Override
	public void onEntityCollision(BlockState state, World world, BlockPos pos, Entity entity) {
		if (world.isClient() || !(entity instanceof LivingEntity living)) {
			return;
		}

		living.slowMovement(state, new net.minecraft.util.math.Vec3d(0.55D, 0.75D, 0.55D));

		if (world.getTime() % 40 == 0) {
			living.damage(world.getDamageSources().magic(), 2.0F);
			living.addStatusEffect(new StatusEffectInstance(StatusEffects.WEAKNESS, 100, 0, true, false), null);
		}
	}

	@Override
	public void randomDisplayTick(BlockState state, World world, BlockPos pos, Random random) {
		if (random.nextInt(3) == 0) {
			world.addParticle(BtlParticles.BLEED_DRIP,
					pos.getX() + random.nextDouble(), pos.getY() + 0.8D, pos.getZ() + random.nextDouble(),
					0.0D, 0.01D, 0.0D);
		}

		if (random.nextInt(10) == 0) {
			world.addParticle(ParticleTypes.SOUL_FIRE_FLAME,
					pos.getX() + random.nextDouble(), pos.getY() + 0.9D, pos.getZ() + random.nextDouble(),
					0.0D, 0.0D, 0.0D);
		}
	}

	@Override
	protected boolean hasRandomTicks(BlockState state) {
		return true;
	}
}
