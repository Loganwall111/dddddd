package dev.logan.riftext;

import net.minecraft.core.Registry;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.core.registries.Registries;
import net.minecraft.resources.ResourceKey;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.MobCategory;

/**
 * Registers the rift portal entity type for the Rift Extension mod.
 */
public final class RiftExtEntities {

    /** The rift/portal opening: hollow, invisible volume drawn by the client RiftPortalRenderer. */
    public static final EntityType<RiftPortalEntity> RIFT_PORTAL = Registry.register(
        BuiltInRegistries.ENTITY_TYPE,
        ResourceKey.create(Registries.ENTITY_TYPE, RiftContent.id("rift_portal")),
        EntityType.Builder.<RiftPortalEntity>of(RiftPortalEntity::new, MobCategory.MISC)
            .sized(1f, 1f).fireImmune()
            .clientTrackingRange(12).updateInterval(20)
            .build(ResourceKey.create(Registries.ENTITY_TYPE, RiftContent.id("rift_portal")))
    );

    public static void initialize() {
        // Entity type is registered by the static field above.
    }

    private RiftExtEntities() {}
}