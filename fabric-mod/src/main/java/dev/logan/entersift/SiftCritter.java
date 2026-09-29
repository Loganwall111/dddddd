package dev.logan.entersift;

import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.PathfinderMob;
import net.minecraft.world.entity.ai.goal.FloatGoal;
import net.minecraft.world.entity.ai.goal.LookAtPlayerGoal;
import net.minecraft.world.entity.ai.goal.PanicGoal;
import net.minecraft.world.entity.ai.goal.RandomLookAroundGoal;
import net.minecraft.world.entity.ai.goal.WaterAvoidingRandomStrollGoal;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.level.Level;

/** Passive Sift fauna: Blub, Sculkling, Antlerling, Drift Jelly and the Singer. */
public class SiftCritter extends PathfinderMob {
    public SiftCritter(EntityType<? extends PathfinderMob> type, Level level) { super(type, level); }

    public SiftKind kind() { return SiftEntities.kindOf(getType()); }

    @Override protected void registerGoals() {
        SiftKind kind = kind();
        if (kind == SiftKind.SINGER) {
            goalSelector.addGoal(1, new LookAtPlayerGoal(this, Player.class, 24.0f));
            return;
        }
        goalSelector.addGoal(0, new FloatGoal(this));
        goalSelector.addGoal(1, new PanicGoal(this, 1.5));
        if (!kind.floats) goalSelector.addGoal(5, new WaterAvoidingRandomStrollGoal(this, 0.9));
        goalSelector.addGoal(6, new LookAtPlayerGoal(this, Player.class, 8.0f));
        goalSelector.addGoal(7, new RandomLookAroundGoal(this));
    }

    @Override public void aiStep() {
        SiftKind kind = kind();
        if (kind.floats) SiftBehaviour.hover(this, kind);
        super.aiStep();
        SiftBehaviour.serverTick(this, kind);
    }

    @Override public boolean removeWhenFarAway(double distance) { return false; }

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
