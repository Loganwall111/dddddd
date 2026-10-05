package dev.logan.beyondthreshold.entity;

import dev.logan.beyondthreshold.BTTEntities;
import dev.logan.beyondthreshold.world.BTTDimensions;
import dev.logan.beyondthreshold.world.BTTTravel;
import net.minecraft.entity.Entity;
import net.minecraft.entity.EntityType;
import net.minecraft.entity.data.DataTracker;
import net.minecraft.entity.data.TrackedData;
import net.minecraft.entity.data.TrackedDataHandlerRegistry;
import net.minecraft.nbt.NbtCompound;
import net.minecraft.entity.player.PlayerEntity;
import net.minecraft.server.network.ServerPlayerEntity;
import net.minecraft.util.math.Box;
import net.minecraft.world.World;

/**
 * A knife-cut in the membrane of reality. Walk through the shimmering
 * slit and step, seamlessly, into a procedurally generated dimension —
 * with a procedural inventory waiting on the other side.
 */
public class RealityTearEntity extends Entity {
	private static final TrackedData<Integer> DIM_INDEX = DataTracker.registerData(RealityTearEntity.class, TrackedDataHandlerRegistry.INTEGER);

	public RealityTearEntity(EntityType<?> type, World world) {
		super(type, world);
	}

	public RealityTearEntity(World world, double x, double y, double z, int dimIndex, float yaw) {
		this(BTTEntities.REALITY_TEAR, world);
		setPos(x, y, z);
		setYaw(yaw);
		getDataTracker().set(DIM_INDEX, dimIndex);
	}

	@Override
	protected void initDataTracker() {
		dataTracker.set(DIM_INDEX, 0);
	}

	public int getDimIndex() {
		return dataTracker.get(DIM_INDEX);
	}

	/** 0..1 tear opening, closes near the end of its life. */
	public float getOpen() {
		float open = Math.min(1.0F, age / 30.0F);
		return open * (1.0F - Math.max(0.0F, (age - 2300) / 100.0F));
	}

	@Override
	protected void readCustomDataFromNbt(NbtCompound nbt) {
		dataTracker.set(DIM_INDEX, nbt.getInt("Dim"));
	}

	@Override
	protected void writeCustomDataToNbt(NbtCompound nbt) {
		nbt.putInt("Dim", getDimIndex());
	}

	@Override
	public void tick() {
		super.tick();
		if (getWorld().isClient) {
			return;
		}
		if (age > 2400) {
			discard();
			return;
		}
		Box gate = getBoundingBox().expand(0.7, 0.4, 0.7);
		for (PlayerEntity bttPe : getWorld().getPlayers()) { if (!(bttPe instanceof ServerPlayerEntity p)) continue;
			if (gate.contains(p.getPos())) {
				BTTTravel.travel(p, BTTDimensions.byIndex(getDimIndex()));
				break;
			}
		}
	}


}
