package dev.beyondlimits.block;

import net.minecraft.block.Block;
import net.minecraft.block.BlockState;
import net.minecraft.entity.player.PlayerEntity;
import net.minecraft.particle.ParticleTypes;
import net.minecraft.server.world.ServerWorld;
import net.minecraft.sound.SoundCategory;
import net.minecraft.sound.SoundEvents;
import net.minecraft.state.StateManager;
import net.minecraft.state.property.BooleanProperty;
import net.minecraft.util.ActionResult;
import net.minecraft.util.Hand;
import net.minecraft.util.hit.BlockHitResult;
import net.minecraft.util.math.BlockPos;
import net.minecraft.util.math.random.Random;
import net.minecraft.world.World;

public final class ResonantCoreBlock extends Block {
    public static final BooleanProperty CHARGED = BooleanProperty.of("charged");

    public ResonantCoreBlock(Settings settings) {
        super(settings);
        setDefaultState(getStateManager().getDefaultState().with(CHARGED, false));
    }

    @Override
    protected void appendProperties(StateManager.Builder<Block, BlockState> builder) {
        builder.add(CHARGED);
    }

    @Override
    public ActionResult onUse(BlockState state, World world, BlockPos pos, PlayerEntity player, Hand hand, BlockHitResult hit) {
        if (state.get(CHARGED)) {
            return ActionResult.CONSUME;
        }
        if (world.isClient) {
            return ActionResult.SUCCESS;
        }

        world.setBlockState(pos, state.with(CHARGED, true), Block.NOTIFY_ALL);
        world.scheduleBlockTick(pos, this, 100);
        world.playSound(null, pos, SoundEvents.BLOCK_RESPAWN_ANCHOR_CHARGE, SoundCategory.BLOCKS, 1.4F, 0.55F);
        player.sendMessage(net.minecraft.text.Text.literal("RESONANCE CORE ARMED — get clear."), true);
        return ActionResult.CONSUME;
    }

    @Override
    public void scheduledTick(BlockState state, ServerWorld world, BlockPos pos, Random random) {
        if (!state.get(CHARGED)) {
            return;
        }

        double x = pos.getX() + 0.5;
        double y = pos.getY() + 0.5;
        double z = pos.getZ() + 0.5;
        world.spawnParticles(ParticleTypes.LARGE_SMOKE, x, y, z, 180, 3.8, 2.5, 3.8, 0.035);
        world.spawnParticles(ParticleTypes.FLASH, x, y, z, 1, 0.0, 0.0, 0.0, 0.0);
        world.spawnParticles(ParticleTypes.PORTAL, x, y, z, 110, 2.2, 1.8, 2.2, 0.12);

        // Vanilla's blast pipeline supplies block destruction, entity impulse, and fluid-aware behavior.
        // The mod adds an anomalous smoke/portal shell around that ordinary, server-authoritative explosion.
        world.createExplosion(null, x, y, z, 8.0F, World.ExplosionSourceType.BLOCK);
    }
}
