package dev.logan.entersift;

import net.minecraft.core.BlockPos;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.EntityBlock;
import net.minecraft.world.level.block.entity.BlockEntity;
import net.minecraft.world.level.block.entity.BlockEntityTicker;
import net.minecraft.world.level.block.entity.BlockEntityType;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.block.state.StateDefinition;
import net.minecraft.world.level.block.state.properties.IntegerProperty;

/** Solid, placeable core below the opening; genuine vanilla block light, not fake lightmap writes. */
public final class RiftCoreBlock extends Block implements EntityBlock {
    public static final IntegerProperty POWER = IntegerProperty.create("power", 0, 15);
    public RiftCoreBlock(Properties properties) {
        super(properties);
        registerDefaultState(stateDefinition.any().setValue(POWER, 5));
    }
    @Override protected void createBlockStateDefinition(StateDefinition.Builder<Block, BlockState> builder) { builder.add(POWER); }
    @Override public BlockEntity newBlockEntity(BlockPos pos, BlockState state) { return new RiftBlockEntity(pos, state); }
    @Override public <T extends BlockEntity> BlockEntityTicker<T> getTicker(Level level, BlockState state, BlockEntityType<T> type) {
        return type == RiftBlockEntities.RIFT ? (world, pos, blockState, entity) -> RiftBlockEntity.tick(world, pos, blockState, (RiftBlockEntity) entity) : null;
    }
    @Override public void setPlacedBy(Level level, BlockPos pos, BlockState state, LivingEntity placer, ItemStack stack) {
        super.setPlacedBy(level, pos, state, placer, stack);
        if (level.getBlockEntity(pos) instanceof RiftBlockEntity rift) rift.setYaw(placer == null ? 0 : placer.getYRot());
    }
}
