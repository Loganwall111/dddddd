package dev.logan.entersift;

import com.mojang.brigadier.arguments.StringArgumentType;
import com.mojang.brigadier.builder.LiteralArgumentBuilder;
import net.fabricmc.fabric.api.command.v2.CommandRegistrationCallback;
import net.minecraft.commands.CommandSourceStack;
import net.minecraft.commands.Commands;
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
            dispatcher.register(build("sifttide"));
            // "/sift tide ..." as well, so both spellings work.
            dispatcher.register(Commands.literal("sift").then(tideNode()));
        });
    }

    private static LiteralArgumentBuilder<CommandSourceStack> build(String name) {
        return Commands.literal(name).then(tideNode());
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
                            say(src, "{\"text\":\"\",\"extra\":[{\"text\":\"Unknown tide '\",\"color\":\"red\"},"
                                + "{\"text\":\"" + name + "\",\"color\":\"white\"},"
                                + "{\"text\":\"'. Try: " + SiftTide.names() + "\",\"color\":\"red\"}]}");
                            return 0;
                        }
                        SiftTideServer.set(level, tide);
                        say(src, "{\"text\":\"\",\"extra\":[{\"text\":\"Sift tide: \",\"color\":\"gray\"},"
                            + "{\"text\":\"" + tide.tide + "\",\"color\":\"aqua\"},"
                            + "{\"text\":\"  (time \" + tide.ticks + ")\",\"color\":\"dark_gray\"}]}");
                        return 1;
                    }));
        }
        root.then(Commands.literal("cycle")
            .then(Commands.literal("on").executes(ctx -> {
                SiftTideServer.setCycling(ctx.getSource().getLevel(), true);
                say(ctx.getSource(), "{\"text\":\"Sift tide: the clock drives the sky again.\",\"color\":\"aqua\"}");
                return 1;
            }))
            .then(Commands.literal("off").executes(ctx -> {
                SiftTideServer.setCycling(ctx.getSource().getLevel(), false);
                say(ctx.getSource(), "{\"text\":\"Sift tide locked to the time of day.\",\"color\":\"aqua\"}");
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
                        say(ctx.getSource(), "{\"text\":\"Use day, noon, evening, night, midnight or a tick count.\",\"color\":\"red\"}");
                        return 0;
                    }
                    SiftTideServer.setTime(ctx.getSource().getLevel(), ticks);
                    say(ctx.getSource(), "{\"text\":\"\",\"extra\":[{\"text\":\"Sift clock set to \",\"color\":\"gray\"},"
                        + "{\"text\":\"" + ticks + "\",\"color\":\"aqua\"}]}");
                    return 1;
                })));
        root.then(Commands.literal("flow").executes(ctx -> { SiftTideServer.set(ctx.getSource().getLevel(), SiftTide.FLOW); say(ctx.getSource(), "{\"text\":\"Sift tide: flow (the wavy mint dome).\",\"color\":\"aqua\"}"); return 1; }));
        root.then(Commands.literal("thrive").executes(ctx -> { SiftTideServer.set(ctx.getSource().getLevel(), SiftTide.THRIVE); say(ctx.getSource(), "{\"text\":\"Sift tide: thrive (rose sky, god rays).\",\"color\":\"aqua\"}"); return 1; }));
        root.then(Commands.literal("lava_lamp").executes(ctx -> { SiftTideServer.set(ctx.getSource().getLevel(), SiftTide.LAVA_LAMP); say(ctx.getSource(), "{\"text\":\"Sift tide: lava_lamp (the shipped sky).\",\"color\":\"aqua\"}"); return 1; }));
        return root;
    }

    private static void info(CommandSourceStack src) {
        say(src, "{\"text\":\"\",\"extra\":[{\"text\":\"Sift tide: \",\"color\":\"gray\"},{\"text\":\""
            + SiftTideServer.tide().tide + "\",\"color\":\"aqua\"},{\"text\":\"  cycle: \",\"color\":\"gray\"},{\"text\":\""
            + (SiftTideServer.locked() ? "locked (off)" : "on") + "\",\"color\":\"white\"}]}");
    }

    /** Broadcasts raw JSON through the command dispatcher; no chat APIs are used, so nothing can break. */
    private static void say(CommandSourceStack src, String json) {
        try {
            src.getServer().getCommands().performPrefixedCommand(src.withSuppressedOutput(), "tellraw @a " + json);
        } catch (Throwable ignored) { }
    }
}
