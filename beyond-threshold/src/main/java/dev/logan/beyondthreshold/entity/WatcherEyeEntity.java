package dev.logan.beyondthreshold.entity;

import dev.logan.beyondthreshold.BTTEntities;
import dev.logan.beyondthreshold.BTTNet;
import dev.logan.beyondthreshold.BeyondTheThreshold;
import net.minecraft.entity.Entity;
import net.minecraft.entity.EntityType;
import net.minecraft.entity.data.DataTracker;
import net.minecraft.entity.data.TrackedData;
import net.minecraft.entity.data.TrackedDataHandlerFactory;
import net.minecraft.nbt.NbtCompound;
import net.minecraft.particle.ParticleTypes;
import net.minecraft.server.network.ServerPlayerEntity;
import net.minecraft.sound.SoundCategory;
import net.minecraft.sound.SoundEvents;
import net.minecraft.util.math.Vec3d;
import net.minecraft.world.World;

/**
 * The nameless cosmos-entity. A gigantic human eye opens above the
 * clouds, descends, grabs the traveller and pulls them up while reality
 * pixelates into code. When the sequence ends the threshold sky wakes up
 * and the overworld reveals itself as the body of the colossus.
 */
public class WatcherEyeEntity extends Entity {
	private static final TrackedData<Integer> STAGE = DataTracker.registerData(WatcherEyeEntity.class, TrackedDataHandlerFactory.INTEGER);

	private int grabTicks = 0;

	public WatcherEyeEntity(EntityType<?> type, World world) {
		super(type, world);
	}

	public WatcherEyeEntity(World world, double x, double y, double z) {
		this(BTTEntities.WATCHER_EYE, world);
		setPos(x, y, z);
	}

	@Override
	protected void initDataTracker() {
		dataTracker.set(STAGE, 0);
	}

	public int getStage() {
		return dataTracker.get(STAGE);
	}

	@Override
	protected void readCustomDataFromNbt(NbtCompound nbt) {
		dataTracker.set(STAGE, nbt.getInt("Stage"));
	}

	@Override
	protected void writeCustomDataToNbt(NbtCompound nbt) {
		nbt.putInt("Stage", getStage());
	}

	@Override
	public void tick() {
		super.tick();

		if (world.isClient) {
			return;
		}

		ServerPlayerEntity target = null;
		double best = 90.0;
		for (ServerPlayerEntity p : world.getPlayers()) {
			double d = p.getPos().distanceTo(getPos());
			if (d < best) {
				best = d;
				target = p;
			}
		}
		if (target == null) {
			if (age > 2400) {
				discard();
			}
			return;
		}

		int stage = getStage();
		if (stage == 0) {
			// loom over the player, then descend
			double wantY = target.getY() + 16.0;
			Vec3d pos = getPos();
			double dy = Math.max(wantY - pos.y, -0.18);
			Vec3d to = new Vec3d(target.getX() - pos.x, 0, target.getZ() - pos.z);
			Vec3d move = to.length() > 1.0 ? to.normalize().multiply(0.35) : Vec3d.ZERO;
			setPos(pos.x + move.x, pos.y + dy, pos.z + move.z);
			if (age % 40 == 0) {
				world.playSound(null, getBlockPos(), SoundEvents.ENTITY_WARDEN_AMBIENT, SoundCategory.HOSTILE, 3.0F, 0.4F);
			}
			if (best < 20.0) {
				dataTracker.set(STAGE, 1);
				BTTNet.sendEyeSequence(target, 1);
				world.playSound(null, getBlockPos(), SoundEvents.ENTITY_WARDEN_ROAR, SoundCategory.HOSTILE, 3.0F, 0.6F);
			}
		} else if (stage == 1) {
			// grab: pull the player up into the light
			grabTicks++;
			Vec3d to = getPos().subtract(target.getPos());
			Vec3d v = target.getVelocity().add(to.normalize().multiply(0.22)).add(0.0, 0.14, 0.0);
			if (v.length() > 1.2) {
				v = v.normalize().multiply(1.2);
			}
			target.setVelocity(v);
			target.velocityDirty = true;
			target.fallDistance = 0.0F;
			world.spawnParticles(ParticleTypes.REVERSE_PORTAL, target.getX(), target.getY() + 1, target.getZ(), 40, 1.2, 2.0, 1.2, 0.1);
			if (grabTicks > 140) {
				// reality reassembles: the threshold is open now
				target.getScoreboardTags().add(BeyondTheThreshold.TAG_THRESHOLD);
				BTTNet.sendThreshold(target, true);
				BTTNet.sendEyeSequence(target, 2);
				world.playSound(null, target.getBlockPos(), SoundEvents.ENTITY_GENERIC_EXPLODE, SoundCategory.MASTER, 4.0F, 0.7F);
				world.spawnParticles(ParticleTypes.PORTAL, target.getX(), target.getY() + 1, target.getZ(), 200, 2, 2, 2, 0.4);
				discard();
			}
		}
	}
}
