package dev.logan.entersift;

import net.minecraft.network.syncher.EntityDataAccessor;
import net.minecraft.network.syncher.EntityDataSerializers;
import net.minecraft.network.syncher.SynchedEntityData;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.damagesource.DamageSource;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.storage.ValueInput;
import net.minecraft.world.level.storage.ValueOutput;

/**
 * A reality rift or portal opening (entity id {@code entersift:rift_portal}).
 *
 * It is a hollow, collision-free, unpickable volume with no model of its own. All visuals come from
 * the client {@code RiftPortalRenderer}. The server only ticks its age, which is synced so every
 * client plays the same growth timeline:
 *   ticks 0-30   puddle ripple with erratic lightning (the structure is still invisible)
 *   ticks 31-60  incubation seed: one tiny pulsing box
 *   ticks 61-100 voxel cluster fracture, one ring of boxes every 10 ticks
 *   ticks 100+   stable: dissolving voxel energy cubes, floating hollow cubes, rim shimmer
 *
 * NBT (summon): RiftType (int, see {@link RiftType}), Width, Height (blocks), Rotation[0] = facing yaw.
 * Travel and lifetime stay in the data pack (marker tagged sift.rift), which owns these entities.
 */
public class RiftPortalEntity extends Entity {
    public static final int GROWN = 100;
    private static final EntityDataAccessor<Integer> TYPE = SynchedEntityData.defineId(RiftPortalEntity.class, EntityDataSerializers.INT);
    private static final EntityDataAccessor<Integer> AGE = SynchedEntityData.defineId(RiftPortalEntity.class, EntityDataSerializers.INT);
    private static final EntityDataAccessor<Float> WIDTH = SynchedEntityData.defineId(RiftPortalEntity.class, EntityDataSerializers.FLOAT);
    private static final EntityDataAccessor<Float> HEIGHT = SynchedEntityData.defineId(RiftPortalEntity.class, EntityDataSerializers.FLOAT);

    public RiftPortalEntity(EntityType<? extends RiftPortalEntity> type, Level level) {
        super(type, level);
        this.noPhysics = true;
    }

    @Override
    protected void defineSynchedData(SynchedEntityData.Builder builder) {
        builder.define(TYPE, RiftType.SIFT.id).define(AGE, 0).define(WIDTH, 7.0f).define(HEIGHT, 5.0f);
    }

    public RiftType riftType() { return RiftType.byId(this.entityData.get(TYPE)); }
    public int age() { return this.entityData.get(AGE); }
    public float riftWidth() { return this.entityData.get(WIDTH); }
    public float riftHeight() { return this.entityData.get(HEIGHT); }

    @Override
    public void tick() {
        super.tick();
        // Only the growth phase is synced; afterwards the value stays constant (no network traffic).
        if (this.level() instanceof ServerLevel && age() <= GROWN + 20) this.entityData.set(AGE, age() + 1);
    }

    @Override public boolean isNoGravity() { return true; }
    @Override public boolean isPickable() { return false; }
    @Override public boolean canBeCollidedWith(Entity other) { return false; }
    @Override public boolean isAttackable() { return false; }
    @Override public boolean hurtServer(ServerLevel level, DamageSource source, float amount) { return false; }
    @Override public boolean shouldRenderAtSqrDistance(double distance) { return distance < 192 * 192; }

    @Override
    protected void readAdditionalSaveData(ValueInput input) {
        this.entityData.set(TYPE, input.getIntOr("RiftType", RiftType.SIFT.id));
        this.entityData.set(WIDTH, Math.max(1.5f, Math.min(12f, input.getFloatOr("Width", 7.0f))));
        this.entityData.set(HEIGHT, Math.max(1.5f, Math.min(12f, input.getFloatOr("Height", 5.0f))));
        this.entityData.set(AGE, input.getIntOr("Age", 0));
    }

    @Override
    protected void addAdditionalSaveData(ValueOutput output) {
        output.putInt("RiftType", riftType().id);
        output.putFloat("Width", riftWidth());
        output.putFloat("Height", riftHeight());
        output.putInt("Age", age());
    }
}
