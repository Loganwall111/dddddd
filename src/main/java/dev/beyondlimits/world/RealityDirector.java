package dev.beyondlimits.world;

import dev.beyondlimits.ModBlocks;
import dev.beyondlimits.ModDimensions;
import dev.beyondlimits.entity.ModEntities;
import dev.beyondlimits.entity.ObserverEntity;
import dev.beyondlimits.network.RealitySync;
import net.minecraft.entity.EntityType;
import net.fabricmc.fabric.api.event.lifecycle.v1.ServerTickEvents;
import net.fabricmc.fabric.api.networking.v1.ServerPlayConnectionEvents;
import net.minecraft.server.network.ServerPlayerEntity;
import net.minecraft.server.world.ServerWorld;
import net.minecraft.text.Text;
import net.minecraft.util.math.BlockPos;
import net.minecraft.util.math.Box;
import net.minecraft.util.math.MathHelper;
import net.minecraft.util.math.random.Random;
import net.minecraft.world.Heightmap;
import net.minecraft.world.World;

public final class RealityDirector {
    private static final long DAY = 24_000L;

    private RealityDirector() {
    }

    public static void register() {
        ServerTickEvents.END_WORLD_TICK.register(RealityDirector::tick);
        ServerPlayConnectionEvents.JOIN.register((handler, sender, server) -> {
            RealitySync.send(handler.player, RealityState.get(server.getOverworld()));
        });
    }

    private static void tick(ServerWorld world) {
        long time = world.getTime();
        if (world.getRegistryKey().equals(ModDimensions.CODEVERSE)) {
            if (time % 2_400L == 0L && !world.getPlayers().isEmpty()) {
                maybeSpawnFrayling(world);
            }
            return;
        }
        if (!world.getRegistryKey().equals(World.OVERWORLD)) return;
        if (time % 20L != 0L) return;

        RealityState state = RealityState.get(world);
        long day = time / DAY;

        if (day >= 3 && day % 3 == 0 && day > state.getLastDecayDay()) {
            state.setLastDecayDay(day);
            state.adjustStability(-2);
            broadcast(world, Text.literal("The sky shivers. Reality integrity: " + state.getStability() + "%"), true);
        }

        if (!world.getPlayers().isEmpty() && time >= state.getNextRiftAt()) {
            maybeOpenRift(world, state, time);
        }

        if (time % 1_200L == 0L && state.getStability() <= 91) {
            maybeSpawnObserver(world, state);
        }

        if (time % 40L == 0L) {
            for (ServerPlayerEntity player : world.getPlayers()) {
                RealitySync.send(player, state);
            }
        }

        if (state.getStability() <= 60 && time % 100L == 0L) {
            bleedNearbyRift(world, state);
        }
    }

    private static void maybeOpenRift(ServerWorld world, RealityState state, long time) {
        Random random = world.getRandom();
        if (random.nextInt(4) != 0) {
            state.setNextRiftAt(time + 1_200L);
            return;
        }

        ServerPlayerEntity player = world.getPlayers().get(random.nextInt(world.getPlayers().size()));
        BlockPos portal = null;
        for (int attempt = 0; attempt < 18 && portal == null; attempt++) {
            double angle = random.nextDouble() * Math.PI * 2.0;
            int distance = 24 + random.nextInt(25);
            int x = MathHelper.floor(player.getX() + Math.cos(angle) * distance);
            int z = MathHelper.floor(player.getZ() + Math.sin(angle) * distance);
            BlockPos top = world.getTopPosition(Heightmap.Type.MOTION_BLOCKING_NO_LEAVES, new BlockPos(x, 0, z));
            BlockPos floor = top.down();
            if (!world.getBlockState(top).isAir()) continue;
            if (!world.getBlockState(top.up()).isAir()) continue;
            if (!world.getBlockState(floor).isSolidBlock(world, floor)) continue;
            if (!world.getFluidState(top).isEmpty() || !world.getFluidState(floor).isEmpty()) continue;
            portal = RiftShrine.build(world, floor, 0);
        }

        if (portal == null) {
            state.setNextRiftAt(time + 2_400L);
            return;
        }

        state.recordRift(portal, time);
        state.setNextRiftAt(time + (4L + random.nextInt(3)) * DAY);
        broadcast(world, Text.literal("A hairline tear opens nearby. Something on the other side is out of step."), true);
        world.playSound(null, portal, net.minecraft.sound.SoundEvents.BLOCK_END_PORTAL_SPAWN,
                net.minecraft.sound.SoundCategory.AMBIENT, 0.72F, 0.62F);
        world.spawnParticles(net.minecraft.particle.ParticleTypes.PORTAL,
                portal.getX() + 0.5, portal.getY() + 0.5, portal.getZ() + 0.5,
                54, 0.8, 0.9, 0.8, 0.08);
    }

