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
 * 0.17 short-lived soft light column (the "aura glow" from the trailer). Played ritual note blocks
 * summon one instead of the old solid beam. It has no hitbox or physics and removes itself after
 * {@code Life} ticks; the client AuraColumnRenderer draws it as a soft additive column.
 *
 * NBT: {@code Color} (RGB int), {@code Life} (ticks, 10..1200), {@code Height} (blocks), {@code Rainbow} (1b = hue sweep).
 */
public class AuraColumnEntity extends Entity {
    private static final EntityDataAccessor<Integer> COLOR = SynchedEntityData.defineId(AuraColumnEntity.class, EntityDataSerializers.INT);
    private static final EntityDataAccessor<Integer> LIFE = SynchedEntityData.defineId(AuraColumnEntity.class, EntityDataSerializers.INT);
    private static final EntityDataAccessor<Float> HEIGHT = SynchedEntityData.defineId(AuraColumnEntity.class, EntityDataSerializers.FLOAT);
    private static final EntityDataAccessor<Boolean> RAINBOW = SynchedEntityData.defineId(AuraColumnEntity.class, EntityDataSerializers.BOOLEAN);

    public AuraColumnEntity(EntityType<? extends AuraColumnEntity> type, Level level) {
        super(type, level);
        this.noPhysics = true;
    }

    @Override
    protected void defineSynchedData(SynchedEntityData.Builder builder) {
        builder.define(COLOR, 0x7FF6FF).define(LIFE, 130).define(HEIGHT, 9f).define(RAINBOW, true);
    }

    public int color() { return this.entityData.get(COLOR); }
    public int life() { return this.entityData.get(LIFE); }
    public float columnHeight() { return this.entityData.get(HEIGHT); }
    public boolean rainbow() { return this.entityData.get(RAINBOW); }

    @Override
    public void tick() {
        super.tick();
        if (this.level() instanceof ServerLevel && this.tickCount > life()) this.discard();
    }

    @Override public boolean isNoGravity() { return true; }
    @Override public boolean isPickable() { return false; }
    @Override public boolean canBeCollidedWith(Entity other) { return false; }
    @Override public boolean isAttackable() { return false; }
    @Override public boolean hurtServer(ServerLevel level, DamageSource source, float amount) { return false; }
    @Override public boolean shouldRenderAtSqrDistance(double distance) { return distance < 128 * 128; }

    @Override
    protected void readAdditionalSaveData(ValueInput input) {
        this.entityData.set(COLOR, input.getIntOr("Color", 0x7FF6FF));
        this.entityData.set(LIFE, Math.max(10, Math.min(1200, input.getIntOr("Life", 130))));
        this.entityData.set(HEIGHT, Math.max(1f, Math.min(48f, input.getFloatOr("Height", 9f))));
        this.entityData.set(RAINBOW, input.getBooleanOr("Rainbow", true));
    }

    @Override
    protected void addAdditionalSaveData(ValueOutput output) {
        output.putInt("Color", color());
        output.putInt("Life", life());
        output.putFloat("Height", columnHeight());
        output.putBoolean("Rainbow", rainbow());
    }
}
