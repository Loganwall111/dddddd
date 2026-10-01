package dev.logan.entersift;

import com.mojang.brigadier.Command;
import net.fabricmc.fabric.api.command.v2.CommandRegistrationCallback;
import net.minecraft.commands.Commands;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.levelgen.Heightmap;

/** Finds outdoor headroom at the actual heightmap, never an arbitrary y=64 or a carved cave. */
public final class RiftArrival {
    private RiftArrival() {}

    public static void register() {
        CommandRegistrationCallback.EVENT.register((dispatcher, context, environment) ->
            dispatcher.register(Commands.literal("sift_arrive").requires(Commands.hasPermission(2)).executes(cmd -> {
                var player = cmd.getSource().getPlayerOrException();
                ServerLevel level = cmd.getSource().getLevel();
                BlockPos landing = find(level);
                if (landing == null) {
                    EnterTheSift.runAs(player, "title @s actionbar {\"text\":\"No clear landing yet. Try the tunnel exit again.\",\"color\":\"gold\"}");
                    return 0;
                }
                EnterTheSift.runAs(player, String.format(java.util.Locale.ROOT,
                    "execute in %s positioned %.1f %d %.1f run function entersift:travel/arrive_at",
                    level.dimension().identifier(), landing.getX()+0.5, landing.getY(), landing.getZ()+0.5));
                return Command.SINGLE_SUCCESS;
            })));
    }

    static BlockPos find(ServerLevel level) {
        // Start away from the End fountain / world origin; inspect nearest columns first.
        for (int ring = 0; ring <= 16; ring++) {
            for (int dx = -ring; dx <= ring; dx++) for (int dz = -ring; dz <= ring; dz++) {
                if (Math.max(Math.abs(dx), Math.abs(dz)) != ring) continue;
                int x = 8 + dx*4, z = 8 + dz*4;
                int top = level.getHeight(Heightmap.Types.MOTION_BLOCKING_NO_LEAVES, x, z);
                if (level.dimension().equals(Level.NETHER)) {
                    // Nether has a bedrock roof: search down for a dry, open floor below it.
                    for (int y = Math.min(118, top); y >= 32; y--) {
                        BlockPos p = new BlockPos(x,y,z);
                        if (clear(level,p)) return p;
                    }
                } else {
                    BlockPos p = new BlockPos(x,top,z);
                    if (clear(level,p)) return p;
                }
            }
        }
        return null; // Keep the player safely in the tunnel, never fall back into the void.
    }

    private static boolean clear(ServerLevel level, BlockPos p) {
        for (int x = -1; x <= 1; x++) for (int z = -1; z <= 1; z++) {
            BlockPos floor = p.offset(x,-1,z);
            var state = level.getBlockState(floor);
            if (!state.isFaceSturdy(level,floor,Direction.UP) || !state.getFluidState().isEmpty()
                || state.is(Blocks.MAGMA_BLOCK) || state.is(Blocks.CACTUS)
                || state.is(Blocks.CAMPFIRE) || state.is(Blocks.SOUL_CAMPFIRE)
                || state.is(net.minecraft.tags.BlockTags.LEAVES)) return false;
            for (int y = 0; y < 6; y++) {
                BlockPos space = p.offset(x,y,z);
                var block = level.getBlockState(space);
                if (!block.getCollisionShape(level,space).isEmpty() || !block.getFluidState().isEmpty()
                    || block.is(Blocks.FIRE) || block.is(Blocks.SOUL_FIRE) || block.is(Blocks.POWDER_SNOW)) return false;
            }
        }
        return true;
    }
}
