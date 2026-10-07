package dev.logan.beyond.content;

import dev.logan.beyond.BeyondMinecraft;
import dev.logan.beyond.entity.RealmCritter;
import net.fabricmc.fabric.api.object.builder.v1.entity.FabricDefaultAttributeRegistry;
import net.minecraft.entity.EntityType;
import net.minecraft.entity.SpawnGroup;
import net.minecraft.registry.Registries;
import net.minecraft.registry.Registry;

/** One registered creature type, four procedural skins, no runtime registry growth. */
public final class BeyondEntities {
    public static final EntityType<RealmCritter> REALM_CRITTER = EntityType.Builder
        .create(RealmCritter::new, SpawnGroup.CREATURE)
        .dimensions(0.9f, 0.85f)
        .eyeHeight(0.62f)
        .maxTrackingRange(10)
        .build("beyond:realm_critter");
    private BeyondEntities() {}
    public static void initialize() {
        Registry.register(Registries.ENTITY_TYPE, BeyondMinecraft.id("realm_critter"), REALM_CRITTER);
        FabricDefaultAttributeRegistry.register(REALM_CRITTER, RealmCritter.createAttributes());
    }
}
