package dev.beyondlimits.entity;

import dev.beyondlimits.ModItems;
import net.minecraft.entity.EntityType;
import net.minecraft.entity.attribute.DefaultAttributeContainer;
import net.minecraft.entity.attribute.EntityAttributes;
import net.minecraft.entity.ai.goal.LookAtEntityGoal;
import net.minecraft.entity.ai.goal.SwimGoal;
import net.minecraft.entity.mob.MobEntity;
import net.minecraft.entity.mob.PathAwareEntity;
import net.minecraft.entity.player.PlayerEntity;
import net.minecraft.entity.ItemEntity;
import net.minecraft.item.ItemStack;
import net.minecraft.server.world.ServerWorld;
import net.minecraft.sound.SoundCategory;
import net.minecraft.sound.SoundEvents;
import net.minecraft.util.ActionResult;
import net.minecraft.util.Hand;
import net.minecraft.util.math.BlockPos;
import net.minecraft.util.math.MathHelper;
import net.minecraft.util.math.Vec3d;
import net.minecraft.world.Heightmap;
import net.minecraft.world.World;

/** Shared, server-authoritative behavior for the three first-chapter witnesses. */
public final class ObserverEntity extends PathAwareEntity {
    private int gazeCheck;

    public ObserverEntity(EntityType<? extends ObserverEntity> entityType, World world) {
        super(entityType, world);
        setNoGravity(true);
    }

    public static DefaultAttributeContainer.Builder createAttributes() {
        return MobEntity.createMobAttributes()
                .add(EntityAttributes.GENERIC_MAX_HEALTH, 16.0)
                .add(EntityAttributes.GENERIC_MOVEMENT_SPEED, 0.0)
                .add(EntityAttributes.GENERIC_FOLLOW_RANGE, 96.0);
    }

    @Override
    protected void initGoals() {
        goalSelector.add(0, new SwimGoal(this));
        goalSelector.add(1, new LookAtEntityGoal(this, PlayerEntity.class, 40.0F));
    }

    @Override
    public void tick() {
        super.tick();
        setNoGravity(true);
        float bob = MathHelper.sin((age + getId()) * 0.035F);

        if (getType() == ModEntities.FRAYLING) {
            driftNearPlayers(bob);
            return;
        }

        setVelocity(0.0, bob * 0.004, 0.0);
        if (getWorld().isClient || !(getWorld() instanceof ServerWorld serverWorld)) return;
        if (++gazeCheck < 5) return;
        gazeCheck = 0;

        PlayerEntity watcher = serverWorld.getClosestPlayer(this, 80.0);
        if (watcher != null && isWatchedBy(watcher)) {
            float vanishChance = getType() == ModEntities.MIRROR_ECHO ? 0.28F : 0.58F;
            if (getRandom().nextFloat() < vanishChance) {
                serverWorld.spawnParticles(net.minecraft.particle.ParticleTypes.PORTAL,
                        getX(), getY() + getHeight() * 0.5, getZ(), 28, 0.45, 0.8, 0.45, 0.12);
                discard();
            } else {
                slipAway(serverWorld, watcher);
            }
        }
    }

    private void driftNearPlayers(float bob) {
        setVelocity(0.0, bob * 0.009, 0.0);
        if (getWorld().isClient || !(getWorld() instanceof ServerWorld serverWorld) || ++gazeCheck % 12 != 0) return;
        PlayerEntity nearby = serverWorld.getClosestPlayer(this, 20.0);
        if (nearby == null) return;
        Vec3d toward = nearby.getPos().subtract(getPos());
        if (toward.lengthSquared() > 25.0) {
            Vec3d glide = toward.normalize().multiply(0.018);
            setVelocity(glide.x, bob * 0.009, glide.z);
        }
    }

    private boolean isWatchedBy(PlayerEntity player) {
        double distanceSquared = squaredDistanceTo(player);
        if (distanceSquared < 0.01 || distanceSquared > 80.0 * 80.0) return false;
        Vec3d direction = getEyePos().subtract(player.getEyePos()).normalize();
        double gaze = player.getRotationVec(1.0F).normalize().dotProduct(direction);
        return gaze > 0.985 && player.canSee(this);
    }

    private void slipAway(ServerWorld world, PlayerEntity watcher) {
        double angle = getRandom().nextDouble() * Math.PI * 2.0;
        int distance = getType() == ModEntities.MIRROR_ECHO ? 14 + getRandom().nextInt(12) : 26 + getRandom().nextInt(18);
        int x = MathHelper.floor(watcher.getX() + Math.cos(angle) * distance);
        int z = MathHelper.floor(watcher.getZ() + Math.sin(angle) * distance);
        BlockPos surface = world.getTopPosition(Heightmap.Type.MOTION_BLOCKING_NO_LEAVES, new BlockPos(x, 0, z));
        requestTeleport(x + 0.5, surface.getY() + 2.0, z + 0.5);
        setVelocity(Vec3d.ZERO);
    }

    @Override
    public ActionResult interactMob(PlayerEntity player, Hand hand) {
        if (getType() != ModEntities.FRAYLING) {
            return super.interactMob(player, hand);
        }
        if (getWorld().isClient) {
            return ActionResult.success(true);
        }

        ItemEntity offering = new ItemEntity(getWorld(), getX(), getY() + 0.25, getZ(), new ItemStack(ModItems.RIFT_SHARD));
        getWorld().spawnEntity(offering);
        getWorld().playSound(null, getBlockPos(), SoundEvents.BLOCK_AMETHYST_BLOCK_CHIME,
                SoundCategory.NEUTRAL, 0.7F, 1.7F);
        discard();
        return ActionResult.CONSUME;
    }

    @Override
    public boolean damage(net.minecraft.entity.damage.DamageSource source, float amount) {
        // The Observer and Echo are witnesses, not conventional combat encounters.
        return getType() == ModEntities.FRAYLING && super.damage(source, amount);
    }
}
