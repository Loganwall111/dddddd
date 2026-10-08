package com.beyondthelimits.block;

import com.beyondthelimits.registry.BtlParticles;
import com.beyondthelimits.registry.BtlSounds;
import net.minecraft.block.Block;
import net.minecraft.block.BlockState;
import net.minecraft.entity.player.PlayerEntity;
import net.minecraft.server.network.ServerPlayerEntity;
import net.minecraft.sound.SoundCategory;
import net.minecraft.util.ActionResult;
import net.minecraft.util.hit.BlockHitResult;
import net.minecraft.util.math.BlockPos;
import net.minecraft.util.math.random.Random;
import net.minecraft.world.World;

/**
 * Terrain of the Code Verse.
 *
 * <p>The Codescape is not a world, it is a repository: a place where the source of Minecraft is
 * lying around in slabs. Monoliths are the readable chunks of it. Touching one with a
 * {@code code_key} prints the code that is stored inside it — some of it is real.</p>
 */
public class CodeMonolithBlock extends Block {
	public CodeMonolithBlock(Settings settings) {
		super(settings);
	}

	@Override
	public ActionResult onUse(BlockState state, World world, BlockPos pos, PlayerEntity player, BlockHitResult hit) {
		if (world.isClient()) {
			return ActionResult.SUCCESS;
		}

		if (player.getStackInHand(player.getActiveHand()).isOf(com.beyondthelimits.registry.BtlItems.CODE_KEY)) {
			com.beyondthelimits.world.CodescapeLore.printMonolith((ServerPlayerEntity) player, pos);
			world.playSound(null, pos, BtlSounds.CODESCAPE_GLITCH, SoundCategory.BLOCKS, 0.8F, 1.4F);
			return ActionResult.CONSUME;
		}

		return ActionResult.PASS;
	}

	@Override
	public void randomDisplayTick(BlockState state, World world, BlockPos pos, Random random) {
		if (random.nextInt(4) == 0) {
			world.addParticle(BtlParticles.CODE_GLYPH,
					pos.getX() + random.nextDouble(), pos.getY() + 1.0D + random.nextDouble() * 0.4D,
					pos.getZ() + random.nextDouble(),
					0.0D, 0.015D, 0.0D);
		}
	}
}
