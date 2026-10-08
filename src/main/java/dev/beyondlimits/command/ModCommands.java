package dev.beyondlimits.command;

import com.mojang.brigadier.arguments.IntegerArgumentType;
import dev.beyondlimits.world.RealityState;
import dev.beyondlimits.world.RiftShrine;
import net.fabricmc.fabric.api.command.v2.CommandRegistrationCallback;
import net.minecraft.server.network.ServerPlayerEntity;
import net.minecraft.server.world.ServerWorld;
import net.minecraft.text.Text;
import net.minecraft.util.math.BlockPos;
import net.minecraft.world.World;

import static net.minecraft.server.command.CommandManager.argument;
import static net.minecraft.server.command.CommandManager.literal;

public final class ModCommands {
    private ModCommands() {
    }

    public static void register() {
        CommandRegistrationCallback.EVENT.register((dispatcher, registryAccess, environment) -> dispatcher.register(
                literal("beyondlimits")
                        .then(literal("status").executes(context -> {
                            RealityState state = RealityState.get(context.getSource().getWorld());
                            context.getSource().sendFeedback(() -> Text.literal(
                                    "[Beyond the Limits] " + state.getPhaseName()
                                            + " — integrity " + state.getStability() + "%"
                                            + " | seams " + state.getRiftsOpened()
                                            + " | sightings " + state.getObserverSightings()), false);
                            return 1;
                        }))
                        .then(literal("rift")
                                .requires(source -> source.hasPermissionLevel(2))
                                .executes(context -> {
                                    ServerPlayerEntity player = context.getSource().getPlayerOrThrow();
                                    ServerWorld world = context.getSource().getWorld();
                                    if (!world.getRegistryKey().equals(World.OVERWORLD)) {
                                        context.getSource().sendError(Text.literal("Open a test seam from the Overworld."));
                                        return 0;
                                    }
                                    BlockPos floor = player.getBlockPos().down();
                                    BlockPos portal = RiftShrine.build(world, floor, 3);
                                    RealityState state = RealityState.get(world);
                                    state.recordRift(portal, world.getTime());
                                    state.setNextRiftAt(world.getTime() + 96_000L);
                                    context.getSource().sendFeedback(() -> Text.literal("Test seam forced open at " + portal.toShortString()), false);
                                    return 1;
                                }))
                        .then(literal("reality")
                                .requires(source -> source.hasPermissionLevel(2))
                                .then(literal("set")
                                        .then(argument("value", IntegerArgumentType.integer(0, 100))
                                                .executes(context -> {
                                                    int value = IntegerArgumentType.getInteger(context, "value");
                                                    RealityState state = RealityState.get(context.getSource().getWorld());
                                                    state.setStability(value);
                                                    context.getSource().sendFeedback(() -> Text.literal("Reality integrity set to " + value + "% (" + state.getPhaseName() + ")."), true);
                                                    return 1;
                                                }))))
        ));
    }
}
