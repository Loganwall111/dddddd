package com.beyondthelimits.registry;

import com.beyondthelimits.BeyondTheLimits;
import com.beyondthelimits.entity.AmbushSpiderEntity;
import com.beyondthelimits.entity.BlackSunEntity;
import com.beyondthelimits.entity.CodeWraithEntity;
import com.beyondthelimits.entity.EvolvedZombieEntity;
import com.beyondthelimits.entity.FacelingEntity;
import com.beyondthelimits.entity.FogShadeEntity;
import com.beyondthelimits.entity.FogWalkerEntity;
import com.beyondthelimits.entity.GiantInsectEntity;
import com.beyondthelimits.entity.HidingCreeperEntity;
import com.beyondthelimits.entity.HoundEntity;
import com.beyondthelimits.entity.HunterSkeletonEntity;
import com.beyondthelimits.entity.MemoryEchoEntity;
import com.beyondthelimits.entity.MirrorDoubleEntity;
import com.beyondthelimits.entity.ObserverEntity;
import com.beyondthelimits.entity.PartygoerEntity;
import com.beyondthelimits.entity.RealityWarheadEntity;
import com.beyondthelimits.entity.RiftEntity;
import com.beyondthelimits.entity.SkinStealerEntity;
import com.beyondthelimits.entity.SmilerEntity;
import net.fabricmc.fabric.api.object.builder.v1.entity.FabricDefaultAttributeRegistry;
import net.minecraft.entity.Entity;
import net.minecraft.entity.EntityType;
import net.minecraft.entity.SpawnGroup;
import net.minecraft.entity.attribute.EntityAttributes;
import net.minecraft.entity.mob.HostileEntity;
import net.minecraft.entity.mob.MobEntity;
import net.minecraft.registry.Registries;
import net.minecraft.registry.Registry;

/**
 * Every entity in Chapter One, plus the default attributes the game needs for the living ones.
 *
 * <p>Attribute blocks are deliberately built from vanilla factories ({@code createHostileAttributes},
 * {@code createMobAttributes}, {@code createZombieAttributes}, ...) and then tuned with the two
 * attribute constants whose names are stable across 1.21.x — maximum health and movement speed.
 * Anything else would be a compatibility hazard for no gameplay benefit.</p>
 */
public final class BtlEntities {
	private BtlEntities() {
	}

	// --- The rift itself -------------------------------------------------------------------------

	public static final EntityType<RiftEntity> RIFT = register("rift",
			EntityType.Builder.create(RiftEntity::new, SpawnGroup.MISC)
					.dimensions(1.0F, 3.0F)
					.maxTrackingRange(16)
					.trackingTickInterval(2)
					.build("rift"));

	// --- The watchers ----------------------------------------------------------------------------

	public static final EntityType<ObserverEntity> OBSERVER = register("observer",
			EntityType.Builder.create(ObserverEntity::new, SpawnGroup.MISC)
					.dimensions(0.6F, 1.9F)
					.eyeHeight(1.6F)
					.maxTrackingRange(16)
					.build("observer"));

	public static final EntityType<BlackSunEntity> BLACK_SUN = register("black_sun",
			EntityType.Builder.create(BlackSunEntity::new, SpawnGroup.MISC)
					.dimensions(8.0F, 8.0F)
					.maxTrackingRange(32)
					.build("black_sun"));

	public static final EntityType<RealityWarheadEntity> WARHEAD = register("reality_warhead",
			EntityType.Builder.create(RealityWarheadEntity::new, SpawnGroup.MISC)
					.dimensions(0.8F, 1.2F)
					.maxTrackingRange(16)
					.trackingTickInterval(2)
					.build("reality_warhead"));

	// --- Backrooms inhabitants -------------------------------------------------------------------

	public static final EntityType<SmilerEntity> SMILER = register("smiler",
			EntityType.Builder.create(SmilerEntity::new, SpawnGroup.MONSTER)
					.dimensions(0.7F, 1.9F)
					.build("smiler"));

	public static final EntityType<HoundEntity> HOUND = register("hound",
			EntityType.Builder.create(HoundEntity::new, SpawnGroup.MONSTER)
					.dimensions(0.9F, 0.9F)
					.build("hound"));

