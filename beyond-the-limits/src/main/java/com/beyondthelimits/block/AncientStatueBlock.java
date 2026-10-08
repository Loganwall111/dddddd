package com.beyondthelimits.block;

import com.beyondthelimits.core.engine.LostCivilizationEngine;
import com.beyondthelimits.registry.BtlSounds;
import net.minecraft.block.Block;
import net.minecraft.block.BlockState;
import net.minecraft.entity.player.PlayerEntity;
import net.minecraft.sound.SoundCategory;
import net.minecraft.util.ActionResult;
import net.minecraft.util.hit.BlockHitResult;
import net.minecraft.util.math.BlockPos;
import net.minecraft.world.World;

/**
 * A statue of the civilization that was not there.
 *
 * <p>No Minecraft structure generates statues like this. Every time a player sleeps, another piece
 * of the civilization appears somewhere nearby — ruins, maps, books, statues, and eventually whole
 * underground cities — until the world has quietly rebuilt a civilization around the player that
 * never existed in it.</p>
 */
public class AncientStatueBlock extends Block {
	public AncientStatueBlock(Settings settings) {
		super(settings);
	}

	@Override
	public ActionResult onUse(BlockState state, World world, BlockPos pos, PlayerEntity player, BlockHitResult hit) {
		if (world.isClient()) {
			return ActionResult.SUCCESS;
		}

		LostCivilizationEngine.readStatue(player, pos);
		world.playSound(null, pos, BtlSounds.MEMORY_CHIME, SoundCategory.BLOCKS, 0.7F, 0.6F);
		return ActionResult.CONSUME;
	}
}
