package dev.logan.beyond.server;

import com.mojang.brigadier.arguments.DoubleArgumentType;
import com.mojang.brigadier.arguments.IntegerArgumentType;
import dev.logan.beyond.BeyondMinecraft;
import dev.logan.beyond.content.BeyondContent;
import dev.logan.beyond.math.ScaleLadder;
import net.fabricmc.fabric.api.command.v2.CommandRegistrationCallback;
import net.minecraft.item.ItemStack;
import net.minecraft.server.command.CommandManager;
import net.minecraft.text.Text;
import java.util.List;

public final class BeyondCommands {
    private BeyondCommands() {}
    public static void register() {
        CommandRegistrationCallback.EVENT.register((dispatcher, registryAccess, environment) -> dispatcher.register(CommandManager.literal("beyond")
            .executes(ctx -> { ctx.getSource().sendFeedback(() -> Text.literal("Beyond · /beyond return | /beyond where · Operators: kit, rift, singularity, tear, wormhole, quasar, realm, clear, scale, witness, era, well"), false); return 1; })
            .then(CommandManager.literal("return").executes(ctx -> RealityManager.returnHome(ctx.getSource().getPlayerOrThrow()) ? 1 : 0))
            .then(CommandManager.literal("where").executes(ctx -> {
                var p = ctx.getSource().getPlayerOrThrow();
                ctx.getSource().sendFeedback(() -> Text.literal(p.getWorld().getRegistryKey().getValue() + " · inventory: " + Journey.of(p).inventory.active()
                    + " · era: " + Journey.of(p).era + " (" + Umbrella.Era.of(Journey.of(p).era).description + ")"), false); return 1;
            }))
            .then(CommandManager.literal("kit").requires(s -> s.hasPermissionLevel(2)).executes(ctx -> {
                var p = ctx.getSource().getPlayerOrThrow();
                for (var item : List.of(BeyondContent.KNIFE, BeyondContent.RELIC, BeyondContent.TEAR, BeyondContent.GLASSES, BeyondContent.GUIDE, BeyondContent.SCALE)) p.giveItemStack(new ItemStack(item));
                return 1;
            }))
            .then(CommandManager.literal("rift").requires(s -> s.hasPermissionLevel(2)).executes(ctx -> RealityManager.spawn(ctx.getSource().getPlayerOrThrow(), Anomaly.Kind.MEMBRANE) ? 1 : 0))
            .then(CommandManager.literal("singularity").requires(s -> s.hasPermissionLevel(2)).executes(ctx -> RealityManager.spawn(ctx.getSource().getPlayerOrThrow(), Anomaly.Kind.SINGULARITY) ? 1 : 0))
            .then(CommandManager.literal("tear").requires(s -> s.hasPermissionLevel(2)).executes(ctx -> RealityManager.spawn(ctx.getSource().getPlayerOrThrow(), Anomaly.Kind.TEAR) ? 1 : 0))
            .then(CommandManager.literal("wormhole").requires(s -> s.hasPermissionLevel(2)).executes(ctx -> RealityManager.spawn(ctx.getSource().getPlayerOrThrow(), Anomaly.Kind.WORMHOLE) ? 1 : 0))
            .then(CommandManager.literal("quasar").requires(s -> s.hasPermissionLevel(2)).executes(ctx -> RealityManager.spawn(ctx.getSource().getPlayerOrThrow(), Anomaly.Kind.QUASAR) ? 1 : 0))
            .then(CommandManager.literal("clear").requires(s -> s.hasPermissionLevel(2)).executes(ctx -> RealityManager.clear(ctx.getSource().getPlayerOrThrow())))
            .then(CommandManager.literal("witness").requires(s -> s.hasPermissionLevel(2)).executes(ctx -> { RealityManager.sync(ctx.getSource().getPlayerOrThrow(), true); return 1; }))
            .then(CommandManager.literal("well").requires(s -> s.hasPermissionLevel(2)).executes(ctx -> {
                var p = ctx.getSource().getPlayerOrThrow();
                Anomaly well = SkyWells.of(p.getWorld().getRegistryKey());
                if (well == null) { ctx.getSource().sendError(Text.literal("No sky well is installed in this world.")); return 0; }
                ctx.getSource().sendFeedback(() -> Text.literal("Sky well at %s · radius %.1f · consumed %d · %s".formatted(well.center, well.radius, well.consumed, SkyWells.anchor(p.getServerWorld()))), false);
                return 1;
            }))
            .then(CommandManager.literal("era").requires(s -> s.hasPermissionLevel(2))
                .executes(ctx -> { var j = Journey.of(ctx.getSource().getPlayerOrThrow()); ctx.getSource().sendFeedback(() -> Text.literal("Era " + j.era + " · " + Umbrella.Era.of(j.era).description), false); return 1; })
                .then(CommandManager.argument("index", IntegerArgumentType.integer(0, 64)).executes(ctx -> {
                    var p = ctx.getSource().getPlayerOrThrow();
                    Journey j = Journey.of(p);
                    int target = IntegerArgumentType.getInteger(ctx, "index");
                    Umbrella.queue(p.getServerWorld(), p.getBlockPos(), BeyondMinecraft.CONFIG.umbrellaRadius, Umbrella.Era.of(target), j.eraSeed == 0 ? p.getServerWorld().getSeed() : j.eraSeed);
                    j.era = target;
                    RealityManager.message(p, "Era set to " + target + " · " + Umbrella.Era.of(target).description);
                    return 1;
                })))
            .then(CommandManager.literal("realm").requires(s -> s.hasPermissionLevel(2))
                .then(CommandManager.argument("index", IntegerArgumentType.integer(0, BeyondMinecraft.CATALOG.realms().size() - 1))
                    .executes(ctx -> RealityManager.enter(ctx.getSource().getPlayerOrThrow(), IntegerArgumentType.getInteger(ctx, "index")) ? 1 : 0)))
            .then(CommandManager.literal("scale").requires(s -> s.hasPermissionLevel(2))
                .executes(ctx -> { var p = ctx.getSource().getPlayerOrThrow(); RealityManager.message(p, "Scale " + ScaleLadder.describe(RealityManager.currentScale(p)) + " · rungs 1/1024× … 4096×"); return 1; })
                .then(CommandManager.literal("grow").executes(ctx -> RealityManager.grow(ctx.getSource().getPlayerOrThrow()) ? 1 : 0))
                .then(CommandManager.literal("shrink").executes(ctx -> RealityManager.shrink(ctx.getSource().getPlayerOrThrow()) ? 1 : 0))
                .then(CommandManager.argument("factor", DoubleArgumentType.doubleArg(ScaleLadder.MIN, ScaleLadder.MAX))
                    .executes(ctx -> RealityManager.scale(ctx.getSource().getPlayerOrThrow(), DoubleArgumentType.getDouble(ctx, "factor")) ? 1 : 0)))
        ));
    }
}
