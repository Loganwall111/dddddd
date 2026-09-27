package dev.logan.entersift;

import java.util.HashMap;
import java.util.Locale;
import java.util.Map;
import net.fabricmc.api.ModInitializer;
import net.fabricmc.fabric.api.event.lifecycle.v1.ServerLifecycleEvents;
import net.fabricmc.fabric.api.event.lifecycle.v1.ServerTickEvents;
import net.fabricmc.fabric.api.event.player.AttackBlockCallback;
import net.fabricmc.fabric.api.event.player.AttackEntityCallback;
import net.fabricmc.fabric.api.event.player.UseItemCallback;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.Blocks;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public final class EnterTheSift implements ModInitializer {
    public static final Logger LOGGER = LoggerFactory.getLogger("entersift");
    private final Map<String, RitualSequence> rituals = new HashMap<>();
    private final Map<String, Long> openingUntil = new HashMap<>();
    private long ticks;

    public static void runAs(ServerPlayer player, String command) {
        if (!(player.level() instanceof ServerLevel level)) return;
        level.getServer().getCommands().performPrefixedCommand(
            level.getServer().createCommandSourceStack().withSuppressedOutput(),
            "execute as " + player.getUUID() + " at @s run " + command);
    }
    private static void runAt(ServerLevel level, AncientFrame frame, String command) {
        String dimension = level.dimension().identifier().toString();
        String prefix = String.format(Locale.ROOT, "execute in %s positioned %.2f %.2f %.2f run ", dimension, frame.x(), frame.y(), frame.z());
        level.getServer().getCommands().performPrefixedCommand(
            level.getServer().createCommandSourceStack().withSuppressedOutput(), prefix + command);
    }
    @Override public void onInitialize() {
        SiftContent.initialize();
        ServerLifecycleEvents.SERVER_STOPPED.register(server -> { rituals.clear(); openingUntil.clear(); ticks = 0; });
        ServerTickEvents.END_SERVER_TICK.register(server -> {
            ticks++;
            if (ticks % 200 == 0) {
                rituals.values().removeIf(s -> s.expired(ticks));
                openingUntil.values().removeIf(t -> ticks > t);
            }
        });
        AttackBlockCallback.EVENT.register((player, world, hand, pos, direction) -> {
            if (player.isSpectator()) return InteractionResult.PASS;
            if (player.getItemInHand(hand).is(SiftContent.GAUNTLET)) {
                if (player instanceof ServerPlayer sp) runAs(sp, "function entersift:rift/punch");
                return InteractionResult.SUCCESS;
            }
            if (!world.getBlockState(pos).is(Blocks.NOTE_BLOCK)) return InteractionResult.PASS;
            if (world.isClientSide()) {
                String under = BuiltInRegistries.BLOCK.getKey(world.getBlockState(pos.below()).getBlock()).getPath();
                return under.endsWith("_wool") ? InteractionResult.SUCCESS : InteractionResult.PASS;
            }
            if (!(world instanceof ServerLevel level) || !(player instanceof ServerPlayer sp)) return InteractionResult.PASS;
            if (!level.dimension().equals(Level.OVERWORLD)) return InteractionResult.PASS;
            String wool = BuiltInRegistries.BLOCK.getKey(level.getBlockState(pos.below()).getBlock()).getPath();
            if (!wool.endsWith("_wool")) return InteractionResult.PASS;
            AncientFrame frame = AncientFrame.find(level, pos);
            if (frame == null) return InteractionResult.PASS;
            level.blockEvent(pos, Blocks.NOTE_BLOCK, 0, 0);
            String color = wool.substring(0, wool.length() - 5);
            if (java.util.Arrays.asList(RitualSequence.COLORS).contains(color)) {
                runAs(sp, "execute positioned " + pos.getX() + " " + pos.getY() + " " + pos.getZ()
                    + " run function entersift:notes/" + color);
            }
            if (openingUntil.containsKey(frame.key())) return InteractionResult.SUCCESS;
            RitualSequence sequence = rituals.computeIfAbsent(frame.key(), key -> new RitualSequence());
            var result = sequence.play(wool.substring(0, wool.length()-5), pos.getX() + "," + pos.getY() + "," + pos.getZ(), ticks);
            if (result == RitualSequence.Result.COMPLETE) {
                // Marker functions check for an existing portal, so a solved city stays solved after restart.
                runAt(level, frame, "function entersift:ritual/begin");
                double sx = frame.alongX() ? frame.width() - 1 : .07;
                double sz = frame.alongX() ? .07 : frame.width() - 1;
                runAt(level, frame, String.format(Locale.ROOT,
                    "data merge entity @e[type=minecraft:marker,tag=sift.ritual,distance=..1,limit=1,sort=nearest] {data:{sx:%ff,sy:%ff,sz:%ff,tx:%ff,tz:%ff}}",
                    sx, (double) frame.height() - 1, sz, -sx / 2, -sz / 2));
                StringBuilder noteData = new StringBuilder("data merge entity @e[type=minecraft:marker,tag=sift.ritual,distance=..1,limit=1,sort=nearest] {data:{");
                for (int i = 0; i < sequence.completedNotes().size(); i++) {
                    String[] xyz = sequence.completedNotes().get(i).split(",");
                    if (i > 0) noteData.append(',');
                    noteData.append("n").append(i).append("x:").append(xyz[0]).append(",n").append(i).append("y:").append(xyz[1]).append(",n").append(i).append("z:").append(xyz[2]);
                }
                runAt(level, frame, noteData.append("}}").toString());
                openingUntil.put(frame.key(), ticks + 240);
                rituals.remove(frame.key());
            } else {
                String message = result == RitualSequence.Result.RESET ? "The song falters. Begin with red." : "The city listens: " + sequence.progress() + " / 6";
                runAs(sp, "title @s actionbar {\"text\":\"" + message + "\",\"color\":\"aqua\"}");
            }
            return InteractionResult.SUCCESS; // Sound via block event; do not mine the ritual note in creative.
        });
        AttackEntityCallback.EVENT.register((player, level, hand, entity, hit) -> {
            if (!player.isSpectator() && player.getItemInHand(hand).is(SiftContent.GAUNTLET)) {
                if (player instanceof ServerPlayer sp) runAs(sp, "function entersift:rift/punch");
                return InteractionResult.SUCCESS;
            }
            return InteractionResult.PASS;
        });
        UseItemCallback.EVENT.register((player, level, hand) -> {
            if (!player.isSpectator() && player.getItemInHand(hand).is(SiftContent.GAUNTLET)) {
                if (player instanceof ServerPlayer sp) runAs(sp, "function entersift:rift/punch");
                return InteractionResult.SUCCESS;
            }
            return InteractionResult.PASS;
        });
        LOGGER.info("Enter the Sift alpha initialized. Six notes. One threshold.");
    }
}
