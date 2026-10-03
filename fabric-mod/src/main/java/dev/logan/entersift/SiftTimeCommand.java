package dev.logan.entersift;

import com.mojang.brigadier.arguments.StringArgumentType;
import com.mojang.brigadier.builder.LiteralArgumentBuilder;
import net.fabricmc.fabric.api.command.v2.CommandRegistrationCallback;
import net.minecraft.ChatFormatting;
import net.minecraft.commands.CommandSourceStack;
import net.minecraft.commands.Commands;
import net.minecraft.network.chat.Component;

import java.util.Locale;

/**
 * Registers the {@code /sift time} command family for controlling the
 * Sift's independent atmospheric & Rift time-state system:
 * <ul>
 *   <li>{@code /sift time set flow}</li>
 *   <li>{@code /sift time set thrive}</li>
 *   <li>{@code /sift time set lymph} (or {@code lava_lamp})</li>
 *   <li>{@code /sift time} / {@code /sift time query}</li>
 *   <li>{@code /sift time cycle on|off}</li>
 * </ul>
 */
public final class SiftTimeCommand {
    private SiftTimeCommand() {}

    private static final String[] STATE_LITERALS = {
        "flow", "thrive", "lymph", "lava_lamp", "lavalamp", "legacy", "pulse"
    };

    public static void register() {
        CommandRegistrationCallback.EVENT.register((dispatcher, registryAccess, environment) -> {
            dispatcher.register(
                Commands.literal("sift")
                    .executes(ctx -> queryState(ctx.getSource()))
                    .then(buildTimeBranch("time"))
            );
            dispatcher.register(buildTimeBranch("sifttime"));
        });
    }

    private static LiteralArgumentBuilder<CommandSourceStack> buildTimeBranch(String nodeName) {
        LiteralArgumentBuilder<CommandSourceStack> timeNode = Commands.literal(nodeName)
            .executes(ctx -> queryState(ctx.getSource()))
            .then(Commands.literal("query").executes(ctx -> queryState(ctx.getSource())))
            .then(Commands.literal("info").executes(ctx -> queryState(ctx.getSource())));

        LiteralArgumentBuilder<CommandSourceStack> setNode = Commands.literal("set");
        for (String lit : STATE_LITERALS) {
            setNode.then(Commands.literal(lit).executes(ctx -> applyState(ctx.getSource(), lit)));
        }
        setNode.then(
            Commands.argument("state", StringArgumentType.word())
                .executes(ctx -> applyState(ctx.getSource(), StringArgumentType.getString(ctx, "state")))
        );
        timeNode.then(setNode);

        // Also allow direct `/sift time <state>` shorthand
        for (String lit : STATE_LITERALS) {
            timeNode.then(Commands.literal(lit).executes(ctx -> applyState(ctx.getSource(), lit)));
        }

        timeNode.then(
            Commands.literal("cycle")
                .then(Commands.literal("on").executes(ctx -> setCycle(ctx.getSource(), true)))
                .then(Commands.literal("off").executes(ctx -> setCycle(ctx.getSource(), false)))
        );

        return timeNode;
    }

    private static int applyState(CommandSourceStack source, String stateName) {
        SiftTimeState.State target = SiftTimeState.State.byName(stateName);
        if (target == null) {
            source.sendFailure(Component.literal(
                "Unknown Sift time state '" + stateName + "'. Expected: flow, thrive, or lymph (lava_lamp)."
            ));
            return 0;
        }
        SiftTimeState.setState(target, false);
        SiftTimeState.Parameters p = target.params;
        source.sendSuccess(
            () -> Component.literal("Sift time state set to ")
                .withStyle(ChatFormatting.AQUA)
                .append(Component.literal(target.id.toUpperCase(Locale.ROOT)).withStyle(ChatFormatting.BOLD, ChatFormatting.WHITE))
                .append(Component.literal(" — " + target.description
                    + String.format(Locale.ROOT, " [godRays=%.2f, riftGlow=%.2f, distortion=%.2f]",
                        p.godRayIntensity(), p.riftGlowIntensity(), p.backDistortionStrength()))
                    .withStyle(ChatFormatting.GRAY)),
            true
        );
        return 1;
    }

    private static int setCycle(CommandSourceStack source, boolean enable) {
        SiftTimeState.setAutoCycle(enable);
        SiftTimeState.State current = SiftTimeState.getState();
        source.sendSuccess(
            () -> Component.literal("Sift independent time cycle " + (enable ? "ENABLED" : "LOCKED")
                + " (active state: " + current.id.toUpperCase(Locale.ROOT) + ")").withStyle(ChatFormatting.AQUA),
            true
        );
        return 1;
    }

    private static int queryState(CommandSourceStack source) {
        SiftTimeState.State current = SiftTimeState.getState();
        SiftTimeState.Parameters p = SiftTimeState.currentParameters();
        long clock = SiftTimeState.getIndependentClockTicks(0f);
        boolean locked = SiftTimeState.isLocked();
        source.sendSuccess(
            () -> Component.literal("Sift time state: ")
                .withStyle(ChatFormatting.AQUA)
                .append(Component.literal(current.id.toUpperCase(Locale.ROOT)).withStyle(ChatFormatting.BOLD, ChatFormatting.WHITE))
                .append(Component.literal(String.format(
                    Locale.ROOT,
                    " (%s, mode=%s, siftClock=%d, godRays=%.2f, riftGlow=%.2f, darkBands=%.2f)",
                    current.description,
                    locked ? "locked" : "cycling",
                    clock,
                    p.godRayIntensity(),
                    p.riftGlowIntensity(),
                    p.darkBandOpacity()
                )).withStyle(ChatFormatting.GRAY)),
            false
        );
        return 1;
    }
}
