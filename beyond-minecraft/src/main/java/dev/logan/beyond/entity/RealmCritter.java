package dev.logan.beyond.entity;

import dev.logan.beyond.BeyondMinecraft;
import net.minecraft.entity.EntityData;
import net.minecraft.entity.EntityType;
import net.minecraft.entity.SpawnReason;
import net.minecraft.entity.ai.goal.EscapeDangerGoal;
import net.minecraft.entity.ai.goal.FleeEntityGoal;
import net.minecraft.entity.ai.goal.LookAroundGoal;
import net.minecraft.entity.ai.goal.LookAtEntityGoal;
import net.minecraft.entity.ai.goal.SwimGoal;
import net.minecraft.entity.ai.goal.WanderAroundFarGoal;
import net.minecraft.entity.attribute.DefaultAttributeContainer;
import net.minecraft.entity.attribute.EntityAttributes;
import net.minecraft.entity.mob.PathAwareEntity;
import net.minecraft.entity.player.PlayerEntity;
import net.minecraft.entity.data.DataTracker;
import net.minecraft.entity.data.TrackedData;
import net.minecraft.entity.data.TrackedDataHandlerRegistry;
import net.minecraft.nbt.NbtCompound;
import net.minecraft.server.world.ServerWorld;
import net.minecraft.util.math.BlockPos;
import net.minecraft.util.math.random.Random;
import net.minecraft.world.LocalDifficulty;
import net.minecraft.world.ServerWorldAccess;
import net.minecraft.world.World;
import org.jetbrains.annotations.Nullable;

/**
 * A procedurally skinned realm creature. Four skins ship with the mod; a critter picks the one
 * matching its realm family and inherits that realm's material palette in its mottled texture.
 * It wanders, watches players from a distance and flees when approached: no forced combat.
 */
public class RealmCritter extends PathAwareEntity {
    private static final TrackedData<Integer> VARIANT = DataTracker.registerData(RealmCritter.class, TrackedDataHandlerRegistry.INTEGER);
    private static final String[] FAMILY = {"canopy", "fold", "cinder", "void"};
    public RealmCritter(EntityType<? extends PathAwareEntity> type, World world) { super(type, world); }
    public static DefaultAttributeContainer.Builder createAttributes() {
        return PathAwareEntity.createMobAttributes()
            .add(EntityAttributes.GENERIC_MAX_HEALTH, 14.0)
            .add(EntityAttributes.GENERIC_MOVEMENT_SPEED, 0.26)
            .add(EntityAttributes.GENERIC_FOLLOW_RANGE, 18.0)
            .add(EntityAttributes.GENERIC_STEP_HEIGHT, 1.0);
    }
    @Override protected void initDataTracker(DataTracker.Builder builder) { super.initDataTracker(builder); builder.add(VARIANT, 0); }
    @Override protected void initGoals() {
        goalSelector.add(0, new SwimGoal(this));
        goalSelector.add(1, new EscapeDangerGoal(this, 1.4));
        goalSelector.add(2, new FleeEntityGoal<>(this, PlayerEntity.class, 7.0f, 1.2, 1.5));
        goalSelector.add(3, new WanderAroundFarGoal(this, 0.9));
        goalSelector.add(4, new LookAtEntityGoal(this, PlayerEntity.class, 16.0f));
        goalSelector.add(5, new LookAroundGoal(this));
    }
    public int getVariant() { return dataTracker.get(VARIANT); }
    public void setVariant(int variant) { dataTracker.set(VARIANT, Math.floorMod(variant, 4)); }
    public String family() { return FAMILY[Math.floorMod(getVariant(), FAMILY.length)]; }
    /** Realm-derived skin plus a small local jitter, so a crowd is not a clone army. */
    public static int variantFor(World world, Random random) {
        int base = Math.floorMod(world.getRegistryKey().getValue().hashCode(), 4);
        return random.nextInt(4) == 0 ? random.nextInt(4) : base;
    }
    @Override public EntityData initialize(ServerWorldAccess world, LocalDifficulty difficulty, SpawnReason reason,
                                           @Nullable EntityData data) {
        // Persisted variants are restored by readCustomDataFromNbt; fresh spawns pick a family skin.
        setVariant(variantFor(world.toServerWorld(), getRandom()));
        return super.initialize(world, difficulty, reason, data);
    }
    @Override public void writeCustomDataToNbt(NbtCompound nbt) { super.writeCustomDataToNbt(nbt); nbt.putInt("Variant", getVariant()); }
    @Override public void readCustomDataFromNbt(NbtCompound nbt) { super.readCustomDataFromNbt(nbt); if (nbt.contains("Variant")) setVariant(nbt.getInt("Variant")); }
    /** Critters survive the generated spaces: they are the only warm bodies in the white void. */
    public static boolean canSpawnIn(ServerWorld world, BlockPos pos) {
        return world.getBlockState(pos.down()).isSolidBlock(world, pos.down())
            && world.getBlockState(pos).isAir() && world.getBlockState(pos.up()).isAir()
            && BeyondMinecraft.CATALOG.realm(world.getRegistryKey().getValue().getPath()) != null;
    }
}
