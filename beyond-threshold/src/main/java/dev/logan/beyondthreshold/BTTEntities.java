package dev.logan.beyondthreshold;

import dev.logan.beyondthreshold.entity.BlackHoleEntity;
import dev.logan.beyondthreshold.entity.RealityTearEntity;
import dev.logan.beyondthreshold.entity.WatcherEyeEntity;
import net.fabricmc.fabric.api.object.builder.v1.entity.FabricEntityTypeBuilder;
import net.minecraft.entity.EntityDimensions;
import net.minecraft.entity.EntityType;
import net.minecraft.entity.SpawnGroup;
import net.minecraft.registry.Registries;
import net.minecraft.registry.Registry;
import net.minecraft.util.Identifier;

public final class BTTEntities {
	public static final EntityType<BlackHoleEntity> BLACK_HOLE = FabricEntityTypeBuilder
			.create(SpawnGroup.MISC, BlackHoleEntity::new)
			.dimensions(new EntityDimensions(4.0F, 4.0F, false))
			.trackRangeChunks(32)
			.fireImmune()
			.disableSummon()
			.build();

	public static final EntityType<WatcherEyeEntity> WATCHER_EYE = FabricEntityTypeBuilder
			.create(SpawnGroup.MISC, WatcherEyeEntity::new)
			.dimensions(new EntityDimensions(16.0F, 8.0F, false))
			.trackRangeChunks(64)
			.fireImmune()
			.disableSummon()
			.build();

	public static final EntityType<RealityTearEntity> REALITY_TEAR = FabricEntityTypeBuilder
			.create(SpawnGroup.MISC, RealityTearEntity::new)
			.dimensions(new EntityDimensions(3.0F, 3.0F, false))
			.trackRangeChunks(16)
			.fireImmune()
			.disableSummon()
			.build();

	public static void register() {
		Registry.register(Registries.ENTITY_TYPE, new Identifier(BeyondTheThreshold.MOD_ID, "black_hole"), BLACK_HOLE);
		Registry.register(Registries.ENTITY_TYPE, new Identifier(BeyondTheThreshold.MOD_ID, "watcher_eye"), WATCHER_EYE);
		Registry.register(Registries.ENTITY_TYPE, new Identifier(BeyondTheThreshold.MOD_ID, "reality_tear"), REALITY_TEAR);
	}

	private BTTEntities() {
	}
}
