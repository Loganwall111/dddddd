package dev.logan.entersift;

import com.mojang.brigadier.arguments.StringArgumentType;
import com.mojang.brigadier.builder.LiteralArgumentBuilder;
import net.fabricmc.fabric.api.command.v2.CommandRegistrationCallback;
import net.minecraft.ChatFormatting;
import net.minecraft.commands.CommandSourceStack;
import net.minecraft.commands.Commands;
import net.minecraft.network.chat.Component;
import net.minecraft.server.level.ServerLevel;

/**
 * 0.22 {@code /sifttide} — pick the Sift's tide and its skybox, independently of the automatic day/night
 * cycle that used to drag the sky along with the time of day. {@code /sift tide ...} is accepted too.
 *
 *   /sifttide flow            the wavy mint dome (day)
 *   /sifttide thrive          the rose sky with thousands of god rays (near night)
 *   /sifttide lava_lamp       the shipped lava-lamp sky (the old cycle)
 *   /sifttide change <tide>   same as above (the spelling from the feature request)
 *   /sifttide cycle on|off    let the clock drive the sky again / lock the current tide
 *   /sifttide time <ticks|day|noon|evening|night|midnight>
 *   /sifttide info            what is set right now
 */
public final class SiftTideCommand {
    private SiftTideCommand() {}

    private static final String[] TIDE_NAMES = {"flow", "thrive", "lava_lamp"};
    private static final String[] TIME_NAMES = {"day", "noon", "evening", "night", "midnight"};

    public static void register() {
        CommandRegistrationCallback.EVENT.register((dispatcher, registryAccess, environment) -> {
            dispatcher.register(Commands.literal("sifttide").then(tideNode()));
            // "/sift tide ..." as well, so both spellings work.
            dispatcher.register(Commands.literal("sift").then(tideNode()));
        });
    }

    private static LiteralArgumentBuilder<CommandSourceStack> tideNode() {
        LiteralArgumentBuilder<CommandSourceStack> root = Commands.literal("tide");
        root.then(Commands.literal("info").executes(ctx -> { info(ctx.getSource()); return 1; }));
        for (String alias : new String[]{"set", "change"}) {
            root.then(Commands.literal(alias)
                .then(Commands.argument("tide", StringArgumentType.word()).suggests(TIDE_NAMES)
                    .executes(ctx -> {
                        String name = StringArgumentType.getString(ctx, "tide");
                        SiftTide tide = SiftTide.byName(name);
                        CommandSourceStack src = ctx.getSource();
                        ServerLevel level = src.getLevel();
                        if (tide == null) {
                            say(src, Component.literal("Unknown tide '" + name + "'. Try: " + SiftTide.names())
                                .withStyle(ChatFormatting.RED));
                            return 0;
                        }
                        SiftTideServer.set(level, tide);
                        say(src, Component.literal("Sift tide: ").withStyle(ChatFormatting.GRAY)
                            .append(Component.literal(tide.tide).withStyle(ChatFormatting.AQUA))
                            .append(Component.literal("  (time " + tide.ticks + ")").withStyle(ChatFormatting.DARK_GRAY)));
                        return 1;
                    }));
        }
        root.then(Commands.literal("cycle")
            .then(Commands.literal("on").executes(ctx -> {
                SiftTideServer.setCycling(ctx.getSource().getLevel(), true);
                say(ctx.getSource(), Component.literal("Sift tide: the clock drives the sky again.").withStyle(ChatFormatting.AQUA));
                return 1;
            }))
            .then(Commands.literal("off").executes(ctx -> {
                SiftTideServer.setCycling(ctx.getSource().getLevel(), false);
                say(ctx.getSource(), Component.literal("Sift tide locked to the time of day.").withStyle(ChatFormatting.AQUA));
                return 1;
            })));
        root.then(Commands.literal("time")
            .then(Commands.argument("when", StringArgumentType.word()).suggests(TIME_NAMES)
                .executes(ctx -> {
                    String when = StringArgumentType.getString(ctx, "when").toLowerCase(java.util.Locale.ROOT);
                    long ticks = switch (when) {
                        case "day" -> 1000L;
                        case "noon" -> 6000L;
                        case "evening" -> 12000L;
                        case "night" -> 13000L;
                        case "midnight" -> 18000L;
                        default -> -1L;
                    };
                    if (ticks < 0L) {
                        try { ticks = Long.parseLong(when); } catch (NumberFormatException ignored) { ticks = -1L; }
                    }
                    if (ticks < 0L) {
                        say(ctx.getSource(), Component.literal("Use day, noon, evening, night, midnight or a tick count.")
                            .withStyle(ChatFormatting.RED));
                        return 0;
                    }
                    SiftTideServer.setTime(ctx.getSource().getLevel(), ticks);
                    say(ctx.getSource(), Component.literal("Sift clock set to ").withStyle(ChatFormatting.GRAY)
                        .append(Component.literal(Long.toString(ticks)).withStyle(ChatFormatting.AQUA)));
                    return 1;
                })));
        root.then(Commands.literal("flow").executes(ctx -> { quick(ctx.getSource(), SiftTide.FLOW); return 1; }));
        root.then(Commands.literal("thrive").executes(ctx -> { quick(ctx.getSource(), SiftTide.THRIVE); return 1; }));
        root.then(Commands.literal("lava_lamp").executes(ctx -> { quick(ctx.getSource(), SiftTide.LAVA_LAMP); return 1; }));
        return root;
    }

    private static void quick(CommandSourceStack src, SiftTide tide) {
        SiftTideServer.set(src.getLevel(), tide);
        say(src, Component.literal("Sift tide: ").withStyle(ChatFormatting.GRAY)
            .append(Component.literal(tide.tide).withStyle(ChatFormatting.AQUA)));
    }

    private static void info(CommandSourceStack src) {
        say(src, Component.literal("Sift tide: ").withStyle(ChatFormatting.GRAY)
            .append(Component.literal(SiftTideServer.tide().tide).withStyle(ChatFormatting.AQUA))
            .append(Component.literal("  cycle: ").withStyle(ChatFormatting.GRAY))
            .append(Component.literal(SiftTideServer.locked() ? "locked (off)" : "on").withStyle(ChatFormatting.WHITE)));
    }

    /** Command feedback through the vanilla API (no raw JSON, nothing can be mis-escaped). */
    private static void say(CommandSourceStack src, Component message) {
        try {
            src.sendSuccess(() -> message, false);
        } catch (Throwable error) {
            EnterTheSift.LOGGER.info("Sift tide: {}", message.getString());
        }
    }
}
