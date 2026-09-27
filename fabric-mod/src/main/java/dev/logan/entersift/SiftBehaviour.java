package dev.logan.entersift;

import java.util.Locale;
import net.minecraft.core.BlockPos;
import net.minecraft.core.particles.ParticleTypes;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.Mob;

/**
 * Shared per-tick behaviour for Sift creatures. Effects that touch other entities go through
 * vanilla commands (damage, effect, playsound) so they stay version-stable and data-driven.
 */
final class SiftBehaviour {
    private SiftBehaviour() {}

    static void command(ServerLevel level, String cmd) {
        level.getServer().getCommands().performPrefixedCommand(level.getServer().createCommandSourceStack().withSuppressedOutput(), cmd);
    }

    private static String at(Mob mob, String cmd) {
        return String.format(Locale.ROOT, "execute in %s positioned %.2f %.2f %.2f run %s",
            mob.level().dimension().identifier(), mob.getX(), mob.getY(), mob.getZ(), cmd);
    }

    /** Hover floaters a few blocks above the ground and let them drift. */
    static void hover(Mob mob, SiftKind kind) {
        mob.setNoGravity(true);
        int gap = 0;
        BlockPos p = mob.blockPosition();
        while (gap < 8 && mob.level().getBlockState(p.below(gap + 1)).isAir()) gap++;
        double want = kind == SiftKind.SINGER ? 0.0 : (kind == SiftKind.OVERSEER ? 4.0 : 2.5);
        var v = mob.getDeltaMovement();
        double lift = kind == SiftKind.SINGER ? -v.y * 0.5 : (gap < want ? 0.03 : (gap > want + 1 ? -0.03 : 0.0));
        double bob = Math.sin(mob.tickCount * 0.08) * 0.004;
        double vx = v.x * 0.92, vz = v.z * 0.92;
        LivingEntity target = mob.getTarget();
        if (target != null && kind == SiftKind.OVERSEER) {
            double dx = target.getX() - mob.getX(), dz = target.getZ() - mob.getZ();
            double len = Math.max(1, Math.sqrt(dx * dx + dz * dz));
            if (len > 5) { vx += dx / len * 0.02; vz += dz / len * 0.02; }
            mob.getLookControl().setLookAt(target, 30, 30);
        } else if (kind != SiftKind.SINGER && mob.tickCount % 80 == 0) {
            vx += (mob.getRandom().nextDouble() - 0.5) * 0.12;
            vz += (mob.getRandom().nextDouble() - 0.5) * 0.12;
        }
        mob.setDeltaMovement(vx, v.y * 0.9 + lift + bob, vz);
    }

    static void serverTick(Mob mob, SiftKind kind) {
        if (!(mob.level() instanceof ServerLevel level)) return;
        int t = mob.tickCount;
        switch (kind) {
            case BLUB -> {
                if (mob.onGround() && mob.getDeltaMovement().horizontalDistanceSqr() > 0.0004 && mob.getRandom().nextInt(12) == 0) mob.getJumpControl().jump();
                if (t % 40 == 0) level.sendParticles(ParticleTypes.ITEM_SLIME, mob.getX(), mob.getY() + 0.2, mob.getZ(), 1, 0.2, 0.1, 0.2, 0);
            }
            case DRIFT_JELLY -> { if (t % 6 == 0) level.sendParticles(ParticleTypes.SOUL, mob.getX(), mob.getY() + 0.1, mob.getZ(), 1, 0.2, 0.1, 0.2, 0.002); }
            case SINGER -> {
                if (t % 3 == 0) level.sendParticles(ParticleTypes.END_ROD, mob.getX(), mob.getY() + 1.4, mob.getZ(), 2, 1.2, 1.4, 1.2, 0.01);
                if (t % 50 == 0) command(level, at(mob, "playsound minecraft:block.amethyst_block.resonate neutral @a[distance=..32] ~ ~ ~ 1.2 0.6"));
                if (t % 5 == 0) command(level, at(mob, "particle minecraft:dust{color:[1.0,0.45,0.75],scale:2.0} ~ ~1.6 ~ 1.8 1.8 1.8 0 6 normal"));
            }
            case OVERSEER -> {
                if (t % 4 == 0) level.sendParticles(ParticleTypes.REVERSE_PORTAL, mob.getX(), mob.getY() + 1.8, mob.getZ(), 2, 0.4, 0.4, 0.4, 0.01);
                if (t % 160 == 80 && mob.getTarget() != null) {
                    command(level, at(mob, "effect give @a[distance=..14,gamemode=!creative,gamemode=!spectator] minecraft:darkness 5 0"));
                    command(level, at(mob, "damage @p[distance=..10,gamemode=!creative,gamemode=!spectator] " + (int) kind.damage + " minecraft:magic by " + mob.getUUID()));
                    command(level, at(mob, "playsound minecraft:entity.elder_guardian.curse hostile @a[distance=..24] ~ ~ ~ 0.8 1.6"));
                }
            }
            case TWISTED_WARDEN -> twistedWarden(level, mob, t);
            case SCULKER -> { if (t % 200 == 0) command(level, at(mob, "playsound minecraft:block.sculk_sensor.clicking hostile @a[distance=..16] ~ ~ ~ 0.7 0.8")); }
            case LICKER -> { if (t % 160 == 0) command(level, at(mob, "playsound minecraft:entity.frog.tongue hostile @a[distance=..16] ~ ~ ~ 1 0.7")); }
            case ANTLERLING -> { if (t % 60 == 0) level.sendParticles(ParticleTypes.GLOW, mob.getX(), mob.getY() + 1.9, mob.getZ(), 1, 0.2, 0.1, 0.2, 0); }
            default -> {}
        }
    }

    /** Guardian: sonic chest-maw pulse every 7 s at its target, plus cyan fissure particles. */
    private static void twistedWarden(ServerLevel level, Mob mob, int t) {
        if (t % 3 == 0) level.sendParticles(ParticleTypes.SCULK_SOUL, mob.getX(), mob.getY() + 1.6, mob.getZ(), 1, 0.5, 0.8, 0.5, 0.01);
        LivingEntity target = mob.getTarget();
        if (target == null || t % 140 != 0 || mob.distanceTo(target) > 16) return;
        double sx = mob.getX(), sy = mob.getY() + 1.6, sz = mob.getZ();
        double dx = target.getX() - sx, dy = target.getY() + 1 - sy, dz = target.getZ() - sz;
        for (int i = 1; i <= 12; i++) {
            double k = i / 12.0;
            level.sendParticles(ParticleTypes.SONIC_BOOM, sx + dx * k, sy + dy * k, sz + dz * k, 1, 0, 0, 0, 0);
        }
        command(level, at(mob, "playsound minecraft:entity.warden.sonic_boom hostile @a[distance=..40] ~ ~ ~ 3 0.8"));
        command(level, "damage " + target.getUUID() + " 12 minecraft:sonic_boom by " + mob.getUUID());
    }
}
