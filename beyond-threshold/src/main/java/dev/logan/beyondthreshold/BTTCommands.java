package dev.logan.beyondthreshold;

import com.mojang.brigadier.arguments.StringArgumentType;
import dev.logan.beyondthreshold.entity.BlackHoleEntity;
import dev.logan.beyondthreshold.entity.RealityTearEntity;
import dev.logan.beyondthreshold.config.BTTConfig;
import dev.logan.beyondthreshold.world.BTTDimensions;
import dev.logan.beyondthreshold.world.BTTTravel;
import net.fabricmc.fabric.api.command.v2.CommandRegistrationCallback;
import net.minecraft.server.network.ServerPlayerEntity;
import net.minecraft.text.Text;
import net.minecraft.util.math.Vec3d;
import net.minecraft.world.World;

import java.util.Locale;

import static com.mojang.brigadier.Command.SINGLE_SUCCESS;
import static net.minecraft.server.command.CommandManager.argument;
import static net.minecraft.server.command.CommandManager.literal;

public final class BTTCommands {

	public static void register() {
		CommandRegistrationCallback.EVENT.register((dispatcher, registryAccess, environment) ->
				dispatcher.register(literal("btt")
						.then(literal("begin").executes(ctx -> {
							ServerPlayerEntity p = ctx.getSource().getPlayerOrThrow();
							WatcherSpawning.begin(ctx.getSource().getServer(), p);
							return SINGLE_SUCCESS;
						}))
						.then(literal("blackhole").executes(ctx -> {
							ServerPlayerEntity p = ctx.getSource().getPlayerOrThrow();
							Vec3d pos = p.getPos().add(0, 10, 0);
							ctx.getSource().getWorld().spawnEntity(new BlackHoleEntity(
									ctx.getSource().getWorld(), pos.x, pos.y, pos.z,
									5.0F * BTTConfig.get().gravityScale));
							return SINGLE_SUCCESS;
						}))
						.then(literal("tear").executes(ctx -> {
							ServerPlayerEntity p = ctx.getSource().getPlayerOrThrow();
							Vec3d pos = p.getEyePos().add(p.getRotationVec(1.0F).multiply(3.5));
							ctx.getSource().getWorld().spawnEntity(new RealityTearEntity(
									ctx.getSource().getWorld(), pos.x, pos.y - 0.6, pos.z, 0, p.getYaw()));
							return SINGLE_SUCCESS;
						}))
						.then(literal("glasses")
								.then(literal("on").executes(ctx -> glasses(ctx.getSource().getPlayerOrThrow(), true)))
								.then(literal("off").executes(ctx -> glasses(ctx.getSource().getPlayerOrThrow(), false))))
						.then(literal("mandela")
								.then(argument("mode", StringArgumentType.word()).executes(ctx -> {
									String m = StringArgumentType.getString(ctx, "mode").toLowerCase(Locale.ROOT);
									int mode = switch (m) {
										case "realism" -> 0;
										case "psychedelic" -> 1;
										case "blobs" -> 2;
										case "backrooms" -> 3;
										case "aurora" -> 4;
										case "quantum" -> 5;
										default -> -1;
									};
									BTTNet.sendMandela(ctx.getSource().getPlayerOrThrow(), mode);
									return SINGLE_SUCCESS;
								})))
						.then(literal("shrink").executes(ctx -> {
							ServerPlayerEntity p = ctx.getSource().getPlayerOrThrow();
							p.getCommandTags().add("btt_shrunk");
							p.sendMessage(Text.translatable("message.beyondthreshold.shrunk"), true);
							return SINGLE_SUCCESS;
						}))
						.then(literal("grow").executes(ctx -> {
							ServerPlayerEntity p = ctx.getSource().getPlayerOrThrow();
							p.getCommandTags().remove("btt_shrunk");
							return SINGLE_SUCCESS;
						}))
						.then(literal("return").executes(ctx -> {
							BTTTravel.travel(ctx.getSource().getPlayerOrThrow(), World.OVERWORLD);
							return SINGLE_SUCCESS;
						}))
						.then(literal("dimensions").executes(ctx -> {
							ServerPlayerEntity p = ctx.getSource().getPlayerOrThrow();
							for (int i = 0; i < BTTDimensions.ALL.size(); i++) {
								p.sendMessage(Text.literal(i + ": " + BTTDimensions.ALL.get(i).getValue()), false);
							}
							return SINGLE_SUCCESS;
						}))
				));
	}

	private static int glasses(ServerPlayerEntity p, boolean worn) {
		if (worn) {
			p.getCommandTags().add(BeyondTheThreshold.TAG_GLASSES);
		} else {
			p.getCommandTags().remove(BeyondTheThreshold.TAG_GLASSES);
		}
		BTTNet.sendGlasses(p, worn);
		return SINGLE_SUCCESS;
	}

	private BTTCommands() {
	}
}
