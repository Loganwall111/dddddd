package dev.beyondlimits.block;

import dev.beyondlimits.ModDimensions;
import dev.beyondlimits.world.CodeverseSanctum;
import net.minecraft.block.Block;
import net.minecraft.block.BlockState;
import net.minecraft.entity.Entity;
import net.minecraft.server.network.ServerPlayerEntity;
import net.minecraft.server.world.ServerWorld;
import net.minecraft.state.StateManager;
import net.minecraft.state.property.IntProperty;
import net.minecraft.util.math.BlockPos;
import net.minecraft.util.math.random.Random;
import net.minecraft.util.shape.VoxelShape;
import net.minecraft.util.shape.VoxelShapes;
import net.minecraft.world.BlockView;
import net.minecraft.world.World;
import net.minecraft.world.WorldView;
import net.minecraft.sound.SoundCategory;
import net.minecraft.sound.SoundEvents;
import net.minecraft.particle.ParticleTypes;

public final class RiftTearBlock extends Block {
    public static final IntProperty STAGE = IntProperty.of("stage", 0, 3);
    private static final VoxelShape PLANE = VoxelShapes.cuboid(0.08, 0.0, 0.08, 0.92, 1.0, 0.92);

    public RiftTearBlock(Settings settings) {
        super(settings);
        setDefaultState(getStateManager().getDefaultState().with(STAGE, 0));
    }

    @Override
    protected void appendProperties(StateManager.Builder<Block, BlockState> builder) {
        builder.add(STAGE);
    }

    @Override
    public VoxelShape getOutlineShape(BlockState state, BlockView world, BlockPos pos, net.minecraft.block.ShapeContext context) {
        return PLANE;
    }

    @Override
    public VoxelShape getCollisionShape(BlockState state, BlockView world, BlockPos pos, net.minecraft.block.ShapeContext context) {
        return VoxelShapes.empty();
    }

    @Override
    public boolean canPlaceAt(BlockState state, WorldView world, BlockPos pos) {
        return world.getBlockState(pos.down()).isSolidBlock(world, pos.down());
    }

    @Override
    public void onBlockAdded(BlockState state, World world, BlockPos pos, BlockState oldState, boolean notify) {
        super.onBlockAdded(state, world, pos, oldState, notify);
        if (!world.isClient && !state.isOf(oldState.getBlock())) {
            world.scheduleBlockTick(pos, this, 24_000);
        }
    }

    @Override
    public void scheduledTick(BlockState state, ServerWorld world, BlockPos pos, Random random) {
        int stage = state.get(STAGE);
        if (stage < 3) {
            world.setBlockState(pos, state.with(STAGE, stage + 1), Block.NOTIFY_ALL);
            world.playSound(null, pos, SoundEvents.BLOCK_AMETHYST_BLOCK_CHIME, SoundCategory.AMBIENT, 0.45F, 0.55F + stage * 0.16F);
            world.scheduleBlockTick(pos, this, 24_000);
        }
    }

    @Override
    public void randomDisplayTick(BlockState state, World world, BlockPos pos, Random random) {
        int count = 1 + state.get(STAGE);
        for (int i = 0; i < count; i++) {
            world.addParticle(ParticleTypes.PORTAL,
                    pos.getX() + 0.15 + random.nextDouble() * 0.7,
                    pos.getY() + random.nextDouble(),
                    pos.getZ() + 0.15 + random.nextDouble() * 0.7,
                    (random.nextDouble() - 0.5) * 0.12,
                    (random.nextDouble() - 0.5) * 0.16,
                    (random.nextDouble() - 0.5) * 0.12);
        }
        if (state.get(STAGE) >= 2 && random.nextInt(5) == 0) {
            world.addParticle(ParticleTypes.END_ROD,
                    pos.getX() + 0.5, pos.getY() + random.nextDouble(), pos.getZ() + 0.5,
                    (random.nextDouble() - 0.5) * 0.04, 0.05, (random.nextDouble() - 0.5) * 0.04);
        }
    }

    @Override
    public void onEntityCollision(BlockState state, World world, BlockPos pos, Entity entity) {
        if (world.isClient || state.get(STAGE) < 3 || !(entity instanceof ServerPlayerEntity player)) {
            return;
        }

        if (player.getWorld().getRegistryKey().equals(ModDimensions.CODEVERSE)) {
            ServerWorld overworld = player.getServer().getOverworld();
            BlockPos spawn = overworld.getSpawnPos();
            player.teleport(overworld, spawn.getX() + 0.5, spawn.getY() + 1.0, spawn.getZ() + 0.5,
                    player.getYaw(), player.getPitch());
            player.sendMessage(net.minecraft.text.Text.literal("The seam releases you into the waking world."), true);
            return;
        }

        ServerWorld codeverse = player.getServer().getWorld(ModDimensions.CODEVERSE);
        if (codeverse == null) {
            player.sendMessage(net.minecraft.text.Text.literal("The Codeverse has not formed in this save."), false);
            return;
        }

        CodeverseSanctum.ensure(codeverse);
        player.teleport(codeverse, 4.5, CodeverseSanctum.PLATFORM_Y + 1.0, 0.5, player.getYaw(), player.getPitch());
        codeverse.playSound(null, new BlockPos(0, CodeverseSanctum.PLATFORM_Y, 0),
                SoundEvents.BLOCK_END_PORTAL_SPAWN, SoundCategory.AMBIENT, 0.8F, 0.72F);
        player.sendMessage(net.minecraft.text.Text.literal("You cross the seam. The world ends; the Codeverse begins."), true);
    }
}
