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
}
