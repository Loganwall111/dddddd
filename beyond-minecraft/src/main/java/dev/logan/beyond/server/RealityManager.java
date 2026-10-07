package dev.logan.beyond.server;

import dev.logan.beyond.BeyondMinecraft;
import dev.logan.beyond.content.BeyondContent;
import dev.logan.beyond.math.Gravity;
import dev.logan.beyond.math.Membrane;
import dev.logan.beyond.math.RealmSeed;
import dev.logan.beyond.math.Vec;
import dev.logan.beyond.network.RealityPayload;
import net.fabricmc.fabric.api.networking.v1.ServerPlayNetworking;
import net.minecraft.block.Blocks;
import net.minecraft.entity.Entity;
import net.minecraft.entity.ItemEntity;
import net.minecraft.entity.LivingEntity;
import net.minecraft.entity.attribute.EntityAttributeModifier;
import net.minecraft.entity.attribute.EntityAttributes;
import net.minecraft.item.ItemStack;
import net.minecraft.particle.ParticleTypes;
import net.minecraft.registry.Registries;
import net.minecraft.registry.RegistryKey;
import net.minecraft.registry.RegistryKeys;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.network.ServerPlayerEntity;
import net.minecraft.server.world.ServerWorld;
import net.minecraft.sound.SoundCategory;
import net.minecraft.sound.SoundEvents;
import net.minecraft.text.Text;
import net.minecraft.util.Formatting;
import net.minecraft.util.math.BlockPos;
import net.minecraft.util.math.Box;
import net.minecraft.util.math.Vec3d;
import net.minecraft.world.World;
import java.util.*;

