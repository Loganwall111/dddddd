package dev.logan.beyond.server;

import dev.logan.beyond.BeyondMinecraft;
import dev.logan.beyond.content.BeyondContent;
import dev.logan.beyond.math.InventoryLedger;
import net.fabricmc.fabric.api.event.lifecycle.v1.ServerLifecycleEvents;
import net.minecraft.nbt.NbtCompound;
import net.minecraft.registry.Registries;
import net.minecraft.registry.RegistryKey;
import net.minecraft.registry.RegistryKeys;
import net.minecraft.util.math.Vec3d;
import net.minecraft.world.World;
import java.util.Map;

/** Opt-in real-server smoke harness, inert in ordinary installations. */
public final class BeyondSmoke {
    private BeyondSmoke() {}
    public static void register() {
        if (!"1".equals(System.getenv("BEYOND_SMOKE"))) return;
        ServerLifecycleEvents.SERVER_STARTED.register(server -> {
            try {
                int realms = BeyondMinecraft.CATALOG.realms().size();
                require(BeyondContent.ALL.size() == realms * 4 + 5, "item catalog size");
                for (var realm : BeyondMinecraft.CATALOG.realms()) {
                    var world = server.getWorld(RegistryKey.of(RegistryKeys.WORLD, BeyondMinecraft.id(realm.id())));
                    require(world != null, "missing dimension " + realm.id());
                    world.getChunk(0, 0);
                    var block = Registries.BLOCK.get(BeyondMinecraft.id(realm.blocks().get(0)));
                    var landing = SafeLanding.find(world, new Vec3d(.5, 100, .5), .6, 1.8, true, block);
                    require(landing.isPresent(), "no safe landing " + realm.id());
                    require(world.isAir(net.minecraft.util.math.BlockPos.ofFloored(landing.orElseThrow())), "arrival headroom");
                    BeyondMinecraft.LOGGER.info("BEYOND_SMOKE realm={} landing={}", realm.id(), landing.orElseThrow());
                }
                Journey journey = new Journey();
                journey.witnessed = true; journey.originWorld = World.OVERWORLD; journey.origin = new Vec3d(23.5, 72, -8.5);
                NbtCompound root = new NbtCompound(); root.putString("sentinel", "root");
                journey.inventory.switchTo("beyond:realm_00", root);
                NbtCompound modified = new NbtCompound(); modified.putString("sentinel", "realm");
                journey.inventory.switchTo("beyond:realm_01", modified);
                Journey copy = Journey.read(journey.write());
                require(copy.witnessed && copy.origin.equals(journey.origin), "journey NBT round trip");
                require(copy.inventory.switchTo(InventoryLedger.ROOT, modified).getString("sentinel").equals("root"), "root inventory restore");
                require(copy.inventory.switchTo("beyond:realm_00", root).getString("sentinel").equals("realm"), "realm inventory restore");
                BeyondMinecraft.LOGGER.info("BEYOND_SERVER_SMOKE_PASS realms={} registry=true worldgen=true landings=true journey_nbt=true", realms);
            } catch (Throwable error) {
                BeyondMinecraft.LOGGER.error("BEYOND_SERVER_SMOKE_FAIL", error);
            } finally { server.stop(false); }
        });
    }
    private static void require(boolean condition, String message) { if (!condition) throw new AssertionError(message); }
}