	public static final EntityType<SkinStealerEntity> SKIN_STEALER = register("skin_stealer",
			EntityType.Builder.create(SkinStealerEntity::new, SpawnGroup.MONSTER)
					.dimensions(0.6F, 1.8F)
					.eyeHeight(1.62F)
					.build("skin_stealer"));

	public static final EntityType<PartygoerEntity> PARTYGOER = register("partygoer",
			EntityType.Builder.create(PartygoerEntity::new, SpawnGroup.MONSTER)
					.dimensions(0.6F, 1.9F)
					.build("partygoer"));

	public static final EntityType<FacelingEntity> FACELING = register("faceling",
			EntityType.Builder.create(FacelingEntity::new, SpawnGroup.CREATURE)
					.dimensions(0.6F, 1.8F)
					.build("faceling"));

	// --- Dimensions ------------------------------------------------------------------------------

	public static final EntityType<FogShadeEntity> FOG_SHADE = register("fog_shade",
			EntityType.Builder.create(FogShadeEntity::new, SpawnGroup.MONSTER)
					.dimensions(0.7F, 2.1F)
					.build("fog_shade"));

	public static final EntityType<FogWalkerEntity> FOG_WALKER = register("fog_walker",
			EntityType.Builder.create(FogWalkerEntity::new, SpawnGroup.CREATURE)
					.dimensions(2.4F, 10.5F)
					.maxTrackingRange(20)
					.build("fog_walker"));

	public static final EntityType<CodeWraithEntity> CODE_WRAITH = register("code_wraith",
			EntityType.Builder.create(CodeWraithEntity::new, SpawnGroup.MONSTER)
					.dimensions(0.7F, 2.2F)
					.build("code_wraith"));

	public static final EntityType<GiantInsectEntity> GIANT_INSECT = register("giant_insect",
			EntityType.Builder.create(GiantInsectEntity::new, SpawnGroup.MONSTER)
					.dimensions(1.4F, 0.9F)
					.build("giant_insect"));

	// --- Evolution -------------------------------------------------------------------------------

	public static final EntityType<EvolvedZombieEntity> EVOLVED_ZOMBIE = register("evolved_zombie",
			EntityType.Builder.create(EvolvedZombieEntity::new, SpawnGroup.MONSTER)
					.dimensions(0.6F, 1.95F)
					.build("evolved_zombie"));

	public static final EntityType<HunterSkeletonEntity> HUNTER_SKELETON = register("hunter_skeleton",
			EntityType.Builder.create(HunterSkeletonEntity::new, SpawnGroup.MONSTER)
					.dimensions(0.6F, 1.99F)
					.build("hunter_skeleton"));

	public static final EntityType<AmbushSpiderEntity> AMBUSH_SPIDER = register("ambush_spider",
			EntityType.Builder.create(AmbushSpiderEntity::new, SpawnGroup.MONSTER)
					.dimensions(1.4F, 0.9F)
					.build("ambush_spider"));

	public static final EntityType<HidingCreeperEntity> HIDING_CREEPER = register("hiding_creeper",
			EntityType.Builder.create(HidingCreeperEntity::new, SpawnGroup.MONSTER)
					.dimensions(0.6F, 1.7F)
					.build("hiding_creeper"));

	// --- Mirrors and memories --------------------------------------------------------------------

	public static final EntityType<MirrorDoubleEntity> MIRROR_DOUBLE = register("mirror_double",
			EntityType.Builder.create(MirrorDoubleEntity::new, SpawnGroup.CREATURE)
					.dimensions(0.6F, 1.8F)
					.build("mirror_double"));

	public static final EntityType<MemoryEchoEntity> MEMORY_ECHO = register("memory_echo",
			EntityType.Builder.create(MemoryEchoEntity::new, SpawnGroup.CREATURE)
					.dimensions(0.6F, 1.8F)
					.build("memory_echo"));

	private static <T extends Entity> EntityType<T> register(String path, EntityType<T> type) {
		return Registry.register(Registries.ENTITY_TYPE, BeyondTheLimits.id(path), type);
	}

