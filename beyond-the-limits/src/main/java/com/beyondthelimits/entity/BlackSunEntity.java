package com.beyondthelimits.entity;

import com.beyondthelimits.core.BtlConfig;
import com.beyondthelimits.core.BtlState;
import com.beyondthelimits.registry.BtlParticles;
import com.beyondthelimits.registry.BtlSounds;
import net.minecraft.entity.Entity;
import net.minecraft.entity.EntityType;
import net.minecraft.entity.data.DataTracker;
import net.minecraft.entity.data.TrackedData;
import net.minecraft.entity.data.TrackedDataHandlerRegistry;
import net.minecraft.entity.effect.StatusEffectInstance;
import net.minecraft.entity.effect.StatusEffects;
import net.minecraft.entity.player.PlayerEntity;
import net.minecraft.nbt.NbtCompound;
import net.minecraft.network.listener.ClientPlayPacketListener;
import net.minecraft.network.packet.Packet;
import net.minecraft.network.packet.s2c.play.EntitySpawnS2CPacket;
import net.minecraft.server.world.ServerWorld;
import net.minecraft.sound.SoundCategory;
import net.minecraft.world.World;

/**
 * The Black Sun.
 *
 * <p>One day the sun is simply replaced by a perfectly black sphere. It is not an eclipse: the sun
 * is gone and something else is in its place. Every day after that the world gets darker, mobs
 * behave differently, plants stop growing, villages empty out — and the sphere gets closer.</p>
 *
 * <p>Eventually the player works out the trick: it is not in the sky. It is an entity, it has been
 * falling toward them the whole time, and when it arrives it does not burn the world, it
 * <em>unwrites</em> a piece of it.</p>
 */
public class BlackSunEntity extends Entity {
	private static final TrackedData<Float> STAGE = DataTracker.registerData(BlackSunEntity.class,
			TrackedDataHandlerRegistry.FLOAT);
	private static final TrackedData<Float> SCALE = DataTracker.registerData(BlackSunEntity.class,
			TrackedDataHandlerRegistry.FLOAT);

	public BlackSunEntity(EntityType<? extends BlackSunEntity> type, World world) {
		super(type, world);
		this.noClip = true;
		this.setNoGravity(true);
		this.ignoreCameraFrustum = true;
	}

	@Override
	protected void initDataTracker(DataTracker.Builder builder) {
		builder.add(STAGE, 0.0F);
		builder.add(SCALE, 1.0F);
	}

	@Override
	public void tick() {
		super.tick();

		if (getWorld().isClient()) {
			return;
		}

		ServerWorld world = (ServerWorld) getWorld();
		BtlState state = BtlState.get();
		int stage = state.blackSunStage();

		dataTracker.set(STAGE, (float) stage);
		dataTracker.set(SCALE, 1.0F + stage * 0.35F);

		PlayerEntity anchor = world.getClosestPlayer(this, 512.0D);

		if (anchor != null) {
			// It descends toward whoever looks at it the most. It is always coming down.
			double dx = anchor.getX() - getX();
			double dz = anchor.getZ() - getZ();
			double dy = (anchor.getY() + 140.0D - stage * 12.0D) - getY();
			double length = Math.sqrt(dx * dx + dy * dy + dz * dz);

			if (length > 1.0D) {
				double speed = BtlConfig.BLACK_SUN_APPROACH_PER_STAGE * (1.0D + stage * 0.4D);
				setPosition(getX() + dx / length * speed, getY() + dy / length * speed * 0.5D, getZ() + dz / length * speed);
			}

			if (getRandom().nextInt(200) == 0) {
				world.playSound(null, anchor.getBlockPos(), BtlSounds.BLACK_SUN_ARRIVAL, SoundCategory.AMBIENT,
						1.2F, 0.3F + stage * 0.05F);
			}

			// The world's reaction to an entity standing in for the sun.
			int darkness = Math.min(3, stage / 3);

			if (darkness > 0 && getRandom().nextInt(600) == 0) {
				anchor.addStatusEffect(new StatusEffectInstance(StatusEffects.DARKNESS, 300, darkness - 1, true, false), null);
			}
		}

		if (getRandom().nextInt(4) == 0) {
			world.spawnParticles(BtlParticles.BLACK_SUN_CORONA, getX(), getY(), getZ(), 12, 8.0D, 8.0D, 8.0D, 0.02D);
		}
	}

	public int stage() {
		return (int) dataTracker.get(STAGE).floatValue();
	}

	public float scale() {
		return dataTracker.get(SCALE);
	}

	@Override
	protected void readCustomDataFromNbt(NbtCompound nbt) {
	}

	@Override
	protected void writeCustomDataToNbt(NbtCompound nbt) {
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
	public Packet<ClientPlayPacketListener> createSpawnPacket(net.minecraft.server.network.EntityTrackerEntry entry) {
		return new EntitySpawnS2CPacket(this);
	}
}
