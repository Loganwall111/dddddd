package dev.logan.beyond.server;

import com.mojang.brigadier.arguments.DoubleArgumentType;
import com.mojang.brigadier.arguments.IntegerArgumentType;
import dev.logan.beyond.BeyondMinecraft;
import dev.logan.beyond.content.BeyondContent;
import net.fabricmc.fabric.api.command.v2.CommandRegistrationCallback;
import net.minecraft.item.ItemStack;
import net.minecraft.server.command.CommandManager;
import net.minecraft.text.Text;
import java.util.List;

public final class BeyondCommands {
    private BeyondCommands() {}
    public static void register() {
        CommandRegistrationCallback.EVENT.register((dispatcher, registryAccess, environment) -> dispatcher.register(CommandManager.literal("beyond")
            .executes(ctx -> { ctx.getSource().sendFeedback(() -> Text.literal("Beyond · /beyond return | /beyond where · Operators: kit, rift, singularity, realm, clear, scale, witness"), false); return 1; })
            .then(CommandManager.literal("return").executes(ctx -> RealityManager.returnHome(ctx.getSource().getPlayerOrThrow()) ? 1 : 0))
            .then(CommandManager.literal("where").executes(ctx -> {
                var p = ctx.getSource().getPlayerOrThrow();
                ctx.getSource().sendFeedback(() -> Text.literal(p.getWorld().getRegistryKey().getValue() + " · inventory: " + Journey.of(p).inventory.active()), false); return 1;
            }))
            .then(CommandManager.literal("kit").requires(s -> s.hasPermissionLevel(2)).executes(ctx -> {
                var p = ctx.getSource().getPlayerOrThrow();
                for (var item : List.of(BeyondContent.KNIFE, BeyondContent.RELIC, BeyondContent.GLASSES, BeyondContent.GUIDE, BeyondContent.SCALE)) p.giveItemStack(new ItemStack(item));
                return 1;
            }))
            .then(CommandManager.literal("rift").requires(s -> s.hasPermissionLevel(2)).executes(ctx -> RealityManager.spawn(ctx.getSource().getPlayerOrThrow(), false) ? 1 : 0))
            .then(CommandManager.literal("singularity").requires(s -> s.hasPermissionLevel(2)).executes(ctx -> RealityManager.spawn(ctx.getSource().getPlayerOrThrow(), true) ? 1 : 0))
            .then(CommandManager.literal("clear").requires(s -> s.hasPermissionLevel(2)).executes(ctx -> RealityManager.clear(ctx.getSource().getPlayerOrThrow())))
            .then(CommandManager.literal("witness").requires(s -> s.hasPermissionLevel(2)).executes(ctx -> { RealityManager.sync(ctx.getSource().getPlayerOrThrow(), true); return 1; }))
            .then(CommandManager.literal("realm").requires(s -> s.hasPermissionLevel(2))
                .then(CommandManager.argument("index", IntegerArgumentType.integer(0, BeyondMinecraft.CATALOG.realms().size() - 1))
                    .executes(ctx -> RealityManager.enter(ctx.getSource().getPlayerOrThrow(), IntegerArgumentType.getInteger(ctx, "index")) ? 1 : 0)))
            .then(CommandManager.literal("scale").requires(s -> s.hasPermissionLevel(2))
                .then(CommandManager.argument("factor", DoubleArgumentType.doubleArg(.125, 3))
                    .executes(ctx -> RealityManager.scale(ctx.getSource().getPlayerOrThrow(), DoubleArgumentType.getDouble(ctx, "factor")) ? 1 : 0)))
        ));
    }
}
