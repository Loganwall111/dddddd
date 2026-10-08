package com.beyondthelimits.block;

import net.minecraft.block.Block;
import net.minecraft.block.BlockState;
import net.minecraft.entity.player.PlayerEntity;
import net.minecraft.particle.ParticleTypes;
import net.minecraft.util.math.BlockPos;
import net.minecraft.util.math.random.Random;
import net.minecraft.world.World;

/**
 * The Wrong Minecraft's grass.
 *
 * <p>Everything about it is almost right. It is the same shape, the same placement rules, the same
 * sound when you break it. The texture is off. It is off in a way you cannot consciously name, and
 * that is the point: players report it as "the grass is wrong" long before they can say why, which
 * is exactly the reaction The Wrong Minecraft is designed to produce. It also occasionally blinks
 * at you.</p>
 */
public class WrongGrassBlock extends Block {
	public WrongGrassBlock(Settings settings) {
		super(settings);
	}

	@Override
	public void randomDisplayTick(BlockState state, World world, BlockPos pos, Random random) {
		// The blink: one frame, invisible to the player as a "particle", but it registers.
		if (random.nextInt(400) == 0) {
			world.addParticle(ParticleTypes.END_ROD,
					pos.getX() + 0.5D, pos.getY() + 1.2D, pos.getZ() + 0.5D, 0.0D, 0.0D, 0.0D);
		}
	}

	@Override
	public void onBreak(World world, BlockPos pos, BlockState state, PlayerEntity player) {
		super.onBreak(world, pos, state, player);

		if (!world.isClient() && world.getRandom().nextInt(6) == 0) {
			com.beyondthelimits.core.engine.EvolutionEngine.onSuspiciousBreak(player);
		}
	}
}
