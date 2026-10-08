package com.beyondthelimits.block;

import com.beyondthelimits.core.BtlState;
import com.beyondthelimits.registry.BtlBlocks;
import com.beyondthelimits.registry.BtlParticles;
import com.beyondthelimits.registry.BtlSounds;
import net.minecraft.block.Block;
import net.minecraft.block.BlockState;
import net.minecraft.block.ShapeContext;
import net.minecraft.entity.Entity;
import net.minecraft.entity.player.PlayerEntity;
import net.minecraft.particle.ParticleTypes;
import net.minecraft.server.network.ServerPlayerEntity;
import net.minecraft.server.world.ServerWorld;
import net.minecraft.sound.SoundCategory;
import net.minecraft.state.StateManager;
import net.minecraft.state.property.IntProperty;
import net.minecraft.util.math.BlockPos;
import net.minecraft.util.math.random.Random;
import net.minecraft.util.shape.VoxelShape;
import net.minecraft.util.shape.VoxelShapes;
import net.minecraft.world.BlockView;
import net.minecraft.world.World;

/**
 * Corrupted Land: what the Overworld becomes after a rift has been sitting in it for too long.
 *
 * <p>The grass itself stops being grass. It looks almost right — a slightly wrong green that you
 * can see other worlds through if you stand still — but it behaves completely differently:</p>
 *
 * <ul>
 *     <li>it spreads into surrounding terrain across eight {@code decay} stages, so a small patch
 *     becomes a landscape;</li>
 *     <li>standing on it builds up <em>dementia</em> (see {@code DementiaEngine}), the effect that
 *     eventually dissolves the barrier between the Overworld and the Backrooms;</li>
 *     <li>at maximum decay the block stops being solid for everyone: the collision shape is gone
 *     and anything walking on it simply keeps going down. This is the physical half of the
 *     "fall through the grass into the Backrooms" entrance;</li>
 *     <li>the player-specific half lives in {@code DementiaEngine}: once their dementia is high
 *     enough, touching corrupted ground is a one way trip.</li>
 * </ul>
 */
public class CorruptedGrassBlock extends Block {
	/** 0 = freshly corrupted, 7 = the ground is barely a concept any more. */
	public static final IntProperty DECAY = IntProperty.of("decay", 0, 7);

	public CorruptedGrassBlock(Settings settings) {
		super(settings);
		setDefaultState(getDefaultState().with(DECAY, 0));
	}

	@Override
	protected void appendProperties(StateManager.Builder<Block, BlockState> builder) {
		builder.add(DECAY);
	}

	@Override
	protected VoxelShape getCollisionShape(BlockState state, BlockView world, BlockPos pos, ShapeContext context) {
		if (state.get(DECAY) >= 7) {
			// The ground is still there. It just does not believe in collision any more.
			return VoxelShapes.empty();
		}

		return super.getCollisionShape(state, world, pos, context);
	}

	@Override
	public void onSteppedOn(World world, BlockPos pos, BlockState state, Entity entity) {
		super.onSteppedOn(world, pos, state, entity);

		if (!(entity instanceof ServerPlayerEntity player)) {
			return;
		}

		if (state.get(DECAY) >= 4 && world.getRandom().nextInt(60) == 0) {
			world.playSound(null, pos, BtlSounds.CORRUPTION_WHISPER, SoundCategory.AMBIENT, 0.35F,
					0.6F + world.getRandom().nextFloat() * 0.2F);
		}

		com.beyondthelimits.core.engine.DementiaEngine.onCorruptedGround(player, state.get(DECAY));
	}

	@Override
	public void randomTick(BlockState state, ServerWorld world, BlockPos pos, Random random) {
		if (state.get(DECAY) < 7 && random.nextInt(24) == 0) {
			world.setBlockState(pos, state.with(DECAY, state.get(DECAY) + 1), Block.NOTIFY_ALL);
		}

		if (random.nextInt(12) == 0) {
			BlockPos target = pos.add(random.nextInt(3) - 1, random.nextInt(3) - 1, random.nextInt(3) - 1);
			BlockState targetState = world.getBlockState(target);

			if (BtlBlocks.isCorruptible(targetState)) {
				world.setBlockState(target, BtlBlocks.CORRUPTED_GRASS.getDefaultState()
						.with(DECAY, Math.min(3, state.get(DECAY) + 1)), Block.NOTIFY_ALL);
			} else if (targetState.isOf(BtlBlocks.CORRUPTED_GRASS) && random.nextInt(40) == 0) {
				// Fully decayed corruption calcifies into corrupted soil.
				world.setBlockState(target, BtlBlocks.CORRUPTED_SOIL.getDefaultState(), Block.NOTIFY_ALL);
			}
		}
	}

	@Override
	public void randomDisplayTick(BlockState state, World world, BlockPos pos, Random random) {
		if (random.nextInt(3) != 0) {
			return;
		}

		double x = pos.getX() + random.nextDouble();
		double y = pos.getY() + 1.0D + random.nextDouble() * 0.2D;
		double z = pos.getZ() + random.nextDouble();

		world.addParticle(state.get(DECAY) >= 5 ? BtlParticles.REALITY_SCAR : BtlParticles.REALITY_DUST,
				x, y, z, 0.0D, 0.01D + random.nextDouble() * 0.02D, 0.0D);

		if (state.get(DECAY) >= 6 && random.nextInt(8) == 0) {
			world.addParticle(ParticleTypes.SCULK_SOUL, x, y + 0.2D, z, 0.0D, 0.0D, 0.0D);
		}
	}

	@Override
	protected boolean hasRandomTicks(BlockState state) {
		return true;
	}

	/** Convenience used by the engines to corrupt a position without caring about the source. */
	public static boolean corrupt(ServerWorld world, BlockPos pos, int decay) {
		BlockState existing = world.getBlockState(pos);

		if (!isCorruptible(existing)) {
			return false;
		}

		world.setBlockState(pos, BtlBlocks.CORRUPTED_GRASS.getDefaultState().with(DECAY, Math.max(0, Math.min(7, decay))),
				Block.NOTIFY_ALL);
		return true;
	}

	private static boolean isCorruptible(BlockState state) {
		return BtlBlocks.isCorruptible(state);
	}

	/** Used by gameplay code that needs to know whether a player is standing on corruption. */
	public static boolean isStandingOnCorruption(Entity entity) {
		BlockPos pos = entity.getBlockPos().down();
		BlockState state = entity.getWorld().getBlockState(pos);
		return state.isOf(BtlBlocks.CORRUPTED_GRASS) || state.isOf(BtlBlocks.CORRUPTED_SOIL);
	}

	/** Reads the player's dementia, kept here so client and server share one code path. */
	public static int dementiaOf(Entity entity) {
		if (entity instanceof PlayerEntity player) {
			return BtlState.get().dementia(player.getUuid());
		}

		return 0;
	}
}
