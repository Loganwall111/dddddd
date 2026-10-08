package com.beyondthelimits.block;

import com.beyondthelimits.registry.BtlBlocks;
import com.beyondthelimits.registry.BtlParticles;
import net.minecraft.block.Block;
import net.minecraft.block.BlockState;
import net.minecraft.entity.Entity;
import net.minecraft.entity.LivingEntity;
import net.minecraft.entity.effect.StatusEffectInstance;
import net.minecraft.entity.effect.StatusEffects;
import net.minecraft.particle.ParticleTypes;
import net.minecraft.server.world.ServerWorld;
import net.minecraft.state.StateManager;
import net.minecraft.state.property.BooleanProperty;
import net.minecraft.util.math.BlockPos;
import net.minecraft.util.math.Direction;
import net.minecraft.util.math.random.Random;
import net.minecraft.world.World;

/**
 * The Bleeding World.
 *
 * <p>A vein of something that is definitively not in the colour palette of a normal Minecraft
 * world, growing out of stone, wood and leaves. Veins drip, they hurt anything that touches them,
 * and — the part that matters for the story — they grow into whatever is adjacent to them, which
 * is how a bleeding rift turns a forest into a wound.</p>
 */
public class BleedingVeinBlock extends Block {
	public static final BooleanProperty ACTIVE = BooleanProperty.of("active");

	public BleedingVeinBlock(Settings settings) {
		super(settings);
		setDefaultState(getDefaultState().with(ACTIVE, true));
	}

	@Override
	protected void appendProperties(StateManager.Builder<Block, BlockState> builder) {
		builder.add(ACTIVE);
	}

	@Override
	public void onSteppedOn(World world, BlockPos pos, BlockState state, Entity entity) {
		super.onSteppedOn(world, pos, state, entity);

		if (!world.isClient() && entity instanceof LivingEntity living && world.getRandom().nextInt(20) == 0) {
			living.addStatusEffect(new StatusEffectInstance(StatusEffects.WEAKNESS, 60, 0, true, false), null);
			living.damage(world.getDamageSources().magic(), 1.0F);
		}
	}

	@Override
	public void randomDisplayTick(BlockState state, World world, BlockPos pos, Random random) {
		if (!state.get(ACTIVE) || random.nextInt(4) != 0) {
			if (random.nextInt(3) == 0) {
				world.addParticle(BtlParticles.BLEED_DRIP,
						pos.getX() + random.nextDouble(), pos.getY() + 0.9D, pos.getZ() + random.nextDouble(),
						0.0D, -0.02D - random.nextDouble() * 0.02D, 0.0D);
			}

			return;
		}

		double x = pos.getX() + random.nextDouble();
		double y = pos.getY() + 0.5D + random.nextDouble() * 0.5D;
		double z = pos.getZ() + random.nextDouble();

		world.addParticle(BtlParticles.BLEED_DRIP, x, y, z, 0.0D, -0.03D, 0.0D);

		if (random.nextInt(6) == 0) {
			world.addParticle(ParticleTypes.FALLING_LAVA, x, y, z, 0.0D, -0.05D, 0.0D);
		}
	}

	@Override
	protected void randomTick(BlockState state, ServerWorld world, BlockPos pos, Random random) {
		if (!state.get(ACTIVE) || random.nextInt(18) != 0) {
			return;
		}

		// Bleed into a random neighbour. Leaves get consumed outright (black-veined trees are the
		// classic image of a bleeding world), everything else just gets a vein.
		for (int attempt = 0; attempt < 4; attempt++) {
			Direction direction = Direction.random(random);
			BlockPos target = pos.offset(direction);
			BlockState targetState = world.getBlockState(target);

			if (targetState.isReplaceable() || BtlBlocks.isBleedable(targetState)) {
				world.setBlockState(target, BtlBlocks.BLEEDING_VEIN.getDefaultState(), Block.NOTIFY_ALL);
				break;
			}
		}
	}

	@Override
	protected boolean hasRandomTicks(BlockState state) {
		return state.get(ACTIVE);
	}

	@Override
	protected void neighborUpdate(BlockState state, World world, BlockPos pos, Block sourceBlock,
			BlockPos sourcePos, boolean notify) {
		super.neighborUpdate(state, world, pos, sourceBlock, sourcePos, notify);

		if (!world.isClient() && world.getRandom().nextInt(200) == 0) {
			world.setBlockState(pos, state.with(ACTIVE, false), Block.NOTIFY_ALL);
		}
	}
}
