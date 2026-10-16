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
 * the client {@code RiftPortalRenderer}. Server-synced age drives a cube (0-18), tumbling bar
 * (18-52), opening ring (52-61), then tiered stepped aperture (61-100).
 * Travel is server-owned swept crossing of the recessed aperture, never a radius selector.
 * Data-pack markers own ordinary lifetimes; LifeTicks bounds temporary destination rifts.
 */
public class RiftPortalEntity extends Entity {
    private final java.util.Map<java.util.UUID, net.minecraft.world.phys.Vec3> previous = new java.util.HashMap<>();
    private int lifeTicks = -1;
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
        if (!(this.level() instanceof ServerLevel level)) return;
        if (lifeTicks == 0) { discard(); return; }
        if (lifeTicks > 0) lifeTicks--;
        if (age() <= GROWN + 20) this.entityData.set(AGE, age() + 1);
        if (age() < GROWN || riftType() == RiftType.PORTAL || entityTags().contains("sift.arrival")) return;
        java.util.Set<java.util.UUID> seen = new java.util.HashSet<>();
        for (var player : level.players()) {
            if (player.isSpectator() || distanceToSqr(player) > 24 * 24) continue;
            seen.add(player.getUUID());
            var now = player.position().add(0, player.getBbHeight() * 0.5, 0);
            var before = previous.put(player.getUUID(), now);
            // Loading beside a rift, standing still, and remote teleports are not crossings.
            if (before == null || before.distanceToSqr(now) > 64) continue;
            var a = before.subtract(position()); var b = now.subtract(position());
            if (RiftAperture.crossedWorld(riftType().id, riftWidth(), riftHeight(), getYRot(), a.x, a.y, a.z, b.x, b.y, b.z)) {
                String gate = "execute if score @s sift.cooldown matches 0 if score @s sift.transit matches 0 run ";
                EnterTheSift.runAs(player, gate + "tag @s add sift.crossed");
                if (player.entityTags().contains("sift.crossed")) {
                    RiftTravel.remember(player, this);
                    EnterTheSift.runAs(player, "function entersift:travel/warp {dest:" + riftType().id + "}");
                    player.removeTag("sift.crossed");
                }
            }
        }
        previous.keySet().retainAll(seen);
    }

    @Override public boolean isNoGravity() { return true; }
    @Override public boolean isPickable() { return false; }
    @Override public boolean canBeCollidedWith(Entity other) { return false; }
    @Override public boolean isAttackable() { return false; }
    @Override public boolean hurtServer(ServerLevel level, DamageSource source, float amount) { return false; }
    @Override public boolean shouldRenderAtSqrDistance(double distance) { return distance < 192 * 192; }

    @Override
    protected void readAdditionalSaveData(ValueInput input) {
        lifeTicks = input.getIntOr("LifeTicks", -1);
        this.entityData.set(TYPE, input.getIntOr("RiftType", RiftType.SIFT.id));
        this.entityData.set(WIDTH, Math.max(1.5f, Math.min(12f, input.getFloatOr("Width", 7.0f))));
        this.entityData.set(HEIGHT, Math.max(1.5f, Math.min(12f, input.getFloatOr("Height", 5.0f))));
        this.entityData.set(AGE, input.getIntOr("Age", 0));
    }

    @Override
    protected void addAdditionalSaveData(ValueOutput output) {
        output.putInt("LifeTicks", lifeTicks);
        output.putInt("RiftType", riftType().id);
        output.putFloat("Width", riftWidth());
        output.putFloat("Height", riftHeight());
        output.putInt("Age", age());
    }
}
