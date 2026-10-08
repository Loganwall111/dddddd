package com.beyondthelimits.entity;

import com.beyondthelimits.core.BtlState;
import com.beyondthelimits.core.engine.RiftEngine;
import com.beyondthelimits.registry.BtlDimensions;
import com.beyondthelimits.registry.BtlParticles;
import com.beyondthelimits.registry.BtlSounds;
import net.minecraft.entity.Entity;
import net.minecraft.entity.EntityType;
import net.minecraft.entity.LivingEntity;
import net.minecraft.entity.data.DataTracker;
import net.minecraft.entity.data.TrackedData;
import net.minecraft.entity.data.TrackedDataHandlerRegistry;
import net.minecraft.entity.player.PlayerEntity;
import net.minecraft.nbt.NbtCompound;
import net.minecraft.network.listener.ClientPlayPacketListener;
import net.minecraft.network.packet.Packet;
import net.minecraft.network.packet.s2c.play.EntitySpawnS2CPacket;
import net.minecraft.particle.ParticleTypes;
import net.minecraft.registry.RegistryKey;
import net.minecraft.server.network.ServerPlayerEntity;
import net.minecraft.server.world.ServerWorld;
import net.minecraft.sound.SoundCategory;
import net.minecraft.util.math.Vec3d;
import net.minecraft.world.World;

/**
 * A rift in the fabric of space and time.
 *
 * <p>A rift is <b>not a block</b>. It is an entity whose entire purpose is to be looked at: the
 * client renders it with the custom GLSL core shader {@code beyondthelimits:core/rift}, which
 * composes an animated, warped window into another world with gravitational lensing around its
 * edge. That is why rifts can grow, drift, rotate to face the player, fold light, and pull things
 * through them — none of which is possible with a cube.</p>
 *
 * <p>Behaviourally a rift is a seamless portal: entities that touch the tear are moved to the
 * other side without a loading screen, keeping their velocity, so the world continues around you.
 * There are two modes:</p>
 *
 * <ul>
 *     <li><b>VIEW</b> ({@link #MODE_VIEW}): the tear is still too small to walk through. You can
 *     see the other world through it, and things can come out.</li>
 *     <li><b>SEAMLESS</b> ({@link #MODE_SEAMLESS}): the warehouse gates and the grown rifts. You
 *     can step through in either direction.</li>
 * </ul>
 */
public class RiftEntity extends Entity {
	public static final int MODE_VIEW = 0;
	public static final int MODE_SEAMLESS = 1;

	/** Rift families: what is on the other side. See {@code RiftEngine.VARIANTS}. */
	public static final int VARIANT_OVERWORLD_SHARD = 0;
	public static final int VARIANT_BACKROOMS = 1;
	public static final int VARIANT_FOGLANDS = 2;
	public static final int VARIANT_CODESCAPE = 3;
	public static final int VARIANT_MIRROR = 4;
	public static final int VARIANT_COLLISION = 5;
	public static final int VARIANT_COUNT = 6;

	private static final TrackedData<Integer> VARIANT = DataTracker.registerData(RiftEntity.class,
			TrackedDataHandlerRegistry.INTEGER);
	private static final TrackedData<Integer> MODE = DataTracker.registerData(RiftEntity.class,
			TrackedDataHandlerRegistry.INTEGER);
	private static final TrackedData<Float> RADIUS = DataTracker.registerData(RiftEntity.class,
			TrackedDataHandlerRegistry.FLOAT);
	private static final TrackedData<Integer> AGE = DataTracker.registerData(RiftEntity.class,
			TrackedDataHandlerRegistry.INTEGER);
	private static final TrackedData<Boolean> INVADING = DataTracker.registerData(RiftEntity.class,
			TrackedDataHandlerRegistry.BOOLEAN);
	private static final TrackedData<Boolean> PERMANENT = DataTracker.registerData(RiftEntity.class,
			TrackedDataHandlerRegistry.BOOLEAN);

	public RiftEntity(EntityType<? extends RiftEntity> type, World world) {
		super(type, world);
		this.noClip = true;
		this.setNoGravity(true);
		this.ignoreCameraFrustum = true;
	}