/** Server authority: finite budgets, collision checks, inventory boundaries and real dimension travel. */
public final class RealityManager {
    private static final Map<RegistryKey<World>, List<Anomaly>> ANOMALIES = new HashMap<>();
    private static final Map<UUID, Sample> PREVIOUS = new HashMap<>();
    private static int nextId;
    private record Sample(RegistryKey<World> world, Vec3d position) {}
    private static final class Anomaly {
        final int id = nextId++;
        final UUID owner;
        final Vec3d center;
        final boolean blackHole;
        final float yaw;
        final int realm, lifetime;
        int age;
        Anomaly(ServerPlayerEntity player, Vec3d center, boolean blackHole, int realm) {
            owner = player.getUuid(); this.center = center; this.blackHole = blackHole;
            yaw = (float) Math.toRadians(player.getYaw()); this.realm = realm;
            lifetime = BeyondMinecraft.CONFIG.lifetimeSeconds * 20;
        }
        float radius() { return blackHole ? 1.15f : 1.6f; }
        RealityPayload.Node snapshot() {
            return new RealityPayload.Node(id, blackHole ? 1 : 0, center.x, center.y, center.z, radius(), yaw, realm, age, lifetime);
        }
    }
    private RealityManager() {}
    public static void reset() { ANOMALIES.clear(); PREVIOUS.clear(); nextId = 0; }
    public static void disconnect(ServerPlayerEntity player) { PREVIOUS.remove(player.getUuid()); }
    private static Vec vec(Vec3d v) { return new Vec(v.x, v.y, v.z); }
    public static void joined(ServerPlayerEntity player) {
        Journey j = Journey.of(player);
        boolean intro = !j.witnessed && BeyondMinecraft.CONFIG.firstJoinEncounter && player.getWorld().getRegistryKey().equals(World.OVERWORLD);
        if (!j.witnessed) {
            j.witnessed = true;
            player.giveItemStack(new ItemStack(BeyondContent.GUIDE));
            player.sendMessage(Text.literal("Beyond Minecraft · Something has noticed you. [B] opens the Field Guide; [O] disables visual effects.")
                .formatted(Formatting.AQUA), false);
        }
        // A removed/changed realm is not silently reconciled by overwriting the player's inventory.
        // Normal logins retain the live inventory saved by vanilla in this same NBT record.
        j.travelCooldown = 40;
        sync(player, intro);
    }
    public static void sync(ServerPlayerEntity player, boolean intro) {
        if (!ServerPlayNetworking.canSend(player, RealityPayload.ID)) return;
        var nodes = ANOMALIES.getOrDefault(player.getWorld().getRegistryKey(), List.of()).stream()
            .filter(a -> a.center.squaredDistanceTo(player.getPos()) < 160 * 160)
            .sorted(Comparator.comparingDouble(a -> a.center.squaredDistanceTo(player.getPos())))
            .limit(RealityPayload.MAX_NODES).map(Anomaly::snapshot).toList();
        ServerPlayNetworking.send(player, new RealityPayload(player.getWorld().getRegistryKey().getValue(), intro, nodes));
    }
    public static boolean spawn(ServerPlayerEntity player, boolean blackHole) {
        if (player.isSpectator() || player.hasVehicle()) return false;
        Journey journey = Journey.of(player);
        if (journey.travelCooldown > 0) return false;
        ServerWorld world = player.getServerWorld();
        List<Anomaly> list = ANOMALIES.computeIfAbsent(world.getRegistryKey(), k -> new ArrayList<>());
        if (list.size() >= BeyondMinecraft.CONFIG.maxAnomaliesPerWorld ||
            list.stream().filter(a -> a.owner.equals(player.getUuid())).count() >= BeyondMinecraft.CONFIG.maxAnomaliesPerPlayer) {
            message(player, "Reality is already under strain. Wait for an opening to dissolve."); return false;
        }
        Vec3d look = player.getRotationVec(1);
        Vec3d center = blackHole ? player.getEyePos().add(look.multiply(9))
            : player.getPos().add(look.x * 4.5, 1.7 + look.y * 2, look.z * 4.5);
        BlockPos pos = BlockPos.ofFloored(center);
        if (!world.getWorldBorder().contains(pos) || center.y < world.getBottomY() + 5 || center.y > world.getTopY() - 5 ||
            !world.isChunkLoaded(pos) || !world.isSpaceEmpty(new Box(center.x - .7, center.y - 1, center.z - .7, center.x + .7, center.y + 1, center.z + .7))) {
            message(player, "Aim at clear space. A membrane cannot open inside solid ground."); return false;
        }
        int slot = RealmSeed.slot(world.getSeed(), player.getUuid().getLeastSignificantBits(), journey.cursor++, BeyondMinecraft.CATALOG.realms().size());
        if (journey.cursor < 0) journey.cursor = 0;
        Anomaly node = new Anomaly(player, center, blackHole, slot);
        list.add(node);
        world.playSound(null, center.x, center.y, center.z, blackHole ? SoundEvents.BLOCK_RESPAWN_ANCHOR_CHARGE : SoundEvents.BLOCK_AMETHYST_BLOCK_RESONATE,
            SoundCategory.PLAYERS, .7f, blackHole ? .55f : .7f);
        for (ServerPlayerEntity p : world.getPlayers()) sync(p, false);
        message(player, (blackHole ? "Singularity" : "Membrane") + " → " + BeyondMinecraft.CATALOG.realms().get(slot).name());
        return true;
    }
    public static void tick(MinecraftServer server) {
        for (ServerPlayerEntity player : server.getPlayerManager().getPlayerList()) {
            Journey journey = Journey.of(player);
            if (journey.travelCooldown > 0) journey.travelCooldown--;
            Sample before = PREVIOUS.get(player.getUuid());
            // Safety net for disconnected islands; no automatic death/void loop on an arrival world.
            if (Journey.inRealm(player.getWorld().getRegistryKey()) && player.getY() < player.getWorld().getBottomY() + 12 && journey.travelCooldown == 0)
                returnHome(player);
            List<Anomaly> nodes = ANOMALIES.getOrDefault(player.getWorld().getRegistryKey(), List.of());
            if (!player.isSpectator() && !player.hasVehicle() && journey.travelCooldown == 0) {
                Vec3d body = player.getPos().add(0, player.getHeight() * .5, 0);
                for (Anomaly node : nodes) {
                    if (node.age < 24 || node.age >= node.lifetime - 20) continue;
                    boolean crossed = node.blackHole ? node.center.distanceTo(body) < node.radius() * 1.08
                        : before != null && before.world.equals(player.getWorld().getRegistryKey()) &&
                        before.position.squaredDistanceTo(body) < 256 && Membrane.crossed(vec(before.position), vec(body), vec(node.center), node.yaw, node.radius(), node.radius() * 1.35);
                    if (crossed) { enter(player, node.realm); break; }
                }
            }
            PREVIOUS.put(player.getUuid(), new Sample(player.getWorld().getRegistryKey(), player.getPos().add(0, player.getHeight() * .5, 0)));
            if (server.getTicks() % 10 == 0) sync(player, false);
        }
        for (var entry : ANOMALIES.entrySet()) {
            ServerWorld world = server.getWorld(entry.getKey());
            if (world == null) continue;
            for (Anomaly node : entry.getValue()) {
                node.age++;
                if (!world.isChunkLoaded(BlockPos.ofFloored(node.center))) continue;
                if (node.blackHole && node.age > 24 && node.age < node.lifetime - 20) attract(world, node);
                // A restrained geometry fallback remains visible if shaders are disabled.
                if (node.age % 5 == 0) {
                    double phase = node.age * .04;
                    int points = node.blackHole ? 8 : 10;
                    for (int i = 0; i < points; i++) {
                        double angle = i * Math.PI * 2 / points + phase;
                        double x = Math.cos(angle) * node.radius(), y = Math.sin(angle) * node.radius() * (node.blackHole ? .35 : 1.35);
                        world.spawnParticles(node.blackHole ? ParticleTypes.END_ROD : ParticleTypes.REVERSE_PORTAL,
                            node.center.x + x * Math.cos(node.yaw), node.center.y + y, node.center.z + x * Math.sin(node.yaw),
                            1, 0, 0, 0, 0);
                    }
                }
            }
            entry.getValue().removeIf(a -> a.age >= a.lifetime);
        }
    }
    private static void attract(ServerWorld world, Anomaly node) {
        double reach = BeyondMinecraft.CONFIG.gravityRadius;
        var entities = world.getOtherEntities(null, new Box(node.center.subtract(reach, reach, reach), node.center.add(reach, reach, reach)),
            e -> !e.isSpectator() && !e.hasVehicle() && (e instanceof LivingEntity || e instanceof ItemEntity));
        int budget = 96;
        for (Entity entity : entities) {
            if (--budget < 0) break;
            if (entity instanceof ServerPlayerEntity p) {
                // No involuntary PvP gravity; only the creator is pulled. Flying creative players can approach freely.
                if (!p.getUuid().equals(node.owner) || p.getAbilities().flying || Journey.of(p).travelCooldown > 0) continue;
            } else if (!BeyondMinecraft.CONFIG.pullMobs) continue;
            Vec after = Gravity.integrate(vec(entity.getPos()), vec(entity.getVelocity()), vec(node.center), node.radius(), reach,
                BeyondMinecraft.CONFIG.gravityStrength, BeyondMinecraft.CONFIG.maximumSpeed);
            entity.setVelocity(after.x(), after.y(), after.z());
            entity.velocityModified = true;
            entity.fallDistance = 0;
        }
    }
    public static boolean enter(ServerPlayerEntity player, int slot) {
        if (slot < 0 || slot >= BeyondMinecraft.CATALOG.realms().size()) return false;
        var realm = BeyondMinecraft.CATALOG.realms().get(slot);
        ServerWorld destination = player.getServer().getWorld(RegistryKey.of(RegistryKeys.WORLD, BeyondMinecraft.id(realm.id())));
        if (destination == null) { message(player, "That realm is unavailable. Your inventory has not changed."); return false; }
        Journey j = Journey.of(player);
        if (destination == player.getServerWorld()) { message(player, "This opening folds back into the same reality."); j.travelCooldown = 40; return false; }
        if (player.hasVehicle()) { message(player, "Dismount before crossing a membrane."); return false; }
        var landing = SafeLanding.find(destination, new Vec3d(.5, 100, .5), player.getWidth(), player.getHeight(), true,
            Registries.BLOCK.get(BeyondMinecraft.id(realm.blocks().get(0))));
        if (landing.isEmpty()) { message(player, "No safe arrival exists. The opening refuses you."); j.travelCooldown = 60; return false; }
        if (!Journey.inRealm(player.getWorld().getRegistryKey())) {
            j.originWorld = player.getWorld().getRegistryKey(); j.origin = player.getPos(); j.originYaw = player.getYaw(); j.originPitch = player.getPitch();
        }
        teleport(player, destination, landing.get(), player.getYaw(), 0);
        message(player, realm.name() + " · Sneak-use the knife or /beyond return to leave.");
        return true;
    }
    public static boolean returnHome(ServerPlayerEntity player) {
        Journey j = Journey.of(player);
        if (!Journey.inRealm(player.getWorld().getRegistryKey())) { message(player, "You are already in the root reality."); return false; }
        ServerWorld world = j.originWorld == null ? player.getServer().getOverworld() : player.getServer().getWorld(j.originWorld);
        if (world == null) world = player.getServer().getOverworld();
        Vec3d preferred = j.origin != null && world.getRegistryKey().equals(j.originWorld) ? j.origin : world.getSpawnPos().toBottomCenterPos();
        var landing = SafeLanding.find(world, preferred, player.getWidth(), player.getHeight(), false, Blocks.OBSIDIAN);
        if (landing.isEmpty()) { message(player, "Your return area is obstructed. Try normal scale, or ask an operator to clear your original arrival point."); j.travelCooldown = 80; return false; }
        boolean isolated = !j.inventory.active().equals("root");
        teleport(player, world, landing.get(), j.originYaw, j.originPitch);
        j.origin = null; j.originWorld = null;
        message(player, isolated ? "Root reality restored. Your original inventory is waiting." : "Root reality restored. Shared inventory unchanged.");
        return true;
    }
    private static void teleport(ServerPlayerEntity player, ServerWorld world, Vec3d pos, float yaw, float pitch) {
        player.closeHandledScreen();
        Journey.of(player).travelCooldown = 80;
        player.teleport(world, pos.x, pos.y, pos.z, yaw, pitch);
        player.setVelocity(Vec3d.ZERO); player.fallDistance = 0;
        PREVIOUS.remove(player.getUuid());
        sync(player, false);
    }
    public static void changedWorld(ServerPlayerEntity player) {
        player.closeHandledScreen();
        InventoryVault.switchFor(player, player.getWorld().getRegistryKey(), InventoryVault.capture(player));
        Journey.of(player).travelCooldown = 80;
        PREVIOUS.remove(player.getUuid());
        sync(player, false);
    }
    public static void respawned(ServerPlayerEntity oldPlayer, ServerPlayerEntity player, boolean alive) {
        // Vanilla has already kept or dropped the deceased player's active inventory. Snapshot THAT state,
        // not an old pre-death copy, before restoring an independent root inventory on cross-world respawn.
        InventoryVault.switchFor(player, player.getWorld().getRegistryKey(), InventoryVault.capture(oldPlayer));
        Journey.of(player).travelCooldown = 80;
        PREVIOUS.remove(player.getUuid()); sync(player, false);
    }
    public static boolean cycleScale(ServerPlayerEntity player) {
        var attribute = player.getAttributeInstance(EntityAttributes.GENERIC_SCALE);
        if (attribute == null) return false;
        var existing = attribute.getModifier(BeyondMinecraft.id("scale"));
        double current = existing == null ? 1 : existing.value() + 1;
        double next = current < .2 ? .5 : current < .9 ? 1 : current < 2 ? 3 : .125;
        return scale(player, next);
    }
    public static boolean scale(ServerPlayerEntity player, double scale) {
        if (!Double.isFinite(scale) || scale < .125 || scale > 3 || player.hasVehicle()) return false;
        var attribute = player.getAttributeInstance(EntityAttributes.GENERIC_SCALE);
        if (attribute == null) return false;
        var old = attribute.getModifier(BeyondMinecraft.id("scale"));
        double current = old == null ? 1 : old.value() + 1;
        double ratio = scale / current;
        if (ratio > 1) {
            Vec3d p = player.getPos(); double w = player.getWidth() * ratio / 2, h = player.getHeight() * ratio;
            if (!player.getWorld().isSpaceEmpty(player, new Box(p.x - w, p.y, p.z - w, p.x + w, p.y + h, p.z + w))) {
                message(player, "Not enough room to grow. Move into open space."); return false;
            }
        }
        attribute.removeModifier(BeyondMinecraft.id("scale"));
        if (scale != 1) attribute.addPersistentModifier(new EntityAttributeModifier(BeyondMinecraft.id("scale"), scale - 1,
            EntityAttributeModifier.Operation.ADD_MULTIPLIED_TOTAL));
        player.calculateDimensions();
        player.fallDistance = 0;
        message(player, "Your scale: " + scale + "×"); return true;
    }
    public static int clear(ServerPlayerEntity player) {
        List<Anomaly> nodes = ANOMALIES.getOrDefault(player.getWorld().getRegistryKey(), List.of());
        int count = nodes.size(); ANOMALIES.remove(player.getWorld().getRegistryKey());
        for (ServerPlayerEntity p : player.getServerWorld().getPlayers()) sync(p, false);
        return count;
    }
    public static void message(ServerPlayerEntity player, String text) { player.sendMessage(Text.literal(text).formatted(Formatting.AQUA), true); }
}
