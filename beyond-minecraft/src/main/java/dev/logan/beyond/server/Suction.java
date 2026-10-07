package dev.logan.beyond.server;

import dev.logan.beyond.BeyondMinecraft;
import dev.logan.beyond.math.Gravity;
import dev.logan.beyond.math.Vec;
import net.minecraft.block.Block;
import net.minecraft.block.BlockState;
import net.minecraft.block.Blocks;
import net.minecraft.entity.Entity;
import net.minecraft.entity.FallingBlockEntity;
import net.minecraft.entity.ItemEntity;
import net.minecraft.entity.LivingEntity;
import net.minecraft.entity.player.PlayerEntity;
import net.minecraft.particle.ParticleTypes;
import net.minecraft.server.network.ServerPlayerEntity;
import net.minecraft.server.world.ServerWorld;
import net.minecraft.sound.SoundCategory;
import net.minecraft.sound.SoundEvents;
import net.minecraft.util.math.BlockPos;
import net.minecraft.util.math.Box;
import net.minecraft.util.math.Vec3d;
import java.util.List;
import java.util.Random;

/**
 * Everything that falls in. Gravity is a softened inverse-square pull with a hard entity budget;
 * the tornado detaches bounded numbers of real blocks and trees; consumption grows the well.
 * Consumption removes entities (items, creatures) and is what a black hole does — this is a
 * deliberate, configurable gameplay destruction budget, not terrain simulation.
 */
public final class Suction {
    /** Trees are detached whole rather than block by block, so a forest comes away in pieces. */
    private static final int TREE_COLUMN = 6;
    private static final Random RANDOM = new Random();
    private Suction() {}

    public static void attract(ServerWorld world, Anomaly node) {
        var config = BeyondMinecraft.CONFIG;
        boolean prime = node.kind == Anomaly.Kind.PRIME;
        boolean repulsive = node.kind == Anomaly.Kind.QUASAR;
        double reach = prime ? node.radius * 2.15 : Math.max(config.gravityRadius, node.radius * 3.2);
        double strength = prime ? config.gravityStrength * .55 : config.gravityStrength;
        var candidates = world.getOtherEntities(null, new Box(node.center.subtract(reach, reach, reach), node.center.add(reach, reach, reach)),
            e -> !e.isSpectator() && !e.hasVehicle() && (e instanceof LivingEntity || e instanceof ItemEntity || e instanceof FallingBlockEntity));
        int budget = 128;
        for (Entity entity : candidates) {
            if (--budget < 0) break;
            if (entity instanceof ServerPlayerEntity player) {
                boolean allowed = prime ? config.primePullsPlayers : player.getUuid().equals(node.owner);
                if (!allowed || player.isCreative() && player.getAbilities().flying || Journey.of(player).travelCooldown > 0) continue;
            } else if (node.owner != null && !config.pullMobs) continue;
            double distance = entity.getPos().distanceTo(node.center);
            Vec after = Gravity.integrate(vec(entity.getPos()), vec(entity.getVelocity()), vec(node.center), node.radius, reach,
                strength, config.maximumSpeed * (prime ? 1.35 : 1.0));
            if (repulsive) after = new Vec(-after.x(), -after.y(), -after.z());
            entity.setVelocity(after.x(), after.y(), after.z());
            entity.velocityModified = true;
            entity.fallDistance = 0;
            double horizon = node.radius * 1.06;
            if (distance < horizon) consume(world, node, entity);
        }
    }

    public static void consume(ServerWorld world, Anomaly node, Entity entity) {
        if (entity instanceof ServerPlayerEntity player) {
            RealityManager.consumedByWell(player, node);
            return;
        }
        node.consume(.02 * (entity instanceof LivingEntity ? 3.0 : 1.0), BeyondMinecraft.CONFIG.maxNodeRadius);
        world.spawnParticles(ParticleTypes.REVERSE_PORTAL, entity.getX(), entity.getY() + entity.getHeight() * .5, entity.getZ(),
            18, .3, .5, .3, .12);
        world.spawnParticles(ParticleTypes.END_ROD, entity.getX(), entity.getY(), entity.getZ(), 6, .2, .2, .2, .08);
        world.playSound(null, entity.getX(), entity.getY(), entity.getZ(), SoundEvents.ENTITY_ENDERMAN_TELEPORT, SoundCategory.HOSTILE, .35f, .45f);
        entity.discard();
    }

    /**
     * The tornado: real blocks and whole trees are torn loose and become falling-block entities,
     * which are then themselves pulled in and consumed. Budgeted per tick and per anomaly, and it
     * never touches containers, fluids, bedrock-class blocks or protected block entities.
     */
    public static void tornado(ServerWorld world, Anomaly node) {
        var config = BeyondMinecraft.CONFIG;
        if (!config.tornadoBlocks || config.tornadoBlocksPerTick <= 0) return;
        if (node.torn >= config.tornadoBlockBudget) return;
        int radius = Math.min(config.tornadoRadiusBlocks, Math.max(6, (int) (node.radius * 2.2)));
        BlockPos center = BlockPos.ofFloored(node.center);
        for (int attempt = 0; attempt < config.tornadoBlocksPerTick * 3 && node.torn < config.tornadoBlockBudget; attempt++) {
            int dx = RANDOM.nextInt(radius * 2 + 1) - radius;
            int dz = RANDOM.nextInt(radius * 2 + 1) - radius;
            int dy = RANDOM.nextInt(24) - 16;
            BlockPos pos = center.add(dx, dy, dz);
            if (!world.isChunkLoaded(pos) || new Vec3d(pos.getX(), pos.getY(), pos.getZ()).distanceTo(node.center) > radius) continue;
            BlockState state = world.getBlockState(pos);
            if (!tearable(world, pos, state)) continue;
            if (RANDOM.nextBoolean()) {
                detach(world, node, pos, state, config);
            } else {
                // A tree: take the column above a trunk so wood and leaves go up together.
                for (int i = 0; i < TREE_COLUMN && node.torn < config.tornadoBlockBudget; i++) {
                    BlockPos next = pos.up(i);
                    BlockState above = world.getBlockState(next);
                    if (!tearable(world, next, above)) break;
                    detach(world, node, next, above, config);
                }
            }
        }
    }

    private static void detach(ServerWorld world, Anomaly node, BlockPos pos, BlockState state, ServerConfig config) {
        world.setBlockState(pos, Blocks.AIR.getDefaultState(), Block.NOTIFY_ALL);
        FallingBlockEntity falling = FallingBlockEntity.spawnFromBlock(world, pos, state);
        falling.setVelocity((RANDOM.nextDouble() - .5) * .35, .32 + RANDOM.nextDouble() * .25, (RANDOM.nextDouble() - .5) * .35);
        falling.velocityModified = true;
        node.absorbBlock(.035, config.maxNodeRadius, config.tornadoBlockBudget);
    }

    private static boolean tearable(ServerWorld world, BlockPos pos, BlockState state) {
        if (state.isAir() || state.isLiquid()) return false;
        if (state.isOf(Blocks.BEDROCK) || state.isOf(Blocks.BARRIER) || state.isOf(Blocks.COMMAND_BLOCK)
            || state.isOf(Blocks.CHAIN_COMMAND_BLOCK) || state.isOf(Blocks.REPEATING_COMMAND_BLOCK) || state.isOf(Blocks.STRUCTURE_BLOCK)) return false;
        if (state.getHardness(world, pos) < 0) return false;
        return world.getBlockEntity(pos) == null;
    }

    private static Vec vec(Vec3d v) { return new Vec(v.x, v.y, v.z); }
}
