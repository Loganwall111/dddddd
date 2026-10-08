package dev.beyondlimits.entity;

import dev.beyondlimits.BeyondLimits;
import net.fabricmc.fabric.api.object.builder.v1.entity.FabricDefaultAttributeRegistry;
import net.fabricmc.fabric.api.object.builder.v1.entity.FabricEntityTypeBuilder;
import net.minecraft.entity.EntityDimensions;
import net.minecraft.entity.EntityType;
import net.minecraft.entity.SpawnGroup;
import net.minecraft.registry.Registries;
import net.minecraft.registry.Registry;

public final class ModEntities {
    public static final EntityType<ObserverEntity> OBSERVER = register("observer", 0.8F, 1.9F);
    public static final EntityType<ObserverEntity> MIRROR_ECHO = register("mirror_echo", 0.8F, 1.9F);
    public static final EntityType<ObserverEntity> FRAYLING = register("frayling", 0.55F, 0.8F);

    private ModEntities() {
    }

    private static EntityType<ObserverEntity> register(String id, float width, float height) {
        return Registry.register(
                Registries.ENTITY_TYPE,
                BeyondLimits.id(id),
                FabricEntityTypeBuilder.create(SpawnGroup.MONSTER, ObserverEntity::new)
                        .dimensions(EntityDimensions.fixed(width, height))
                        .trackRangeBlocks(96)
                        .trackedUpdateRate(2)
                        .build()
        );
    }

    public static void register() {
        FabricDefaultAttributeRegistry.register(OBSERVER, ObserverEntity.createAttributes());
        FabricDefaultAttributeRegistry.register(MIRROR_ECHO, ObserverEntity.createAttributes());
        FabricDefaultAttributeRegistry.register(FRAYLING, ObserverEntity.createAttributes());
    }
}
