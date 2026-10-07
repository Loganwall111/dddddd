package dev.logan.beyond.server;

import dev.logan.beyond.BeyondMinecraft;
import dev.logan.beyond.content.BeyondContent;
import dev.logan.beyond.math.Membrane;
import dev.logan.beyond.math.RealmSeed;
import dev.logan.beyond.math.ScaleLadder;
import dev.logan.beyond.math.Vec;
import dev.logan.beyond.network.RealityPayload;
import net.fabricmc.fabric.api.networking.v1.ServerPlayNetworking;
import net.minecraft.block.Blocks;
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
    private record Sample(RegistryKey<World> world, Vec3d position) {}
    private RealityManager() {}
    public static void reset() {
        ANOMALIES.clear(); PREVIOUS.clear(); SkyWells.reset(); Umbrella.reset(); Anomaly.resetIds();
    }
    public static void disconnect(ServerPlayerEntity player) { PREVIOUS.remove(player.getUuid()); Tunnels.disconnect(player); }
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
        j.travelCooldown = 40;
        sync(player, intro);
    }
    public static void sync(ServerPlayerEntity player, boolean intro) {
        if (!ServerPlayNetworking.canSend(player, RealityPayload.ID)) return;
        RegistryKey<World> key = player.getWorld().getRegistryKey();
        Anomaly prime = SkyWells.of(key);
        var nearby = ANOMALIES.getOrDefault(key, List.of()).stream()
            .filter(a -> a.center.squaredDistanceTo(player.getPos()) < 200 * 200)
            .sorted(Comparator.comparingDouble(a -> a.center.squaredDistanceTo(player.getPos())))
            .limit(RealityPayload.MAX_NODES - (prime == null ? 0 : 1)).toList();
        List<Anomaly> pool = new ArrayList<>();
        // The colossal sky well is never distance-culled: it is the landmark of the world.
        if (prime != null) pool.add(prime);
        pool.addAll(nearby);
        var nodes = pool.stream().limit(RealityPayload.MAX_NODES).map(Anomaly::snapshot).toList();
        ServerPlayNetworking.send(player, new RealityPayload(key.getValue(), intro, Journey.of(player).era,
            Tunnels.remaining(player), nodes));
    }
    public static boolean spawn(ServerPlayerEntity player, boolean blackHole) {
        return spawn(player, blackHole ? Anomaly.Kind.SINGULARITY : Anomaly.Kind.MEMBRANE);
    }
    public static boolean spawn(ServerPlayerEntity player, Anomaly.Kind kind) {
        if (player.isSpectator() || player.hasVehicle()) return false;
        Journey journey = Journey.of(player);
        if (journey.travelCooldown > 0) return false;
        ServerWorld world = player.getServerWorld();
        List<Anomaly> list = ANOMALIES.computeIfAbsent(world.getRegistryKey(), k -> new ArrayList<>());
        if (list.size() >= BeyondMinecraft.CONFIG.maxAnomaliesPerWorld ||
            list.stream().filter(a -> player.getUuid().equals(a.owner)).count() >= BeyondMinecraft.CONFIG.maxAnomaliesPerPlayer) {
            message(player, "Reality is already under strain. Wait for an opening to dissolve."); return false;
        }
        Vec3d look = player.getRotationVec(1);
        boolean membrane = kind.membraneLike();
        Vec3d center = membrane ? player.getPos().add(look.x * 4.5, 1.7 + look.y * 2, look.z * 4.5)
            : player.getEyePos().add(look.multiply(kind == Anomaly.Kind.WORMHOLE ? 6 : 9));
        BlockPos pos = BlockPos.ofFloored(center);
        if (!world.getWorldBorder().contains(pos) || center.y < world.getBottomY() + 5 || center.y > world.getTopY() - 5 ||
            !world.isChunkLoaded(pos) || !world.isSpaceEmpty(new Box(center.x - .7, center.y - 1, center.z - .7, center.x + .7, center.y + 1, center.z + .7))) {
            message(player, "Aim at clear space. A " + (membrane ? "membrane" : "well") + " cannot open inside solid ground."); return false;
        }
        int slot = RealmSeed.slot(world.getSeed(), player.getUuid().getLeastSignificantBits(), journey.cursor++, BeyondMinecraft.CATALOG.realms().size());
        if (journey.cursor < 0) journey.cursor = 0;
        if (kind == Anomaly.Kind.TEAR) {
            int hub = BeyondMinecraft.CATALOG.indexOf("realm_08");
            if (hub >= 0) slot = hub;
        }
        Anomaly node = new Anomaly(player, center, kind, slot, BeyondMinecraft.CONFIG.lifetimeSeconds * 20);
        list.add(node);
        // Sound fields are a mix of SoundEvent and RegistryEntry<SoundEvent>; call each one
        // separately rather than building a conditional expression the compiler cannot type.
        float volume = .7f, pitch = membrane ? .7f : .55f;
        switch (kind) {
            case TEAR -> world.playSound(null, center.x, center.y, center.z, SoundEvents.ENTITY_WARDEN_SONIC_BOOM, SoundCategory.PLAYERS, volume, pitch);
            case WORMHOLE -> world.playSound(null, center.x, center.y, center.z, SoundEvents.BLOCK_PORTAL_TRIGGER, SoundCategory.PLAYERS, volume, pitch);
            case QUASAR -> world.playSound(null, center.x, center.y, center.z, SoundEvents.BLOCK_BEACON_ACTIVATE, SoundCategory.PLAYERS, volume, pitch);
            default -> {
                if (membrane) world.playSound(null, center.x, center.y, center.z, SoundEvents.BLOCK_AMETHYST_BLOCK_RESONATE, SoundCategory.PLAYERS, volume, pitch);
                else world.playSound(null, center.x, center.y, center.z, SoundEvents.BLOCK_RESPAWN_ANCHOR_CHARGE, SoundCategory.PLAYERS, volume, pitch);
            }
        }
        shockwave(world, center, kind);
        for (ServerPlayerEntity p : world.getPlayers()) sync(p, false);
        message(player, switch (kind) {
            case TEAR -> "The fabric tears open onto " + BeyondMinecraft.CATALOG.realms().get(slot).name() + ".";
            case WORMHOLE -> "A wormhole turns toward " + BeyondMinecraft.CATALOG.realms().get(slot).name() + ". Walk in.";
            case QUASAR -> "A quasar opens: this one pushes.";
            default -> (membrane ? "Membrane" : "Singularity") + " → " + BeyondMinecraft.CATALOG.realms().get(slot).name();
        });
        return true;
    }
    /** Openings announce themselves with a real shockwave: a ring of particles and a pressure wave of sound. */
    private static void shockwave(ServerWorld world, Vec3d center, Anomaly.Kind kind) {
        boolean tear = kind == Anomaly.Kind.TEAR;
        for (int i = 0; i < 48; i++) {
            double angle = i * Math.PI * 2 / 48;
            double radius = tear ? 4.5 : 3.0;
            world.spawnParticles(tear ? ParticleTypes.SONIC_BOOM : ParticleTypes.CLOUD,
                center.x + Math.cos(angle) * radius, center.y + Math.sin(angle) * radius * .6, center.z + Math.sin(angle) * radius,
                1, 0, 0, 0, 0);
        }
        world.spawnParticles(ParticleTypes.FLASH, center.x, center.y, center.z, 2, 0, 0, 0, 0);
        // Separate calls: one of these two is a RegistryEntry and one is a SoundEvent.
        if (tear) world.playSound(null, center.x, center.y, center.z, SoundEvents.ENTITY_GENERIC_EXPLODE, SoundCategory.PLAYERS, .6f, .8f);
        else world.playSound(null, center.x, center.y, center.z, SoundEvents.ENTITY_LIGHTNING_BOLT_THUNDER.value(), SoundCategory.PLAYERS, .35f, 1.6f);
    }
    public static void tick(MinecraftServer server) {
        if (server.getTicks() % 40 == 0) SkyWells.ensure(server);
        Umbrella.tick(server);
        for (ServerWorld world : server.getWorlds()) {
            Anomaly well = SkyWells.of(world.getRegistryKey());
            if (well == null) continue;
            well.age++;
            if (well.age > 24) SkyWells.tick(world, well);
        }
        for (ServerPlayerEntity player : server.getPlayerManager().getPlayerList()) {
            Journey journey = Journey.of(player);
            if (journey.travelCooldown > 0) journey.travelCooldown--;
            if (Tunnels.active(player)) { Tunnels.tick(player); PREVIOUS.remove(player.getUuid()); continue; }
            scalePhysics(player);
            Sample before = PREVIOUS.get(player.getUuid());
            if (Journey.inRealm(player.getWorld().getRegistryKey()) && player.getY() < player.getWorld().getBottomY() + 12 && journey.travelCooldown == 0) {
                // Falling through the hub's abyss is the way down into the white maze: the Labyrinth
                // is the layer under the bubble cluster, exactly like the ground under the plate.
                int labyrinth = BeyondMinecraft.CATALOG.indexOf("realm_09");
                boolean hub = player.getWorld().getRegistryKey().getValue().getPath().equals("realm_08");
                if (!hub || labyrinth < 0 || !enter(player, labyrinth)) returnHome(player);
            }
            List<Anomaly> nodes = new ArrayList<>(ANOMALIES.getOrDefault(player.getWorld().getRegistryKey(), List.of()));
            Anomaly prime = SkyWells.of(player.getWorld().getRegistryKey());
            if (prime != null) nodes.add(prime);
            if (!player.isSpectator() && !player.hasVehicle() && journey.travelCooldown == 0) {
                Vec3d body = player.getPos().add(0, player.getHeight() * .5, 0);
                for (Anomaly node : nodes) {
                    if (!node.active()) continue;
                    float rim = node.radius * node.kind.rim;
                    boolean crossed;
                    if (node.kind.membraneLike())
                        crossed = before != null && before.world.equals(player.getWorld().getRegistryKey()) &&
                            before.position.squaredDistanceTo(body) < 400 && Membrane.crossed(vec(before.position), vec(body), vec(node.center), node.yaw, node.radius, rim);
                    else if (node.kind == Anomaly.Kind.QUASAR) crossed = false;
                    else crossed = node.center.distanceTo(body) < node.radius * 1.06;
                    if (crossed) { consumedByWell(player, node); break; }
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
                if (node.kind.lensing && node.active()) {
                    Suction.attract(world, node);
                    Suction.tornado(world, node);
                }
                if (node.age % 5 == 0) fallbackGeometry(world, node);
            }
            entry.getValue().removeIf(Anomaly::expired);
        }
        for (ServerWorld world : server.getWorlds()) {
            Anomaly prime = SkyWells.of(world.getRegistryKey());
            if (prime != null && prime.active()) Suction.attract(world, prime);
        }
    }
    /** A restrained geometry fallback remains visible if shaders are disabled. */
    private static void fallbackGeometry(ServerWorld world, Anomaly node) {
        double phase = node.age * .04;
        int points = node.kind == Anomaly.Kind.PRIME ? 14 : 8;
        for (int i = 0; i < points; i++) {
            double angle = i * Math.PI * 2 / points + phase;
            double x = Math.cos(angle) * node.radius, y = Math.sin(angle) * node.radius * (node.kind.lensing ? .35 : 1.35);
            world.spawnParticles(node.kind.lensing ? ParticleTypes.END_ROD : ParticleTypes.REVERSE_PORTAL,
                node.center.x + x * Math.cos(node.yaw), node.center.y + y, node.center.z + x * Math.sin(node.yaw), 1, 0, 0, 0, 0);
        }
    }
    /** What happens when something reaches the horizon. Players travel; everything else is lost. */
    public static void consumedByWell(ServerPlayerEntity player, Anomaly node) {
        switch (node.kind) {
            case QUASAR -> {
                Vec3d push = player.getPos().subtract(node.center).normalize().multiply(3.4).add(0, 1.4, 0);
                player.setVelocity(push); player.velocityModified = true;
                message(player, "The quasar throws you clear.");
            }
            case WORMHOLE -> {
                if (BeyondMinecraft.CONFIG.wormholeTunnels && Tunnels.begin(player, player.getServerWorld())) {
                    message(player, "You are falling through the time tunnel. Keep walking.");
                } else {
                    Umbrella.shift(player, player.getServerWorld(), player.getPos());
                }
            }
            case PRIME -> {
                int hub = BeyondMinecraft.CATALOG.indexOf("realm_08");
                if (!enter(player, hub >= 0 ? hub : 0)) message(player, "The well refuses to take you.");
            }
            default -> enter(player, node.realm);
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
        // The Umbrella Effect: the branch you return to is the branch you were displaced through.
        Umbrella.shift(player, world, landing.get());
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
        InventoryVault.switchFor(player, player.getWorld().getRegistryKey(), InventoryVault.capture(oldPlayer));
        Journey.of(player).travelCooldown = 80;
        PREVIOUS.remove(player.getUuid()); sync(player, false);
    }
    // ---- scale -------------------------------------------------------------------------------
    public static boolean cycleScale(ServerPlayerEntity player) { return scale(player, ScaleLadder.grow(currentScale(player))); }
    public static boolean grow(ServerPlayerEntity player) { return scale(player, ScaleLadder.grow(currentScale(player))); }
    public static boolean shrink(ServerPlayerEntity player) { return scale(player, ScaleLadder.shrink(currentScale(player))); }
    public static double currentScale(ServerPlayerEntity player) {
        var attribute = player.getAttributeInstance(EntityAttributes.GENERIC_SCALE);
        if (attribute == null) return 1;
        var modifier = attribute.getModifier(BeyondMinecraft.id("scale"));
        return modifier == null ? 1 : modifier.value() + 1;
    }
    public static boolean scale(ServerPlayerEntity player, double scale) {
        if (!ScaleLadder.valid(scale) || player.hasVehicle()) return false;
        var attribute = player.getAttributeInstance(EntityAttributes.GENERIC_SCALE);
        if (attribute == null) return false;
        double current = currentScale(player);
        if (Math.abs(scale - current) < 1e-6) { message(player, "Your scale is already " + ScaleLadder.describe(current) + "."); return false; }
        double ratio = scale / current;
        if (ratio > 1 && !roomToGrow(player, scale)) {
            message(player, scale > ScaleLadder.FULL_SCAN_LIMIT
                ? "A body that size needs open sky above you. Fly clear of terrain first."
                : "Not enough room to grow. Move into open space.");
            return false;
        }
        attribute.removeModifier(BeyondMinecraft.id("scale"));
        if (scale != 1) attribute.addPersistentModifier(new EntityAttributeModifier(BeyondMinecraft.id("scale"), scale - 1,
            EntityAttributeModifier.Operation.ADD_MULTIPLIED_TOTAL));
        player.calculateDimensions();
        player.fallDistance = 0;
        message(player, "Your scale: " + ScaleLadder.describe(scale) + (scale > 64 ? " · you are larger than the clouds" : scale < .05 ? " · a speck between blocks" : ""));
        return true;
    }
    /**
     * Small bodies get a true volume test. Bodies larger than sixteen players are checked by a
     * sampled occupancy scan instead, because a full volume test at 4096x is millions of blocks.
     */
    private static boolean roomToGrow(ServerPlayerEntity player, double scale) {
        Vec3d p = player.getPos();
        double w = player.getWidth() * (scale / currentScale(player)) / 2, h = player.getHeight() * (scale / currentScale(player));
        if (scale <= ScaleLadder.FULL_SCAN_LIMIT) {
            return player.getWorld().isSpaceEmpty(player, new Box(p.x - w, p.y, p.z - w, p.x + w, p.y + h, p.z + w));
        }
        int samples = 6;
        for (int i = 0; i <= samples; i++) {
            for (int j = 0; j <= samples; j++) {
                for (int k = 0; k <= samples; k++) {
                    double x = p.x - w + 2 * w * i / samples, y = p.y + h * j / samples, z = p.z - w + 2 * w * k / samples;
                    var pos = BlockPos.ofFloored(x, y, z);
                    if (pos.getY() <= player.getWorld().getBottomY() || pos.getY() >= player.getWorld().getTopY() - 1) continue;
                    if (player.getWorld().getBlockState(pos).isSolidBlock(player.getWorld(), pos)) return false;
                }
            }
        }
        return true;
    }
    /** A body 1/1024 the size of a player cannot use full gravity steps without tunnelling. */
    private static void scalePhysics(ServerPlayerEntity player) {
        Double cap = ScaleLadder.maximumTickTravel(currentScale(player));
        if (cap == null) return;
        Vec3d velocity = player.getVelocity();
        double speed = velocity.length();
        if (speed > cap) { player.setVelocity(velocity.multiply(cap / speed)); player.velocityModified = true; }
        player.fallDistance = 0;
    }
    public static int clear(ServerPlayerEntity player) {
        List<Anomaly> nodes = ANOMALIES.getOrDefault(player.getWorld().getRegistryKey(), List.of());
        int count = nodes.size(); ANOMALIES.remove(player.getWorld().getRegistryKey());
        for (ServerPlayerEntity p : player.getServerWorld().getPlayers()) sync(p, false);
        return count;
    }
    public static void message(ServerPlayerEntity player, String text) { player.sendMessage(Text.literal(text).formatted(Formatting.AQUA), true); }
}
