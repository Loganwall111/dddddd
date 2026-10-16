package dev.logan.entersift;

import java.util.HashMap;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import net.fabricmc.fabric.api.event.lifecycle.v1.ServerLifecycleEvents;
import net.fabricmc.fabric.api.event.lifecycle.v1.ServerTickEvents;
import net.minecraft.core.BlockPos;
import net.minecraft.core.registries.Registries;
import net.minecraft.resources.ResourceKey;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.tags.BlockTags;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.levelgen.Heightmap;

/** Surface arrival, independent of the old ritual plaza. Never excavates or builds a sky pad. */
public final class RiftTravel {
    private record Appearance(int type, float width, float height) {}
    private static final Map<UUID, Appearance> looks = new HashMap<>();
    private static final Map<UUID, Integer> search = new HashMap<>();
    private RiftTravel() {}

    public static void remember(ServerPlayer player, RiftPortalEntity rift) {
        looks.put(player.getUUID(), new Appearance(rift.riftType().id, rift.riftWidth(), rift.riftHeight()));
        search.remove(player.getUUID());
    }

    public static void register() {
        ServerLifecycleEvents.SERVER_STOPPED.register(server -> { looks.clear(); search.clear(); });
        ServerTickEvents.END_SERVER_TICK.register(server -> {
            for (ServerPlayer player : server.getPlayerList().getPlayers()) {
                for (int dest = 0; dest < 4; dest++) {
                    String tag = "sift.arrive_" + dest;
                    if (!player.entityTags().contains(tag)) continue;
                    var key = switch (dest) {
                        case 0 -> Level.OVERWORLD;
                        case 1 -> Level.NETHER;
                        case 2 -> Level.END;
                        default -> ResourceKey.create(Registries.DIMENSION, SiftContent.id("the_sift"));
                    };
                    ServerLevel level = server.getLevel(key);
                    if (level == null) continue;
                    int index = search.getOrDefault(player.getUUID(), 0);
                    if (index >= 289) {
                        if (index == 289) EnterTheSift.runAs(player, "title @s actionbar {\"text\":\"No safe clearing found. Walk back to retry.\",\"color\":\"gold\"}");
                        search.put(player.getUUID(), player.getZ() < 28 ? 0 : 290);
                        continue;
                    }
                    // One bounded candidate per tick, expanding out from origin; no unbounded chunk scan.
                    int ring = (int) Math.ceil((Math.sqrt(index + 1) - 1) / 2);
                    int side = Math.max(1, ring * 2), offset = index - (2 * ring - 1) * (2 * ring - 1);
                    int x = 0, z = 0;
                    if (ring > 0) {
                        int edge = offset / side, along = offset % side;
                        x = switch (edge) { case 0 -> -ring + along; case 1 -> ring; case 2 -> ring - along; default -> -ring; };
                        z = switch (edge) { case 0 -> -ring; case 1 -> -ring + along; case 2 -> ring; default -> ring - along; };
                    }
                    search.put(player.getUUID(), index + 1);
                    BlockPos feet = surface(level, x * 8, z * 8, dest == 1);
                    if (feet == null) continue;
                    Appearance look = looks.getOrDefault(player.getUUID(), new Appearance(dest, 7, 5));
                    String dimension = key.identifier().toString();
                    EnterTheSift.runAs(player, String.format(Locale.ROOT,
                        "execute in %s run tp @s %.2f %d %.2f 0 0", dimension, feet.getX() + .5, feet.getY(), feet.getZ() + 2.5));
                    // Same stepped rift, not the cyan ritual portal. It remains behind the traveller briefly.
                    EnterTheSift.runAs(player, String.format(Locale.ROOT,
                        "summon entersift:rift_portal %.2f %d %.2f {Tags:[\"sift.arrival\"],RiftType:%d,Width:%ff,Height:%ff,Age:100,LifeTicks:60,Rotation:[0f,0f]}",
                        feet.getX() + .5, feet.getY(), feet.getZ() + .5, look.type, look.width, look.height));
                    EnterTheSift.runAs(player, "scoreboard players set @s sift.cooldown 100");
                    EnterTheSift.runAs(player, "scoreboard players set @s sift.transit 0");
                    player.removeTag(tag);
                    looks.remove(player.getUUID()); search.remove(player.getUUID());
                }
            }
            var online = server.getPlayerList().getPlayers().stream().map(ServerPlayer::getUUID).collect(java.util.stream.Collectors.toSet());
            looks.keySet().retainAll(online); search.keySet().retainAll(online);
        });
    }

    private static BlockPos surface(ServerLevel level, int x, int z, boolean nether) {
        int top = level.getHeight(Heightmap.Types.MOTION_BLOCKING_NO_LEAVES, x, z);
        // Nether has no outdoor surface: find an open dry shelf below bedrock, never land on its roof.
        int bottom = nether ? 32 : top;
        if (nether) top = Math.min(top, 118);
        for (int y = top; y >= bottom; y--) {
            BlockPos feet = new BlockPos(x, y, z);
            if (!nether && !level.canSeeSky(feet)) continue;
            boolean safe = true;
            for (int dx = -1; dx <= 1 && safe; dx++) for (int dz = 1; dz <= 3 && safe; dz++) {
                BlockPos ground = feet.offset(dx, -1, dz);
                var state = level.getBlockState(ground);
                safe = state.isFaceSturdy(level, ground, net.minecraft.core.Direction.UP)
                    && state.getFluidState().isEmpty() && !state.is(BlockTags.LEAVES)
                    && !state.is(Blocks.MAGMA_BLOCK) && !state.is(Blocks.CACTUS) && !state.is(Blocks.CAMPFIRE);
            }
            // Enough room for the full rift and the player's exit; plants with empty collision are fine.
            for (int dx = -5; dx <= 5 && safe; dx++) for (int dz = -1; dz <= 3 && safe; dz++)
                for (int dy = 0; dy < 7 && safe; dy++) {
                    BlockPos pos = feet.offset(dx, dy, dz);
                    var state = level.getBlockState(pos);
                    safe = state.getCollisionShape(level, pos).isEmpty() && state.getFluidState().isEmpty()
                        && !state.is(Blocks.FIRE) && !state.is(Blocks.SOUL_FIRE) && !state.is(Blocks.SWEET_BERRY_BUSH);
                }
            if (safe) return feet;
        }
        return null;
    }
}
