package dev.logan.entersift;

import java.util.EnumMap;
import java.util.HashMap;
import java.util.Map;
import net.fabricmc.fabric.api.biome.v1.BiomeModifications;
import net.fabricmc.fabric.api.biome.v1.BiomeSelectors;
import net.fabricmc.fabric.api.object.builder.v1.entity.FabricDefaultAttributeRegistry;
import net.minecraft.core.Registry;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.core.registries.Registries;
import net.minecraft.resources.ResourceKey;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.Mob;
import net.minecraft.world.entity.MobCategory;
import net.minecraft.world.entity.SpawnPlacementTypes;
import net.minecraft.world.entity.SpawnPlacements;
import net.minecraft.world.entity.ai.attributes.Attributes;
import net.minecraft.world.entity.monster.Monster;
import net.minecraft.world.level.biome.Biome;
import net.minecraft.world.level.levelgen.GenerationStep;
import net.minecraft.world.level.levelgen.Heightmap;

/** Registers the nine Sift creatures as real entity types with attributes and natural spawns. */
public final class SiftEntities {
    private static final Map<SiftKind, EntityType<? extends Mob>> TYPES = new EnumMap<>(SiftKind.class);
    private static final Map<EntityType<?>, SiftKind> KINDS = new HashMap<>();

    public static SiftKind kindOf(EntityType<?> type) { return KINDS.getOrDefault(type, SiftKind.BLUB); }
    public static EntityType<? extends Mob> type(SiftKind kind) { return TYPES.get(kind); }

    private static ResourceKey<Biome> biome(String name) { return ResourceKey.create(Registries.BIOME, SiftContent.id(name)); }

