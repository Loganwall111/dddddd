package com.beyondthelimits.mixin;

import com.beyondthelimits.command.BtlCommands;
import com.mojang.brigadier.CommandDispatcher;
import net.minecraft.server.command.CommandManager;
import net.minecraft.server.command.ServerCommandSource;
import net.minecraft.server.command.TeleportCommand;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/**
 * Adds the third way into the Backrooms: {@code /teleport backrooms}.
 *
 * <p>Brigadier merges commands that share a literal name, so registering a second {@code teleport}
 * root with a single {@code backrooms} child grafts a new branch onto the vanilla command rather than
 * replacing it: {@code /teleport 15 64 15} and {@code /teleport backrooms} coexist, and the new branch
 * inherits the vanilla command's permission checks.</p>
 *
 * <p>{@code require = 0}: the mod's own {@code /beyondthelimits backrooms} always exists, so this
 * convenience can fail softly on an unusual mapping without taking the game down with it.</p>
 */
@Mixin(TeleportCommand.class)
public class TeleportCommandMixin {
	@Inject(method = "register(Lcom/mojang/brigadier/CommandDispatcher;)V", at = @At("TAIL"), require = 0)
	private static void btl$addBackroomsBranch(CommandDispatcher<ServerCommandSource> dispatcher, CallbackInfo ci) {
		dispatcher.register(CommandManager.literal("teleport")
				.then(CommandManager.literal("backrooms")
						.requires(source -> source.hasPermissionLevel(2))
						.executes(context -> BtlCommands.enterBackrooms(context.getSource()))));
	}
}
