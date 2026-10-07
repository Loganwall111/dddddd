package dev.logan.beyond.server;

import dev.logan.beyond.BeyondMinecraft;
import dev.logan.beyond.content.BeyondContent;
import dev.logan.beyond.content.BeyondEntities;
import dev.logan.beyond.math.InventoryLedger;
import dev.logan.beyond.math.ScaleLadder;
import net.fabricmc.fabric.api.event.lifecycle.v1.ServerLifecycleEvents;
import net.minecraft.block.Blocks;
import net.minecraft.nbt.NbtCompound;
import net.minecraft.registry.Registries;
import net.minecraft.registry.RegistryKey;
import net.minecraft.registry.RegistryKeys;
import net.minecraft.util.math.BlockPos;
import net.minecraft.util.math.Vec3d;
import net.minecraft.world.World;

/** Opt-in real-server smoke harness, inert in ordinary installations. */
public final class BeyondSmoke {
    private BeyondSmoke() {}
    public static void register() {
        if (!"1".equals(System.getenv("BEYOND_SMOKE"))) return;
        ServerLifecycleEvents.SERVER_STARTED.register(server -> {
            try {
                int realms = BeyondMinecraft.CATALOG.realms().size();
                require(realms >= 12, "catalog must ship at least twelve distinct realms");
                require(BeyondContent.ALL.size() == realms * 6 + 6, "item catalog size");
                require(Registries.ENTITY_TYPE.get(BeyondMinecraft.id("realm_critter")) != null, "realm critter registered");
                require(Registries.CHUNK_GENERATOR.get(BeyondMinecraft.id("fractal_generator")) != null, "fractal generator registered");
                require(Registries.CHUNK_GENERATOR.get(BeyondMinecraft.id("labyrinth_generator")) != null, "labyrinth generator registered");
                require(Registries.CHUNK_GENERATOR.get(BeyondMinecraft.id("between_generator")) != null, "between generator registered");
                int solids = 0, generated = 0;
                BeyondMinecraft.LOGGER.info("BEYOND_SMOKE_BEGIN realms={} seed={}", realms, server.getOverworld().getSeed());
                for (var realm : BeyondMinecraft.CATALOG.realms()) {
                    BeyondMinecraft.LOGGER.info("BEYOND_SMOKE_CHECK realm={} generated={}", realm.id(), realm.generated());
                    var world = server.getWorld(RegistryKey.of(RegistryKeys.WORLD, BeyondMinecraft.id(realm.id())));
                    require(world != null, "missing dimension " + realm.id());
                    // Force real chunk generation through the realm's own generator (noise or Java).
                    world.getChunk(0, 0);
                    world.getChunk(0, 0);
                    var block = Registries.BLOCK.get(BeyondMinecraft.id(realm.blocks().get(0)));
                    var landing = SafeLanding.find(world, new Vec3d(.5, 100, .5), .6, 1.8, true, block);
                    require(landing.isPresent(), "no safe landing " + realm.id());
                    require(world.isAir(BlockPos.ofFloored(landing.orElseThrow())), "arrival headroom");
                    if (realm.generated()) {
                        generated++;
                        // Generated spaces must actually be built out of their own materials.
                        int found = 0;
                        BlockPos.Mutable cursor = new BlockPos.Mutable();
                        for (int x = -12; x <= 12 && found < 12; x += 4)
                            for (int z = -12; z <= 12 && found < 12; z += 4)
                                for (int y = world.getBottomY() + 4; y < world.getTopY() - 4 && found < 12; y += 11) {
                                    cursor.set(x, y, z);
                                    var state = world.getBlockState(cursor);
                                    if (state.isAir() || state.isOf(Blocks.BARRIER) || state.isOf(Blocks.DIRT) || state.isOf(Blocks.STONE)) continue;
                                    if (state.getBlock().getTranslationKey().contains("beyond.")) found++;
                                }
                        require(found > 0, "generated space " + realm.id() + " placed no realm material");
                        solids += found;
                    }
                    BeyondMinecraft.LOGGER.info("BEYOND_SMOKE realm={} generated={} landing={}", realm.id(), realm.generated(), landing.orElseThrow());
                }
                require(generated == 3, "expected three Java-generated spaces");
                require(solids > 0, "generated spaces must place blocks");
                // The Between must really have an abyss at its centre and a floor on the plate.
                var between = server.getWorld(RegistryKey.of(RegistryKeys.WORLD, BeyondMinecraft.id("realm_08")));
                require(between != null && between.getBlockState(new BlockPos(0, 40, 0)).isAir(), "the Between keeps an open abyss at its centre");
                require(!between.getBlockState(new BlockPos(60, 40, 0)).isAir(), "the Between has a puzzle floor on its plate");
                // The sky well is a real, reachable anomaly with a large radius.
                var overworld = server.getOverworld();
                SkyWells.ensure(server);   // install the world-owned wells before asserting on them
                Anomaly well = SkyWells.of(overworld.getRegistryKey());
                require(well != null && well.radius >= 100, "sky well installed with a colossal radius");
                require(well.center.distanceTo(Vec3d.ofCenter(overworld.getSpawnPos())) < 2000, "sky well within flying distance");
                SkyWells.tick(overworld, well);
                // Gravity and scale boundaries.
                require(!ScaleLadder.valid(0) && !ScaleLadder.valid(Double.NaN) && ScaleLadder.valid(ScaleLadder.MIN) && ScaleLadder.valid(ScaleLadder.MAX), "scale bounds");
                require(ScaleLadder.grow(1) == 2 && ScaleLadder.shrink(1) == .5, "scale ladder steps");
                require(ScaleLadder.grow(ScaleLadder.MAX) == ScaleLadder.MAX && ScaleLadder.shrink(ScaleLadder.MIN) == ScaleLadder.MIN, "scale ladder saturates");
                require(ScaleLadder.maximumTickTravel(ScaleLadder.MIN) != null && ScaleLadder.maximumTickTravel(1) == null, "micro-body physics guard");
                Journey journey = new Journey();
                journey.witnessed = true; journey.originWorld = World.OVERWORLD; journey.origin = new Vec3d(23.5, 72, -8.5);
                NbtCompound root = new NbtCompound(); root.putString("sentinel", "root");
                journey.inventory.switchTo("beyond:realm_00", root);
                NbtCompound modified = new NbtCompound(); modified.putString("sentinel", "realm");
                journey.inventory.switchTo("beyond:realm_01", modified);
                journey.era = 5; journey.eraSeed = 424242L;
                Journey copy = Journey.read(journey.write());
                require(copy.witnessed && copy.origin.equals(journey.origin), "journey NBT round trip");
                require(copy.era == 5 && copy.eraSeed == 424242L, "era persistence round trip");
                require(Umbrella.Era.of(0) == Umbrella.Era.PRISTINE && Umbrella.Era.of(1) == Umbrella.Era.GIANT_WOOD
                    && Umbrella.Era.of(4) == Umbrella.Era.ALIEN, "era table");
                require(copy.inventory.switchTo(InventoryLedger.ROOT, modified).getString("sentinel").equals("root"), "root inventory restore");
                require(copy.inventory.switchTo("beyond:realm_00", root).getString("sentinel").equals("realm"), "realm inventory restore");
                require(Registries.ENTITY_TYPE.getId(BeyondEntities.REALM_CRITTER).getPath().equals("realm_critter"), "critter id");
                BeyondMinecraft.LOGGER.info("BEYOND_SERVER_SMOKE_PASS realms={} registry=true worldgen=true generated_spaces={} landings=true journey_nbt=true scale=true sky_well=true",
                    realms, generated);
            } catch (Throwable error) {
                BeyondMinecraft.LOGGER.error("BEYOND_SERVER_SMOKE_FAIL", error);
            } finally { server.stop(false); }
        });
    }
    private static void require(boolean condition, String message) { if (!condition) throw new AssertionError(message); }
}