    private static void maybeSpawnFrayling(ServerWorld world) {
        Random random = world.getRandom();
        if (random.nextInt(3) != 0) return;
        Box sanctum = new Box(-48, CodeverseSanctum.PLATFORM_Y - 32, -48,
                48, CodeverseSanctum.PLATFORM_Y + 48, 48);
        long count = world.getEntitiesByClass(ObserverEntity.class, sanctum,
                entity -> entity.getType() == ModEntities.FRAYLING).size();
        if (count >= 6) return;

        ServerPlayerEntity player = world.getPlayers().get(random.nextInt(world.getPlayers().size()));
        double angle = random.nextDouble() * Math.PI * 2.0;
        int distance = 8 + random.nextInt(22);
        double x = player.getX() + Math.cos(angle) * distance;
        double z = player.getZ() + Math.sin(angle) * distance;
        double y = CodeverseSanctum.PLATFORM_Y + 4 + random.nextInt(15);
        ObserverEntity frayling = ModEntities.FRAYLING.create(world);
        if (frayling == null) return;
        frayling.refreshPositionAndAngles(x, y, z, random.nextFloat() * 360.0F, 0.0F);
        frayling.setPersistent();
        if (world.spawnEntity(frayling)) {
            world.spawnParticles(net.minecraft.particle.ParticleTypes.END_ROD, x, y, z,
                    8, 0.25, 0.25, 0.25, 0.015);
        }
    }

    private static void maybeSpawnObserver(ServerWorld world, RealityState state) {
        Random random = world.getRandom();
        if (random.nextInt(3) != 0) return;

        for (ServerPlayerEntity player : world.getPlayers()) {
            if (random.nextInt(8) != 0) continue;
            if (!world.getEntitiesByClass(ObserverEntity.class, player.getBoundingBox().expand(112.0), entity -> true).isEmpty()) {
                continue;
            }

            double angle = random.nextDouble() * Math.PI * 2.0;
            int distance = 30 + random.nextInt(20);
            int x = MathHelper.floor(player.getX() + Math.cos(angle) * distance);
            int z = MathHelper.floor(player.getZ() + Math.sin(angle) * distance);
            BlockPos surface = world.getTopPosition(Heightmap.Type.MOTION_BLOCKING_NO_LEAVES, new BlockPos(x, 0, z));
            if (!world.getBlockState(surface).isAir()) continue;

            EntityType<ObserverEntity> witnessType = state.getStability() <= 60 && random.nextInt(4) == 0
                    ? ModEntities.MIRROR_ECHO : ModEntities.OBSERVER;
            ObserverEntity observer = witnessType.create(world);
            if (observer == null) return;
            observer.refreshPositionAndAngles(x + 0.5, surface.getY() + 2.0, z + 0.5, random.nextFloat() * 360.0F, 0.0F);
            observer.setPersistent();
            if (world.spawnEntity(observer)) {
                state.recordObserverSighting();
                player.sendMessage(Text.literal("A shape stands in the distance. It is not moving with the world."), true);
            }
            return;
        }
    }

    private static void bleedNearbyRift(ServerWorld world, RealityState state) {
        if (!state.hasLastRift()) return;
        BlockPos center = state.getLastRiftPos();
        if (!world.isChunkLoaded(center)) return;
        if (!world.getBlockState(center).isOf(ModBlocks.REALITY_TEAR)) return;
        Random random = world.getRandom();
        int dx = random.nextInt(9) - 4;
        int dz = random.nextInt(9) - 4;
        if (dx * dx + dz * dz < 5) return;
        BlockPos stain = center.add(dx, -1, dz);
        net.minecraft.block.BlockState original = world.getBlockState(stain);
        boolean naturalStone = original.isOf(net.minecraft.block.Blocks.GRASS_BLOCK)
                || original.isOf(net.minecraft.block.Blocks.DIRT)
                || original.isOf(net.minecraft.block.Blocks.STONE);
        if (!naturalStone) return;

        net.minecraft.block.BlockState replacement = ModBlocks.FRACTURED_STONE.getDefaultState();
        if (state.getStability() <= 40) {
            // As the worlds collide, the seam leaves real End and Nether terrain behind.
            replacement = random.nextBoolean()
                    ? net.minecraft.block.Blocks.END_STONE.getDefaultState()
                    : net.minecraft.block.Blocks.NETHERRACK.getDefaultState();
        }
        if (state.getStability() <= 20 && random.nextInt(7) == 0) {
            replacement = net.minecraft.block.Blocks.CRYING_OBSIDIAN.getDefaultState();
        }
        world.setBlockState(stain, replacement, 3);
    }

    private static void broadcast(ServerWorld world, Text message, boolean actionBar) {
        for (ServerPlayerEntity player : world.getPlayers()) {
            player.sendMessage(message, actionBar);
        }
    }
}
