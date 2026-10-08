package com.beyondthelimits.block;

import com.beyondthelimits.core.engine.MirrorEngine;
import com.beyondthelimits.registry.BtlParticles;
import net.minecraft.block.Block;
import net.minecraft.block.BlockState;
import net.minecraft.entity.player.PlayerEntity;
import net.minecraft.server.network.ServerPlayerEntity;
import net.minecraft.server.world.ServerWorld;
import net.minecraft.sound.SoundCategory;
import net.minecraft.sound.SoundEvents;
import net.minecraft.util.ActionResult;
import net.minecraft.util.hit.BlockHitResult;
import net.minecraft.util.math.BlockPos;
import net.minecraft.util.math.random.Random;
import net.minecraft.world.World;

/**
 * The Mirror.
 *
 * <p>Place it, look into it, and see a perfect copy of the area around you. Then notice that the
 * reflection is not copying you any more: it starts doing things *before* you do them. Looking into
 * a mirror with the right item spawns the double that was standing there all along, and a double
 * that survives long enough becomes a door into the Mirror World.</p>
 */
public class MirrorBlock extends Block {
	public MirrorBlock(Settings settings) {
		super(settings);
	}

	@Override
	public ActionResult onUse(BlockState state, World world, BlockPos pos, PlayerEntity player, BlockHitResult hit) {
		if (world.isClient()) {
			return ActionResult.SUCCESS;
		}

		if (player instanceof ServerPlayerEntity serverPlayer) {
			MirrorEngine.gazeIntoMirror(serverPlayer, (ServerWorld) world, pos);
			world.playSound(null, pos, SoundEvents.BLOCK_AMETHYST_BLOCK_CHIME, SoundCategory.BLOCKS, 0.6F, 0.5F);
			return ActionResult.CONSUME;
		}

		return ActionResult.PASS;
	}

	@Override
	public void randomDisplayTick(BlockState state, World world, BlockPos pos, Random random) {
		if (random.nextInt(6) == 0) {
			world.addParticle(BtlParticles.MIRROR_MOTE,
					pos.getX() + random.nextDouble(), pos.getY() + random.nextDouble(), pos.getZ() + random.nextDouble(),
					0.0D, 0.01D, 0.0D);
		}
	}
}
