package dev.logan.beyondthreshold.entity;

import dev.logan.beyondthreshold.BTTEntities;
import dev.logan.beyondthreshold.BTTNet;
import dev.logan.beyondthreshold.BTTScheduler;
import dev.logan.beyondthreshold.config.BTTConfig;
import dev.logan.beyondthreshold.world.BTTTravel;
import net.minecraft.entity.Entity;
import net.minecraft.entity.EntityType;
import net.minecraft.entity.data.DataTracker;
import net.minecraft.entity.data.TrackedData;
import net.minecraft.entity.data.TrackedDataHandlerRegistry;
import net.minecraft.nbt.NbtCompound;
import net.minecraft.particle.ParticleTypes;
import net.minecraft.entity.player.PlayerEntity;
import net.minecraft.server.network.ServerPlayerEntity;
import net.minecraft.sound.SoundCategory;
import net.minecraft.sound.SoundEvents;
import net.minecraft.util.math.Vec3d;
import net.minecraft.world.World;

/**
 * A singularity anchored in the world. Pulls, swirls and spaghettifies
 * (ragdoll: chaotic velocity + uncontrolled spin), then collapses in a
 * nuke-style multi-stage detonation. Victims that fall past the horizon
 * are flung through the singularity into a random threshold dimension.
 */
public class BlackHoleEntity extends Entity {
	private static final TrackedData<Float> RADIUS = DataTracker.registerData(BlackHoleEntity.class, TrackedDataHandlerRegistry.FLOAT);
	private static final TrackedData<Integer> PHASE = DataTracker.registerData(BlackHoleEntity.class, TrackedDataHandlerRegistry.INTEGER);

	private int age = 0;
	private int collapseTimer = -1;

	public BlackHoleEntity(EntityType<?> type, World world) {
		super(type, world);
	}

	public BlackHoleEntity(World world, double x, double y, double z, float radius) {
		this(BTTEntities.BLACK_HOLE, world);
		setPos(x, y, z);
		getDataTracker().set(RADIUS, radius);
	}

	@Override
	protected void initDataTracker() {
		dataTracker.set(RADIUS, 5.0F);
		dataTracker.set(PHASE, 0);
	}

	public float getRadius() {
		return dataTracker.get(RADIUS);
	}

	public boolean isCollapsing() {
		return dataTracker.get(PHASE) != 0;
	}

	public void triggerCollapse() {
		if (collapseTimer < 0) {
			collapseTimer = 40;
			dataTracker.set(PHASE, 1);
			getWorld().playSound(null, getBlockPos(), SoundEvents.ENTITY_WITHER_DEATH, SoundCategory.HOSTILE, 4.0F, 0.4F);
		}
	}

	@Override
	protected void readCustomDataFromNbt(NbtCompound nbt) {
		dataTracker.set(RADIUS, nbt.getFloat("Radius"));
	}

	@Override
	protected void writeCustomDataToNbt(NbtCompound nbt) {
		nbt.putFloat("Radius", getRadius());
	}

