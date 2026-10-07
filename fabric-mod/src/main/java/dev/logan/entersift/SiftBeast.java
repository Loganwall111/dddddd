package dev.logan.entersift;

import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.ai.goal.FloatGoal;
import net.minecraft.world.entity.ai.goal.LookAtPlayerGoal;
import net.minecraft.world.entity.ai.goal.MeleeAttackGoal;
import net.minecraft.world.entity.ai.goal.RandomLookAroundGoal;
import net.minecraft.world.entity.ai.goal.WaterAvoidingRandomStrollGoal;
import net.minecraft.world.entity.ai.goal.target.HurtByTargetGoal;
import net.minecraft.world.entity.ai.goal.target.NearestAttackableTargetGoal;
import net.minecraft.world.entity.monster.Monster;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.level.Level;

/** Hostile / neutral Sift creatures: Sculker, Licker, Overseer and the Twisted Warden guardian. */
public class SiftBeast extends Monster {
    public SiftBeast(EntityType<? extends Monster> type, Level level) { super(type, level); }

    public SiftKind kind() { return SiftEntities.kindOf(getType()); }

    @Override protected void registerGoals() {
        SiftKind kind = kind();
        goalSelector.addGoal(0, new FloatGoal(this));
        if (!kind.floats) {
            goalSelector.addGoal(2, new MeleeAttackGoal(this, 1.15, kind == SiftKind.TWISTED_WARDEN));
            goalSelector.addGoal(5, new WaterAvoidingRandomStrollGoal(this, 0.8));
        }
        goalSelector.addGoal(6, new LookAtPlayerGoal(this, Player.class, 12.0f));
        goalSelector.addGoal(7, new RandomLookAroundGoal(this));
        targetSelector.addGoal(1, new HurtByTargetGoal(this));
        if (kind.aggressive) targetSelector.addGoal(2, new NearestAttackableTargetGoal<>(this, Player.class, true));
    }

    @Override public void aiStep() {
        SiftKind kind = kind();
        if (kind.floats) SiftBehaviour.hover(this, kind);
        super.aiStep();
        SiftBehaviour.serverTick(this, kind);
    }

    @Override public boolean removeWhenFarAway(double distance) {
        return kind() != SiftKind.TWISTED_WARDEN && super.removeWhenFarAway(distance);
    }

    @Override protected net.minecraft.sounds.SoundEvent getAmbientSound() { return SiftSounds.voice(kind()).ambient(); }
    @Override protected net.minecraft.sounds.SoundEvent getHurtSound(net.minecraft.world.damagesource.DamageSource source) { return SiftSounds.voice(kind()).hurt(); }
    @Override protected net.minecraft.sounds.SoundEvent getDeathSound() { return SiftSounds.voice(kind()).death(); }
    @Override protected float getSoundVolume() {
        SiftKind k = kind();
        return k == SiftKind.TWISTED_WARDEN || k == SiftKind.DRIFT_JELLY ? 2.2f : k == SiftKind.SINGER ? 1.6f : 1.0f;
    }
    @Override public int getAmbientSoundInterval() {
        SiftKind k = kind();
        return k == SiftKind.NOTE_BIRD ? 120 : k == SiftKind.DRIFT_JELLY || k == SiftKind.SINGER ? 260 : 160;
    }
}
