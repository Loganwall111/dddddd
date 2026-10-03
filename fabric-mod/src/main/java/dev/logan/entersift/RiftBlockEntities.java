package dev.logan.entersift;

import net.fabricmc.fabric.api.object.builder.v1.block.entity.FabricBlockEntityTypeBuilder;
import net.minecraft.core.Registry;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.world.level.block.entity.BlockEntityType;

public final class RiftBlockEntities {
    public static final BlockEntityType<RiftBlockEntity> RIFT = Registry.register(BuiltInRegistries.BLOCK_ENTITY_TYPE,
        SiftContent.id("rift_core"), FabricBlockEntityTypeBuilder.create(RiftBlockEntity::new, SiftContent.RIFT_CORE).build());
    private RiftBlockEntities() {}
    public static void initialize() {}
}
