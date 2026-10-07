package dev.logan.beyond.server;

import dev.logan.beyond.BeyondMinecraft;
import dev.logan.beyond.math.InventoryLedger;
import net.minecraft.nbt.NbtCompound;
import net.minecraft.nbt.NbtElement;
import net.minecraft.registry.RegistryKey;
import net.minecraft.registry.RegistryKeys;
import net.minecraft.server.network.ServerPlayerEntity;
import net.minecraft.util.Identifier;
import net.minecraft.util.math.Vec3d;
import net.minecraft.world.World;
import java.util.LinkedHashMap;

/** One per player, saved in the SAME playerdata NBT as their live inventory. */
public final class Journey {
    public boolean witnessed;
    public int cursor;
    public RegistryKey<World> originWorld;
    public Vec3d origin;
    public float originYaw, originPitch;
    public int travelCooldown;
    public final InventoryLedger<NbtCompound> inventory = new InventoryLedger<>(NbtCompound::copy);
    public static Journey of(ServerPlayerEntity player) { return ((Traveler) player).beyond$getJourney(); }
    public static boolean inRealm(RegistryKey<World> world) {
        return world.getValue().getNamespace().equals("beyond") && world.getValue().getPath().matches("realm_[0-9]{2}");
    }
    public static String scope(RegistryKey<World> world) { return inRealm(world) ? world.getValue().toString() : InventoryLedger.ROOT; }
    public NbtCompound write() {
        NbtCompound tag = new NbtCompound();
        tag.putInt("Schema", 1); tag.putBoolean("Witnessed", witnessed); tag.putInt("Cursor", cursor);
        tag.putString("Active", inventory.active());
        NbtCompound vault = new NbtCompound();
        inventory.snapshots().forEach(vault::put);
        tag.put("Vault", vault);
        if (originWorld != null && origin != null) {
            tag.putString("OriginWorld", originWorld.getValue().toString());
            tag.putDouble("OriginX", origin.x); tag.putDouble("OriginY", origin.y); tag.putDouble("OriginZ", origin.z);
            tag.putFloat("OriginYaw", originYaw); tag.putFloat("OriginPitch", originPitch);
        }
        return tag;
    }
    public static Journey read(NbtCompound tag) {
        Journey result = new Journey();
        if (tag.isEmpty()) return result;
        // Do not silently discard an incompatible inventory vault; fail loading with a clear backup instruction.
        if (tag.getInt("Schema") != 1) throw new IllegalStateException("Unsupported Beyond journey schema. Restore a backup; do not downgrade this world.");
        result.witnessed = tag.getBoolean("Witnessed");
        result.cursor = Math.max(0, tag.getInt("Cursor"));
        var vault = new LinkedHashMap<String, NbtCompound>();
        NbtCompound stored = tag.getCompound("Vault");
        for (String key : stored.getKeys()) {
            if (!stored.contains(key, NbtElement.COMPOUND_TYPE)) throw new IllegalStateException("Invalid Beyond inventory entry: " + key);
            vault.put(key, stored.getCompound(key));
        }
        result.inventory.restore(tag.getString("Active"), vault);
        Identifier id = Identifier.tryParse(tag.getString("OriginWorld"));
        if (id != null) {
            double x = tag.getDouble("OriginX"), y = tag.getDouble("OriginY"), z = tag.getDouble("OriginZ");
            if (Double.isFinite(x) && Double.isFinite(y) && Double.isFinite(z) && Math.abs(x) < 29999900 && Math.abs(z) < 29999900) {
                result.originWorld = RegistryKey.of(RegistryKeys.WORLD, id);
                result.origin = new Vec3d(x, y, z);
                result.originYaw = Float.isFinite(tag.getFloat("OriginYaw")) ? tag.getFloat("OriginYaw") : 0;
                result.originPitch = Float.isFinite(tag.getFloat("OriginPitch")) ? Math.clamp(tag.getFloat("OriginPitch"), -90, 90) : 0;
            } else BeyondMinecraft.LOGGER.warn("Ignored invalid Beyond return coordinates");
        }
        result.travelCooldown = 60;
        return result;
    }
}
