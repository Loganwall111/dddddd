package com.beyondthelimits.entity;

import com.beyondthelimits.core.BtlConfig;
import com.beyondthelimits.core.BtlState;
import com.beyondthelimits.registry.BtlSounds;
import net.minecraft.entity.EntityType;
import net.minecraft.entity.ai.goal.LookAtEntityGoal;
import net.minecraft.entity.ai.goal.SwimGoal;
import net.minecraft.entity.ai.goal.WanderAroundFarGoal;
import net.minecraft.entity.attribute.EntityAttributes;
import net.minecraft.entity.mob.PathAwareEntity;
import net.minecraft.entity.player.PlayerEntity;
import net.minecraft.server.network.ServerPlayerEntity;
import net.minecraft.sound.SoundCategory;
import net.minecraft.util.math.Vec3d;
import net.minecraft.world.World;

/**
 * The Observer.
 *
 * <p>It is always far away. You can only barely see it. Whenever you look directly at it, it is
 * gone. It follows you for weeks, it appears behind trees, at the end of tunnels, inside caves, in
 * distant fog, reflected in water, and eventually inside your base — and there is no code anywhere
 * in this mod that says it should attack you, because it never does.</p>
 *
 * <p>Implementation detail that makes it work: the entity deletes itself the instant any player's
 * view vector is within a few degrees of it (see {@link #isObservedBy(PlayerEntity)}), while its
 * presence is persisted per player in {@link BtlState#observerLevels()}. So it is not "spawning
 * occasionally" — it is a single continuous stalker that simply refuses to be looked at, which is
 * exactly what players report as the creepiest thing in the mod.</p>
 */
public class ObserverEntity extends PathAwareEntity {
	private PlayerEntity target;
	private int stareTicks;
	private int relocateTicks = 200;

	public ObserverEntity(EntityType<? extends PathAwareEntity> type, World world) {
		super(type, world);
		this.setNoGravity(false);
	}

	@Override
	protected void initGoals() {
		this.goalSelector.add(0, new SwimGoal(this));
		this.goalSelector.add(1, new WanderAroundFarGoal(this, 0.4D, 0.001F));
		this.goalSelector.add(2, new LookAtEntityGoal(this, PlayerEntity.class, 64.0F));
	}

	@Override
	public void tick() {
		super.tick();

		if (getWorld().isClient()) {
			return;
		}

		PlayerEntity closest = getWorld().getClosestPlayer(this, 96.0D);

		if (closest == null) {
			if (getRandom().nextInt(400) == 0) {
				discard();
			}

			return;
		}

		target = closest;
		double distance = squaredDistanceTo(closest.getPos());

		// Looked at? Gone. Not teleported - gone, and it comes back out of sight.
		if (isObservedBy(closest)) {
			stareTicks++;

			if (stareTicks > 3) {
				playDisappear(closest);

				if (closest instanceof ServerPlayerEntity serverPlayer) {
					com.beyondthelimits.core.engine.ObserverEngine.onObserved(serverPlayer, this);
				}

				ObserverSpawnHelper.relocate(this, closest, false);
				stareTicks = 0;
			}
		} else {
			stareTicks = 0;
		}

		// Follow: it always closes the distance while unobserved, and never while observed.
		if (distance > (double) (BtlConfig.OBSERVER_MAX_DISTANCE * BtlConfig.OBSERVER_MAX_DISTANCE)) {
			relocateTicks--;
		} else if (distance > 900.0D && getRandom().nextInt(80) == 0) {
			Vec3d step = closest.getPos().subtract(getPos()).normalize().multiply(1.2D);
			setPosition(getX() + step.x, getY() + step.y, getZ() + step.z);
		}

		if (relocateTicks <= 0) {
			relocateTicks = 200 + getRandom().nextInt(400);
			ObserverSpawnHelper.relocate(this, closest, true);
		}
	}

	/** True if the given player's crosshair is within a few degrees of the entity's centre. */
	public boolean isObservedBy(PlayerEntity player) {
		Vec3d toObserver = this.getEyePos().subtract(player.getEyePos());
		double distance = toObserver.length();

		if (distance > 96.0D || distance < 0.001D) {
			return false;
		}

		Vec3d look = player.getRotationVec(1.0F).normalize();
		double dot = look.dotProduct(toObserver.normalize());

		// Roughly 8 degrees of cone, and the check is intentionally sloppy at long range so that
		// players who "think" they saw it also lose it.
		double threshold = distance > 40.0D ? 0.985D : 0.995D;
		return dot > threshold && player.canSee(this);
	}

	private void playDisappear(PlayerEntity player) {
		getWorld().playSound(null, player.getBlockPos(), BtlSounds.OBSERVER_WHISPER, SoundCategory.AMBIENT, 0.9F,
				0.4F + getRandom().nextFloat() * 0.3F);

		if (player instanceof ServerPlayerEntity serverPlayer) {
			com.beyondthelimits.network.BtlNetworking.sendScreenEffect(serverPlayer,
					com.beyondthelimits.network.BtlNetworking.EFFECT_OBSERVER, 0.6F, 20);
		}
	}

	@Override
	protected boolean isDisallowedInPeaceful() {
		return false;
	}

	@Override
	public boolean canImmediatelyDespawn(double distanceSquared) {
		return false;
	}

	/** Observable state for the renderer: how "solid" the silhouette currently is. */
	public float presence() {
		return target == null ? 0.35F : (float) Math.min(1.0D, 40.0D / Math.max(1.0D, Math.sqrt(squaredDistanceTo(target.getPos()))));
	}

	/** Small helper kept in its own class so the entity stays readable. */
	static final class ObserverSpawnHelper {
		private ObserverSpawnHelper() {
		}

		static void relocate(ObserverEntity observer, PlayerEntity player, boolean preferBehind) {
			World world = observer.getWorld();
			var random = observer.getRandom();

			for (int attempt = 0; attempt < 24; attempt++) {
				double angle = random.nextDouble() * Math.PI * 2.0D;
				double distance = BtlConfig.OBSERVER_MIN_DISTANCE
						+ random.nextDouble() * (BtlConfig.OBSERVER_MAX_DISTANCE - BtlConfig.OBSERVER_MIN_DISTANCE);

				double x = player.getX() + Math.cos(angle) * distance;
				double z = player.getZ() + Math.sin(angle) * distance;
				double y = player.getY() + (random.nextDouble() - 0.5D) * 12.0D;
				var candidate = net.minecraft.util.math.BlockPos.ofFloored(x, y, z);

				// It prefers places that are dark, cluttered and out of the way.
				if (!world.isAir(candidate) || !world.isAir(candidate.up())) {
					continue;
				}

				if (preferBehind) {
					Vec3d behind = player.getRotationVec(1.0F).normalize().multiply(-1.0D);
					Vec3d offset = new Vec3d(x - player.getX(), 0.0D, z - player.getZ()).normalize();

					if (offset.dotProduct(behind) < 0.1D) {
						continue;
					}
				}

				observer.setPosition(x, y, z);
				return;
			}

			observer.setPosition(player.getX(), player.getY() + 24.0D, player.getZ());
		}
	}
}