	public static void register() {
		// Living entities must have default attributes or the game throws on spawn.
		FabricDefaultAttributeRegistry.register(OBSERVER, mob().add(EntityAttributes.GENERIC_MAX_HEALTH, 30.0D)
				.add(EntityAttributes.GENERIC_MOVEMENT_SPEED, 0.22D));
		FabricDefaultAttributeRegistry.register(SMILER, hostile().add(EntityAttributes.GENERIC_MAX_HEALTH, 26.0D)
				.add(EntityAttributes.GENERIC_MOVEMENT_SPEED, 0.31D));
		FabricDefaultAttributeRegistry.register(HOUND, hostile().add(EntityAttributes.GENERIC_MAX_HEALTH, 20.0D)
				.add(EntityAttributes.GENERIC_MOVEMENT_SPEED, 0.42D));
		FabricDefaultAttributeRegistry.register(SKIN_STEALER, hostile().add(EntityAttributes.GENERIC_MAX_HEALTH, 24.0D)
				.add(EntityAttributes.GENERIC_MOVEMENT_SPEED, 0.29D));
		FabricDefaultAttributeRegistry.register(PARTYGOER, hostile().add(EntityAttributes.GENERIC_MAX_HEALTH, 18.0D)
				.add(EntityAttributes.GENERIC_MOVEMENT_SPEED, 0.33D));
		FabricDefaultAttributeRegistry.register(FACELING, mob().add(EntityAttributes.GENERIC_MAX_HEALTH, 20.0D)
				.add(EntityAttributes.GENERIC_MOVEMENT_SPEED, 0.26D));
		FabricDefaultAttributeRegistry.register(FOG_SHADE, hostile().add(EntityAttributes.GENERIC_MAX_HEALTH, 24.0D)
				.add(EntityAttributes.GENERIC_MOVEMENT_SPEED, 0.3D));
		FabricDefaultAttributeRegistry.register(FOG_WALKER, mob().add(EntityAttributes.GENERIC_MAX_HEALTH, 200.0D)
				.add(EntityAttributes.GENERIC_MOVEMENT_SPEED, 0.18D));
		FabricDefaultAttributeRegistry.register(CODE_WRAITH, hostile().add(EntityAttributes.GENERIC_MAX_HEALTH, 22.0D)
				.add(EntityAttributes.GENERIC_MOVEMENT_SPEED, 0.3D));
		FabricDefaultAttributeRegistry.register(GIANT_INSECT, hostile().add(EntityAttributes.GENERIC_MAX_HEALTH, 16.0D)
				.add(EntityAttributes.GENERIC_MOVEMENT_SPEED, 0.34D));
		FabricDefaultAttributeRegistry.register(MIRROR_DOUBLE, mob().add(EntityAttributes.GENERIC_MAX_HEALTH, 20.0D)
				.add(EntityAttributes.GENERIC_MOVEMENT_SPEED, 0.26D));
		FabricDefaultAttributeRegistry.register(MEMORY_ECHO, mob().add(EntityAttributes.GENERIC_MAX_HEALTH, 20.0D)
				.add(EntityAttributes.GENERIC_MOVEMENT_SPEED, 0.24D));
		FabricDefaultAttributeRegistry.register(EVOLVED_ZOMBIE, EvolvedZombieEntity.createEvolvedZombieAttributes());
		FabricDefaultAttributeRegistry.register(HUNTER_SKELETON, HunterSkeletonEntity.createHunterAttributes());
		FabricDefaultAttributeRegistry.register(AMBUSH_SPIDER, AmbushSpiderEntity.createAmbushSpiderAttributes());
		FabricDefaultAttributeRegistry.register(HIDING_CREEPER, HidingCreeperEntity.createHidingCreeperAttributes());
	}

	private static net.minecraft.entity.attribute.DefaultAttributeContainer.Builder mob() {
		return MobEntity.createMobAttributes();
	}

	private static net.minecraft.entity.attribute.DefaultAttributeContainer.Builder hostile() {
		return HostileEntity.createHostileAttributes();
	}
}