	@Override
	protected void initDataTracker(DataTracker.Builder builder) {
		builder.add(VARIANT, VARIANT_OVERWORLD_SHARD);
		builder.add(MODE, MODE_VIEW);
		builder.add(RADIUS, (float) com.beyondthelimits.core.BtlConfig.RIFT_BASE_RADIUS);
		builder.add(AGE, 0);
		builder.add(INVADING, false);
		builder.add(PERMANENT, false);
	}

	@Override
	public void tick() {
		super.tick();

		int age = getAge() + 1;
		dataTracker.set(AGE, age);

		if (getWorld().isClient()) {
			clientTick(age);
			return;
		}

		serverTick(age);
	}

	// ---------------------------------------------------------------------------------------------
	// Server side
	// ---------------------------------------------------------------------------------------------

	private void serverTick(int age) {
		ServerWorld world = (ServerWorld) getWorld();
		BtlState state = BtlState.get();

		// Growth: a tear grows for as long as it is left alone, then becomes walkable.
		float radius = getRadius();

		if (radius < (float) com.beyondthelimits.core.BtlConfig.RIFT_MAX_RADIUS && age % 400 == 0) {
			radius = Math.min((float) com.beyondthelimits.core.BtlConfig.RIFT_MAX_RADIUS, radius + 0.12F);
			dataTracker.set(RADIUS, radius);
		}

		if (getMode() == MODE_VIEW && radius >= 3.0F) {
			dataTracker.set(MODE, MODE_SEAMLESS);
			world.playSound(null, getBlockPos(), BtlSounds.REALITY_TEAR, SoundCategory.AMBIENT, 1.4F, 0.7F);
		}

		// Ambient life.
		if (age % 160 == 0) {
			world.playSound(null, getBlockPos(), BtlSounds.RIFT_AMBIENT, SoundCategory.AMBIENT, 0.7F,
					0.5F + getRandom().nextFloat() * 0.4F);
		}

		if (age % 10 == 0) {
			RiftEngine.emitAmbientParticles(world, this);
		}

		// Things can come through. Invasions are what makes a rift dangerous rather than decorative.
		if (age % 200 == 0 && getRandom().nextInt(Math.max(3, 14 - state.reality() / 10)) == 0) {
			RiftEngine.spawnTrespasser(world, this);
		}

		// The seamless part: anything that walks into the tear is pulled through it.
		if (getMode() == MODE_SEAMLESS && age % 2 == 0) {
			RiftEngine.tryPullThrough(world, this);
		}

		// Rifts close on their own after roughly two in-game days unless they are anchored.
		if (!isPermanent() && age > 48000 && getRandom().nextInt(200) == 0) {
			world.playSound(null, getBlockPos(), BtlSounds.RIFT_AMBIENT, SoundCategory.AMBIENT, 0.8F, 0.4F);
			discard();
			RiftEngine.onRiftClosed(world, getBlockPos(), getVariant());
		}
	}

	// ---------------------------------------------------------------------------------------------
	// Client side: the cosmetic life of a tear
	// ---------------------------------------------------------------------------------------------

	private void clientTick(int age) {
		float radius = getRadius();
		Vec3d centre = getPos();

		for (int i = 0; i < 3; i++) {
			double angle = getRandom().nextDouble() * Math.PI * 2.0D;
			double r = radius * (0.7D + getRandom().nextDouble() * 0.6D);
			getWorld().addParticle(BtlParticles.RIFT_SPARK,
					centre.x + Math.cos(angle) * r * 0.3D,
					centre.y + (getRandom().nextDouble() - 0.5D) * radius * 1.6D,
					centre.z + Math.sin(angle) * r * 0.3D,
					0.0D, 0.0D, 0.0D);
		}

		if (getRandom().nextInt(6) == 0) {
			getWorld().addParticle(ParticleTypes.REVERSE_PORTAL,
					centre.x + (getRandom().nextDouble() - 0.5D) * radius,
					centre.y + (getRandom().nextDouble() - 0.5D) * radius * 2.0D,
					centre.z + (getRandom().nextDouble() - 0.5D) * radius,
					0.0D, 0.0D, 0.0D);
		}
	}

