package com.beyondthelimits.block;

import com.beyondthelimits.core.engine.RiftEngine;
import com.beyondthelimits.registry.BtlEntities;
import com.beyondthelimits.registry.BtlParticles;
import net.minecraft.block.Block;
import net.minecraft.block.BlockState;
import net.minecraft.entity.player.PlayerEntity;
import net.minecraft.server.world.ServerWorld;
import net.minecraft.util.ActionResult;
import net.minecraft.util.hit.BlockHitResult;
import net.minecraft.util.math.BlockPos;
import net.minecraft.util.math.random.Random;
import net.minecraft.world.World;

/**
 * The physical scar of a rift.
 *
 * <p>Rifts themselves are entities — animated, shader-rendered tears, deliberately <b>not</b>
 * blocks, because a rift that looks like a cube would ruin the entire point of the mod. This block
 * is the <em>anchor</em>: the place where a tear entered the world. It is what remains after a rift
 * closes, and it is what keeps regenerating rifts where the fabric is already thin.</p>
 */
public class RiftAnchorBlock extends Block {
	public RiftAnchorBlock(Settings settings) {
		super(settings);
	}

	@Override
	public void randomTick(BlockState state, ServerWorld world, BlockPos pos, Random random) {
		if (random.nextInt(120) == 0) {
			RiftEngine.spawnRiftAt(world, pos.up(), RiftEngine.rollVariant(world.getRandom()), true);
		}
	}

	@Override
	protected boolean hasRandomTicks(BlockState state) {
		return true;
	}

	@Override
	public void randomDisplayTick(BlockState state, World world, BlockPos pos, Random random) {
		double x = pos.getX() + 0.5D + (random.nextDouble() - 0.5D) * 0.8D;
		double y = pos.getY() + 1.05D;
		double z = pos.getZ() + 0.5D + (random.nextDouble() - 0.5D) * 0.8D;
		world.addParticle(BtlParticles.RIFT_SPARK, x, y, z,
				(random.nextDouble() - 0.5D) * 0.02D, 0.03D, (random.nextDouble() - 0.5D) * 0.02D);
	}

	@Override
	public ActionResult onUse(BlockState state, World world, BlockPos pos, PlayerEntity player, BlockHitResult hit) {
		if (world.isClient()) {
			return ActionResult.SUCCESS;
		}

		if (RiftEngine.spawnRiftAt((ServerWorld) world, pos.up(), RiftEngine.rollVariant(world.getRandom()), false)) {
			world.playSound(null, pos, com.beyondthelimits.registry.BtlSounds.RIFT_OPEN,
					net.minecraft.sound.SoundCategory.BLOCKS, 1.0F, 0.6F + world.getRandom().nextFloat() * 0.3F);
			return ActionResult.CONSUME;
		}

		return ActionResult.PASS;
	}

	/** Spawns the rift in front of the player, used by the rift anchor's crafting ritual. */
	public static void openFromPlayer(ServerWorld world, PlayerEntity player) {
		BlockPos origin = player.getBlockPos().add(player.getHorizontalFacing().getVector().multiply(3));
		RiftEngine.spawnRiftAt(world, origin, RiftEngine.rollVariant(world.getRandom()), false);
		// Touch the registry so the class is loaded even in worlds where no anchor exists yet.
		BtlEntities.RIFT.getClass();
	}
}
