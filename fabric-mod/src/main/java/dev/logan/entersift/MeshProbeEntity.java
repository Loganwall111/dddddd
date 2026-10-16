package dev.logan.entersift;

import net.minecraft.core.BlockPos;
import net.minecraft.network.syncher.EntityDataAccessor;
import net.minecraft.network.syncher.EntityDataSerializers;
import net.minecraft.network.syncher.SynchedEntityData;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.storage.ValueInput;
import net.minecraft.world.level.storage.ValueOutput;

/**
 * 0.41 mesh probe: an experiment entity that draws one converted Dungeons room in the world so the level
 * layout can be looked at in game. Summon it and the room appears; the ground under it becomes standable.
 *
 * <p><b>Why barriers.</b> The mesh is drawn as surface geometry only — it has no collision of its own, so
 * without help the player walks straight through it. So while {@code Floor} is on, the entity lays a
 * barrier at the mesh surface height of every ground column, one batch per tick. Barriers are invisible
 * and only ever replace air, so nothing in the world is overwritten; {@code onRemoval} takes them back up
 * again, and it only clears a block that is still a barrier. Kill the entity (or {@code /kill
 * @e[type=entersift:mesh_probe]}) and the world returns to how it was.
 *
 * <p>This is deliberately not part of the rift: the rift is walk-through and needs none of it. The probe is
 * for judging what the converted rooms look like, and it is off by default in
 * {@code config/entersift-client.properties} ({@code mesh_probe=false} hides it again).
 *
 * <p>NBT: {@code Mesh} (room id), {@code Floor} (1b = lay barriers), {@code Cursor} (columns placed).
 */
public class MeshProbeEntity extends Entity {
    private static final EntityDataAccessor<String> MESH =
        SynchedEntityData.defineId(MeshProbeEntity.class, EntityDataSerializers.STRING);
    private static final EntityDataAccessor<Boolean> FLOOR =
        SynchedEntityData.defineId(MeshProbeEntity.class, EntityDataSerializers.BOOLEAN);

    /** Columns of floor placed per tick. Bounded so a 15k-column room never stalls a server tick. */
    static final int COLUMNS_PER_TICK = 384;
    /** Hard cap on barrier blocks one probe may place, independent of the room size. */
    static final int MAX_BARRIERS = 24_000;

    private int cursor;

    public MeshProbeEntity(EntityType<? extends MeshProbeEntity> type, Level level) {
        super(type, level);
        this.noPhysics = true;
        this.setNoGravity(true);
    }

    @Override
    protected void defineSynchedData(SynchedEntityData.Builder builder) {
        builder.define(MESH, MeshProbeData.DEFAULT).define(FLOOR, true);
    }

    public String meshId() { return this.entityData.get(MESH); }
    public void setMeshId(String id) { this.entityData.set(MESH, MeshProbeData.isKnown(id) ? id : MeshProbeData.DEFAULT); }
    public boolean floorOn() { return this.entityData.get(FLOOR); }
    public void setFloorOn(boolean on) { this.entityData.set(FLOOR, on); }
    public MeshProbeData.Mesh mesh() { return MeshProbeData.get(meshId()); }

    /** World block position of column {@code c}'s cell corner, given the entity's position. */
    private BlockPos columnPos(MeshProbeData.Mesh mesh, int c) {
        int bx = this.getBlockX() - mesh.width / 2 + mesh.columnX(c);
        int bz = this.getBlockZ() - mesh.depth / 2 + mesh.columnZ(c);
        // Top face of the barrier lands at entityY + surfaceHeight, so the drawn surface is the walkable one.
        int by = this.getBlockY() + (int) mesh.heightAt(c) - 1;
        return new BlockPos(bx, by, bz);
    }

    @Override
    public void tick() {
        super.tick();
        if (!(this.level() instanceof ServerLevel server)) return;
        if (!floorOn()) return;
        MeshProbeData.Mesh mesh = mesh();
        if (mesh == null) return;
        int limit = Math.min(mesh.columnCount, MAX_BARRIERS);
        if (cursor >= limit) return;
        int end = Math.min(limit, cursor + COLUMNS_PER_TICK);
        for (int c = cursor; c < end; c++) {
            BlockPos pos = columnPos(mesh, c);
            if (!server.isLoaded(pos)) continue;
            if (!server.getBlockState(pos).isAir()) continue;    // never overwrite anything that exists
            server.setBlock(pos, Blocks.BARRIER.defaultBlockState(), 2);
        }
        cursor = end;
    }

    /** Takes the floor back up. Only a block that is still a barrier is cleared. */
    @Override
    public void onRemoval(RemovalReason reason) {
        super.onRemoval(reason);
        if (!(this.level() instanceof ServerLevel server)) return;
        MeshProbeData.Mesh mesh = mesh();
        if (mesh == null) return;
        int limit = Math.min(Math.min(cursor, mesh.columnCount), MAX_BARRIERS);
        for (int c = 0; c < limit; c++) {
            BlockPos pos = columnPos(mesh, c);
            if (!server.isLoaded(pos)) continue;
            if (server.getBlockState(pos).is(Blocks.BARRIER)) {
                server.setBlock(pos, Blocks.AIR.defaultBlockState(), 2);
            }
        }
    }

    @Override public boolean isPickable() { return false; }
    @Override public boolean isAttackable() { return false; }
    @Override public boolean shouldRenderAtSqrDistance(double distance) { return distance < 512 * 512; }

    @Override
    protected void readAdditionalSaveData(ValueInput input) {
        setMeshId(input.getStringOr("Mesh", MeshProbeData.DEFAULT));
        this.entityData.set(FLOOR, input.getBooleanOr("Floor", true));
        cursor = Math.max(0, input.getIntOr("Cursor", 0));
    }

    @Override
    protected void addAdditionalSaveData(ValueOutput output) {
        output.putString("Mesh", meshId());
        output.putBoolean("Floor", floorOn());
        output.putInt("Cursor", cursor);
    }
}
