package com.beyondthelimits.entity;

import com.beyondthelimits.core.engine.ExplosionEngine;
import com.beyondthelimits.registry.BtlParticles;
import com.beyondthelimits.registry.BtlSounds;
import net.minecraft.entity.Entity;
import net.minecraft.entity.EntityType;
import net.minecraft.entity.data.DataTracker;
import net.minecraft.entity.data.TrackedData;
import net.minecraft.entity.data.TrackedDataHandlerRegistry;
import net.minecraft.nbt.NbtCompound;
import net.minecraft.network.listener.ClientPlayPacketListener;
import net.minecraft.network.packet.Packet;
import net.minecraft.network.packet.s2c.play.EntitySpawnS2CPacket;
import net.minecraft.particle.ParticleTypes;
import net.minecraft.server.world.ServerWorld;
import net.minecraft.sound.SoundCategory;
import net.minecraft.world.World;

/**
 * The reality warhead: the mod's "nuclear" device.
 *
 * <p>It does not use Minecraft's {@code Explosion} class. A vanilla explosion is instantaneous —
 * everything happens in one tick, which is why it can never feel like a shockwave. The warhead
 * instead runs a real detonation timeline on the server:</p>
 *
 * <ol>
 *     <li><b>fuse</b> — a rising hum and a growing glow;</li>
 *     <li><b>flash</b> — a full-screen white-out pushed to every client in range;</li>
 *     <li><b>shockwave</b> — an expanding ring that destroys blocks a few blocks per tick, so you
 *     watch the world get erased at the speed of sound, with a wall of smoke behind it;</li>
 *     <li><b>mushroom column</b> — particles plus a vertical lift of debris and mobs;</li>
 *     <li><b>fallout</b> — a persistent zone that inflicts reality damage, corrupts the ground and
 *     spawns radiation rifts for two in-game days.</li>
 * </ol>
 */
public class RealityWarheadEntity extends Entity {
	private static final TrackedData<Integer> FUSE = DataTracker.registerData(RealityWarheadEntity.class,
			TrackedDataHandlerRegistry.INTEGER);
	private static final TrackedData<Float> POWER = DataTracker.registerData(RealityWarheadEntity.class,
			TrackedDataHandlerRegistry.FLOAT);

	public RealityWarheadEntity(EntityType<? extends RealityWarheadEntity> type, World world) {
		super(type, world);
		this.setNoGravity(true);
		this.noClip = true;
	}

	@Override
	protected void initDataTracker(DataTracker.Builder builder) {
		builder.add(FUSE, 200);
		builder.add(POWER, 42.0F);
	}

	public void arm(int fuseTicks, float power) {
		dataTracker.set(FUSE, fuseTicks);
		dataTracker.set(POWER, power);
	}

	public int fuse() {
		return dataTracker.get(FUSE);
	}

	public float power() {
		return dataTracker.get(POWER);
	}

	@Override
	public void tick() {
		super.tick();

		if (getWorld().isClient()) {
			worldTickClient();
			return;
		}

		int fuse = fuse() - 1;
		dataTracker.set(FUSE, fuse);

		ServerWorld world = (ServerWorld) getWorld();

		if (fuse % 20 == 0 && fuse > 0) {
			world.playSound(null, getBlockPos(), BtlSounds.SIGNAL_STATIC, SoundCategory.BLOCKS, 1.0F,
					0.4F + (200 - fuse) / 200.0F * 0.8F);
			world.spawnParticles(BtlParticles.REALITY_SCAR, getX(), getY() + 0.5D, getZ(), 4, 0.4D, 0.4D, 0.4D, 0.01D);
		}

		if (fuse <= 0) {
			ExplosionEngine.detonateWarhead(world, getPos(), power());
			discard();
		}
	}

	private void worldTickClient() {
		getWorld().addParticle(ParticleTypes.FLASH, getX(), getY() + 0.6D, getZ(), 0.0D, 0.0D, 0.0D);

		for (int i = 0; i < 2; i++) {
			getWorld().addParticle(BtlParticles.BLACK_SUN_CORONA,
					getX() + (getRandom().nextDouble() - 0.5D), getY() + 0.6D,
					getZ() + (getRandom().nextDouble() - 0.5D), 0.0D, 0.02D, 0.0D);
		}
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
	protected void readCustomDataFromNbt(NbtCompound nbt) {
		arm(nbt.getInt("fuse"), nbt.contains("power") ? nbt.getFloat("power") : 42.0F);
	}

	@Override
	protected void writeCustomDataToNbt(NbtCompound nbt) {
		nbt.putInt("fuse", fuse());
		nbt.putFloat("power", power());
	}

	@Override
	public Packet<ClientPlayPacketListener> createSpawnPacket(net.minecraft.server.network.EntityTrackerEntry entry) {
		return new EntitySpawnS2CPacket(this, 0, this.getBlockPos());
	}
}
