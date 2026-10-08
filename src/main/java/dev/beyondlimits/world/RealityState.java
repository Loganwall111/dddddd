package dev.beyondlimits.world;

import dev.beyondlimits.BeyondLimits;
import net.minecraft.nbt.NbtCompound;
import net.minecraft.server.world.ServerWorld;
import net.minecraft.util.math.BlockPos;
import net.minecraft.world.PersistentState;

public final class RealityState extends PersistentState {
    private static final String STORAGE_KEY = BeyondLimits.MOD_ID + "_reality_ledger";

    private int stability = 100;
    private long nextRiftAt = 48_000L;
    private long lastDecayDay = -1L;
    private long lastRiftTime = -1L;
    private BlockPos lastRiftPos = BlockPos.ORIGIN;
    private boolean hasLastRift;
    private int riftsOpened;
    private int observerSightings;

    public static RealityState get(ServerWorld context) {
        ServerWorld overworld = context.getServer().getOverworld();
        return overworld.getPersistentStateManager().getOrCreate(
                RealityState::fromNbt,
                RealityState::new,
                STORAGE_KEY
        );
    }

    public static RealityState fromNbt(NbtCompound nbt) {
        RealityState state = new RealityState();
        state.stability = clamp(nbt.getInt("stability"), 0, 100);
        state.nextRiftAt = nbt.contains("next_rift_at") ? nbt.getLong("next_rift_at") : 48_000L;
        state.lastDecayDay = nbt.getLong("last_decay_day");
        state.lastRiftTime = nbt.getLong("last_rift_time");
        state.hasLastRift = nbt.getBoolean("has_last_rift");
        state.lastRiftPos = new BlockPos(nbt.getInt("rift_x"), nbt.getInt("rift_y"), nbt.getInt("rift_z"));
        state.riftsOpened = Math.max(0, nbt.getInt("rifts_opened"));
        state.observerSightings = Math.max(0, nbt.getInt("observer_sightings"));
        return state;
    }

    @Override
    public NbtCompound writeNbt(NbtCompound nbt) {
        nbt.putInt("stability", stability);
        nbt.putLong("next_rift_at", nextRiftAt);
        nbt.putLong("last_decay_day", lastDecayDay);
        nbt.putLong("last_rift_time", lastRiftTime);
        nbt.putBoolean("has_last_rift", hasLastRift);
        nbt.putInt("rift_x", lastRiftPos.getX());
        nbt.putInt("rift_y", lastRiftPos.getY());
        nbt.putInt("rift_z", lastRiftPos.getZ());
        nbt.putInt("rifts_opened", riftsOpened);
        nbt.putInt("observer_sightings", observerSightings);
        return nbt;
    }

    public int getStability() {
        return stability;
    }

    public void setStability(int value) {
        int clamped = clamp(value, 0, 100);
        if (clamped != stability) {
            stability = clamped;
            markDirty();
        }
    }

    public void adjustStability(int amount) {
        setStability(stability + amount);
    }

    public long getNextRiftAt() {
        return nextRiftAt;
    }

    public void setNextRiftAt(long value) {
        nextRiftAt = Math.max(0L, value);
        markDirty();
    }

    public long getLastDecayDay() {
        return lastDecayDay;
    }

    public void setLastDecayDay(long value) {
        if (value != lastDecayDay) {
            lastDecayDay = value;
            markDirty();
        }
    }

    public void recordRift(BlockPos pos, long worldTime) {
        lastRiftPos = pos.toImmutable();
        lastRiftTime = worldTime;
        hasLastRift = true;
        riftsOpened++;
        adjustStability(-5);
        markDirty();
    }

    public boolean hasLastRift() {
        return hasLastRift;
    }

    public BlockPos getLastRiftPos() {
        return lastRiftPos;
    }

    public long getLastRiftTime() {
        return lastRiftTime;
    }

    public int getRiftsOpened() {
        return riftsOpened;
    }

    public int getObserverSightings() {
        return observerSightings;
    }

    public void recordObserverSighting() {
        observerSightings++;
        markDirty();
    }

    public String getPhaseName() {
        if (stability >= 81) return "QUIET FRACTURE";
        if (stability >= 61) return "THE BLEEDING";
        if (stability >= 41) return "WORLD COLLISION";
        if (stability >= 21) return "REALITY FAILURE";
        if (stability >= 6) return "LAST LIGHT";
        return "THE NEVERENDING WORLD";
    }

    private static int clamp(int value, int min, int max) {
        return Math.max(min, Math.min(max, value));
    }
}