    public static void initialize() {
        for (SiftKind kind : SiftKind.values()) {
            var key = ResourceKey.create(Registries.ENTITY_TYPE, SiftContent.id(kind.id));
            if (kind.hostile) {
                EntityType<SiftBeast> type = EntityType.Builder.<SiftBeast>of(SiftBeast::new, MobCategory.MONSTER)
                    .sized(kind.width, kind.height).clientTrackingRange(10).build(key);
                Registry.register(BuiltInRegistries.ENTITY_TYPE, key, type);
                FabricDefaultAttributeRegistry.register(type, Monster.createMonsterAttributes()
                    .add(Attributes.MAX_HEALTH, kind.health).add(Attributes.MOVEMENT_SPEED, kind.speed)
                    .add(Attributes.ATTACK_DAMAGE, Math.max(1, kind.damage)).add(Attributes.FOLLOW_RANGE, 32)
                    .add(Attributes.KNOCKBACK_RESISTANCE, kind == SiftKind.TWISTED_WARDEN ? 1.0 : 0.2)
                    .add(Attributes.FLYING_SPEED, 0.2));
                if (kind.floats) SpawnPlacements.register(type, SpawnPlacementTypes.NO_RESTRICTIONS, Heightmap.Types.MOTION_BLOCKING_NO_LEAVES, (t, l, r, p, rand) -> true);
                else SpawnPlacements.register(type, SpawnPlacementTypes.ON_GROUND, Heightmap.Types.MOTION_BLOCKING_NO_LEAVES, (t, l, r, p, rand) -> true);
                TYPES.put(kind, type); KINDS.put(type, kind);
            } else {
                EntityType<SiftCritter> type = EntityType.Builder.<SiftCritter>of(SiftCritter::new, MobCategory.CREATURE)
                    .sized(kind.width, kind.height).clientTrackingRange(10).build(key);
                Registry.register(BuiltInRegistries.ENTITY_TYPE, key, type);
                FabricDefaultAttributeRegistry.register(type, net.minecraft.world.entity.Mob.createMobAttributes()
                    .add(Attributes.MAX_HEALTH, kind.health).add(Attributes.MOVEMENT_SPEED, kind.speed)
                    .add(Attributes.FLYING_SPEED, 0.2).add(Attributes.FOLLOW_RANGE, 24)
                    .add(Attributes.KNOCKBACK_RESISTANCE, kind == SiftKind.SINGER ? 1.0 : 0.0));
                if (kind.floats) SpawnPlacements.register(type, SpawnPlacementTypes.NO_RESTRICTIONS, Heightmap.Types.MOTION_BLOCKING_NO_LEAVES, (t, l, r, p, rand) -> true);
                else SpawnPlacements.register(type, SpawnPlacementTypes.ON_GROUND, Heightmap.Types.MOTION_BLOCKING_NO_LEAVES, (t, l, r, p, rand) -> true);
                TYPES.put(kind, type); KINDS.put(type, kind);
            }
        }
        // Natural spawning in the Sift's biomes (the Singer and the Twisted Warden are event-only).
        spawn("singer_meadow", MobCategory.CREATURE, SiftKind.BLUB, 18, 2, 4);
        spawn("coral_expanse", MobCategory.CREATURE, SiftKind.BLUB, 12, 2, 4);
        spawn("coral_expanse", MobCategory.CREATURE, SiftKind.DRIFT_JELLY, 6, 1, 2);
        spawn("titan_crags", MobCategory.CREATURE, SiftKind.ANTLERLING, 12, 1, 3);
        spawn("boneyard", MobCategory.MONSTER, SiftKind.SCULKER, 20, 1, 3);
        spawn("boneyard", MobCategory.MONSTER, SiftKind.OVERSEER, 4, 1, 1);
        for (String biome : new String[]{"singer_meadow", "pale_grove", "rose_spires", "tidepool_reef", "carapace", "saltwound_expanse", "coral_expanse", "titan_crags"})
            spawn(biome, MobCategory.CREATURE, SiftKind.NOTE_BIRD, 10, 2, 4);
        spawn("singer_meadow", MobCategory.CREATURE, SiftKind.ANTLERLING, 8, 1, 2);
        spawn("pale_grove", MobCategory.CREATURE, SiftKind.BLUB, 14, 2, 4);
        spawn("pale_grove", MobCategory.CREATURE, SiftKind.DRIFT_JELLY, 8, 1, 3);
        spawn("pale_grove", MobCategory.CREATURE, SiftKind.SCULKLING, 10, 2, 3);
        spawn("rose_spires", MobCategory.CREATURE, SiftKind.SCULKLING, 10, 1, 3);
        spawn("rose_spires", MobCategory.MONSTER, SiftKind.LICKER, 20, 1, 2);
        spawn("tidepool_reef", MobCategory.CREATURE, SiftKind.DRIFT_JELLY, 12, 2, 4);
        spawn("tidepool_reef", MobCategory.MONSTER, SiftKind.SCULKER, 20, 1, 3);
        spawn("carapace", MobCategory.MONSTER, SiftKind.SCULKER, 20, 1, 2);
        spawn("carapace", MobCategory.MONSTER, SiftKind.OVERSEER, 3, 1, 1);
        spawn("saltwound_expanse", MobCategory.MONSTER, SiftKind.LICKER, 12, 1, 2);
        spawn("saltwound_expanse", MobCategory.CREATURE, SiftKind.ANTLERLING, 6, 1, 1);
        waterfalls();
    }

    /** Dungeons II overworld: extra waterfalls spilling out of cliffs, only in stone cliffs of mountain biomes (never plains: flowing water floods flat land). */
    private static void waterfalls() {
        var mountain = ResourceKey.create(Registries.PLACED_FEATURE, SiftContent.id("mountain_waterfall"));
        ResourceKey<Biome>[] peaks = mc("windswept_hills", "windswept_gravelly_hills", "windswept_forest", "windswept_savanna",
            "stony_peaks", "jagged_peaks", "cherry_grove");
        BiomeModifications.addFeature(BiomeSelectors.includeByKey(peaks), GenerationStep.Decoration.FLUID_SPRINGS, mountain);
    }

    @SuppressWarnings("unchecked")
    private static ResourceKey<Biome>[] mc(String... names) {
        ResourceKey<Biome>[] keys = new ResourceKey[names.length];
        for (int i = 0; i < names.length; i++) keys[i] = ResourceKey.create(Registries.BIOME, net.minecraft.resources.Identifier.fromNamespaceAndPath("minecraft", names[i]));
        return keys;
    }

    private static void spawn(String biome, MobCategory category, SiftKind kind, int weight, int min, int max) {
        BiomeModifications.addSpawn(BiomeSelectors.includeByKey(biome(biome)), category, TYPES.get(kind), weight, min, max);
    }

    private SiftEntities() {}
}
