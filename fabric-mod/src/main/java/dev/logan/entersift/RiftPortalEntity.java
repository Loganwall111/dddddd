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
    private static final EntityDataAccessor<Boolean> ECHO = SynchedEntityData.defineId(RiftPortalEntity.class, EntityDataSerializers.BOOLEAN);
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
        builder.define(ECHO, false).define(TYPE, RiftType.SIFT.id).define(AGE, 0).define(WIDTH, 7.0f).define(HEIGHT, 5.0f);
    }

    public boolean transitEcho() { return this.entityData.get(ECHO); }
    public RiftType riftType() { return RiftType.byId(this.entityData.get(TYPE)); }
    public int age() { return this.entityData.get(AGE); }
    public float riftWidth() { return this.entityData.get(WIDTH); }
    public float riftHeight() { return this.entityData.get(HEIGHT); }

    private final java.util.Map<java.util.UUID, net.minecraft.world.phys.Vec3> previous = new java.util.HashMap<>();

    @Override
    public void tick() {
        super.tick();
        // Only the growth phase is synced; afterwards the value stays constant (no network traffic).
        if (this.level() instanceof ServerLevel level) {
            if (transitEcho()) {
                this.entityData.set(AGE, age()+1);
                if (age() >= 10) discard();
                return;
            }
            if (age() <= GROWN + 20) this.entityData.set(AGE, age() + 1);
            boolean travel = entityTags().contains("sift.rift_visual") || entityTags().contains("sift.return_anchor");
            if (!travel || age() < GROWN) { previous.clear(); return; }
            java.util.Set<java.util.UUID> nearby = new java.util.HashSet<>();
            for (var player : java.util.List.copyOf(level.players())) {
                if (player.isSpectator() || player.distanceToSqr(this) > 256) continue;
                nearby.add(player.getUUID());
                var current = player.position().add(0, player.getBbHeight() * 0.5, 0).subtract(position());
                var last = previous.put(player.getUUID(), current);
                if (last == null || !RiftCrossing.crosses(riftType(), riftWidth(), riftHeight(), getYRot(),
                        last.x, last.y, last.z, current.x, current.y, current.z)) continue;
                boolean returning = entityTags().contains("sift.return_anchor");
                // Function execution is gated per player, so two overlapping rifts cannot double-enter.
                String args = String.format(java.util.Locale.ROOT,
                    "{dest:%d,style:%d,width:%d,height:%d}", returning ? 5 : riftType().id,
                    riftType().id, Math.round(riftWidth()*100), Math.round(riftHeight()*100));
                EnterTheSift.runAs(player, "execute if score @s sift.cooldown matches 0 unless score @s sift.transit matches 1.. run function entersift:travel/cross " + args);
                previous.remove(player.getUUID());
            }
            previous.keySet().retainAll(nearby);
        }
    }

    @Override public boolean isNoGravity() { return true; }
    @Override public boolean isPickable() { return false; }
    @Override public boolean canBeCollidedWith(Entity other) { return false; }
    @Override public boolean isAttackable() { return false; }
    @Override public boolean hurtServer(ServerLevel level, DamageSource source, float amount) { return false; }
    @Override public boolean shouldRenderAtSqrDistance(double distance) { return distance < 192 * 192; }

    private static float size(float v, float fallback) { return Float.isFinite(v) ? Math.max(1.5f, Math.min(12f, v)) : fallback; }

    @Override
    protected void readAdditionalSaveData(ValueInput input) {
        this.entityData.set(ECHO, input.getBooleanOr("TransitEcho", false));
        this.entityData.set(TYPE, input.getIntOr("RiftType", RiftType.SIFT.id));
        this.entityData.set(WIDTH, size(input.getFloatOr("Width", 7.0f), 7f));
        this.entityData.set(HEIGHT, size(input.getFloatOr("Height", 5.0f), 5f));
        this.entityData.set(AGE, input.getIntOr("Age", 0));
    }

    @Override
    protected void addAdditionalSaveData(ValueOutput output) {
        output.putBoolean("TransitEcho", transitEcho());
        output.putInt("RiftType", riftType().id);
        output.putFloat("Width", riftWidth());
        output.putFloat("Height", riftHeight());
        output.putInt("Age", age());
    }
}