	@Override
	public void tick() {
		super.tick();
		age++;

		if (getWorld().isClient) {
			return;
		}

		double r = getRadius();
		Vec3d c = getPos();

		// accretion swirl particles
		if (age % 3 == 0) {
			double a = random.nextDouble() * Math.PI * 2;
			double rr = r * (1.2 + random.nextDouble() * 2.0);
			getWorld().spawnParticles(ParticleTypes.REVERSE_PORTAL,
					c.x + Math.cos(a) * rr, c.y + random.nextDouble() * 2 - 1, c.z + Math.sin(a) * rr,
					6, 0.4, 0.4, 0.4, 0.02);
		}

		for (PlayerEntity bttPe : getWorld().getPlayers()) { if (!(bttPe instanceof ServerPlayerEntity p)) continue;
			double d = p.getPos().distanceTo(c);
			double range = r * 6.0;
			if (d > range) {
				continue;
			}
			Vec3d to = c.subtract(p.getPos());
			if (to.lengthSquared() < 1e-6) {
				continue;
			}
			Vec3d dir = to.normalize();
			double pull = (30.0 * BTTConfig.get().gravityScale) / (d * d * 0.15 + 6.0);
			Vec3d tangent = new Vec3d(-dir.getZ(), 0.0, dir.getX());

			Vec3d v = p.getVelocity()
					.add(dir.multiply(pull * 0.06))
					.add(tangent.multiply(pull * 0.05))
					.subtract(0.0, pull * 0.012, 0.0);

			if (d < r * 1.4) {
				// ---- GRIP: ragdoll physics ----
				double chaos = BTTConfig.get().ragdollChaos;
				v = v.add(new Vec3d(random.nextGaussian(), random.nextGaussian() * 0.6, random.nextGaussian())
						.multiply(0.12 * chaos));
				p.setYaw(p.getYaw() + (float) (6.0 * chaos));
				p.setPitch(clampF(p.getPitch() + (float) (random.nextGaussian() * 4.0 * chaos), -90.0F, 90.0F));
				p.fallDistance = 0.0F;
				// spaghettification: stretch the victim towards the horizon
				float s = (float) Math.max(0.25, d / (r * 1.4));
				p.setScale(s);
				if (age % 20 == 0) {
					p.damage(p.getDamageSources().magic(), 2.0F);
				}
				BTTNet.sendShake(p, (float) Math.min(1.5, r / (d + 1.0)));
				if (d < 1.6) {
					if (BTTConfig.get().blackHoleTravel) {
						BTTTravel.singularity(p);
					} else {
						p.damage(p.getDamageSources().magic(), 8.0F);
						p.setVelocity(dir.multiply(-2.0).add(0.0, 1.4, 0.0));
					}
				}
			} else {
				p.setScale(1.0F);
			}
			p.setVelocity(v);
			p.velocityDirty = true;
		}

		if (collapseTimer > 0) {
			if (--collapseTimer == 0) {
				collapseNow();
			}
		} else if (age > BTTConfig.get().blackHoleLifetimeSec * 20) {
			triggerCollapse();
		}
	}

	/** Nuke physics: flash, fireball, shockwave ring, crater. */
	private void collapseNow() {
		Vec3d c = getPos();
		float power = BTTConfig.get().collapsePower;
		for (PlayerEntity bttPe : getWorld().getPlayers()) { if (!(bttPe instanceof ServerPlayerEntity p)) continue;
			if (p.getPos().distanceTo(c) < 160) {
				BTTNet.sendFlash(p, 1.0F);
				BTTNet.sendShake(p, 1.5F);
			}
		}
		getWorld().playSound(null, getBlockPos(), SoundEvents.ENTITY_GENERIC_EXPLODE, SoundCategory.BLOCKS, 10.0F, 0.3F);
		getWorld().createExplosion(this, c.x, c.y, c.z, power, true, World.ExplosionSourceType.MOB);
		// shockwave ring of delayed secondary detonations
		for (int i = 0; i < 8; i++) {
			final double a = i / 8.0 * Math.PI * 2;
			final double rr = power * 1.6;
			BTTScheduler.in(4 + i * 2, () -> {
				getWorld().createExplosion(this, c.x + Math.cos(a) * rr, c.y, c.z + Math.sin(a) * rr,
						power * 0.35F, false, World.ExplosionSourceType.TNT);
			});
		}
		getWorld().spawnParticles(ParticleTypes.FLASH, c.x, c.y, c.z, 1, 0, 0, 0, 0);
		getWorld().spawnParticles(ParticleTypes.EXPLOSION, c.x, c.y, c.z, 24, 4, 4, 4, 0.2);
		discard();
	}

	private static float clampF(float v, float min, float max) {
		return Math.max(min, Math.min(max, v));
	}
}