	// ---------------------------------------------------------------------------------------------
	// Data
	// ---------------------------------------------------------------------------------------------

	public int getVariant() {
		return dataTracker.get(VARIANT);
	}

	public void setVariant(int variant) {
		dataTracker.set(VARIANT, Math.max(0, Math.min(VARIANT_COUNT - 1, variant)));
	}

	public int getMode() {
		return dataTracker.get(MODE);
	}

	public void setMode(int mode) {
		dataTracker.set(MODE, mode);
	}

	public float getRadius() {
		return dataTracker.get(RADIUS);
	}

	public void setRadius(float radius) {
		dataTracker.set(RADIUS, radius);
	}

	public int getAge() {
		return dataTracker.get(AGE);
	}

	public boolean isInvading() {
		return dataTracker.get(INVADING);
	}

	public void setInvading(boolean invading) {
		dataTracker.set(INVADING, invading);
	}

	public boolean isPermanent() {
		return dataTracker.get(PERMANENT);
	}

	public void setPermanent(boolean permanent) {
		dataTracker.set(PERMANENT, permanent);
	}

	/** Where this rift leads. The client uses it to pick the shader palette. */
	public RegistryKey<World> destinationDimension() {
		return switch (getVariant()) {
			case VARIANT_BACKROOMS -> BtlDimensions.BACKROOMS;
			case VARIANT_FOGLANDS -> BtlDimensions.FOGLANDS;
			case VARIANT_CODESCAPE -> BtlDimensions.CODESCAPE;
			case VARIANT_MIRROR -> BtlDimensions.MIRRORWORLD;
			case VARIANT_COLLISION -> World.NETHER;
			default -> BtlDimensions.WRONGWORLD;
		};
	}

	@Override
	protected void readCustomDataFromNbt(NbtCompound nbt) {
		setVariant(nbt.getInt("variant"));
		setMode(nbt.getInt("mode"));
		setRadius(nbt.contains("radius") ? nbt.getFloat("radius") : (float) com.beyondthelimits.core.BtlConfig.RIFT_BASE_RADIUS);
		dataTracker.set(AGE, nbt.getInt("age"));
		setInvading(nbt.getBoolean("invading"));
		setPermanent(nbt.getBoolean("permanent"));
	}

	@Override
	protected void writeCustomDataToNbt(NbtCompound nbt) {
		nbt.putInt("variant", getVariant());
		nbt.putInt("mode", getMode());
		nbt.putFloat("radius", getRadius());
		nbt.putInt("age", getAge());
		nbt.putBoolean("invading", isInvading());
		nbt.putBoolean("permanent", isPermanent());
	}

	@Override
	public boolean isCollidable() {
		return false;
	}

	@Override
	public boolean isPushable() {
		return false;
	}

	@Override
	public boolean canHit() {
		return false;
	}

	@Override
	public boolean damage(net.minecraft.entity.damage.DamageSource source, float amount) {
		// A rift cannot be punched, but a rift tool can stabilise it.
		if (source.getAttacker() instanceof PlayerEntity player
				&& player.getMainHandStack().isOf(com.beyondthelimits.registry.BtlItems.RIFT_STABILIZER)) {
			return false;
		}

		return super.damage(source, amount);
	}

	@Override
	public Packet<ClientPlayPacketListener> createSpawnPacket(net.minecraft.server.network.EntityTrackerEntry entry) {
		return new EntitySpawnS2CPacket(this, 0, this.getBlockPos());
	}

	@Override
	public void onPlayerCollision(PlayerEntity player) {
		super.onPlayerCollision(player);

		if (!getWorld().isClient() && getMode() == MODE_SEAMLESS && player instanceof ServerPlayerEntity serverPlayer) {
			RiftEngine.onPlayerEntered(serverPlayer, this);
		}
	}

	/** Used by the fog dimension: the tear reveals itself only when you are close. */
	public boolean isVisibleFrom(LivingEntity viewer) {
		double distance = squaredDistanceTo(viewer.getPos());
		return distance < 64.0D * 64.0D;
	}

}
