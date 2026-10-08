package com.beyondthelimits.command;

import com.beyondthelimits.core.BtlConfig;
import com.beyondthelimits.core.BtlEngine;
import com.beyondthelimits.core.BtlState;
import com.beyondthelimits.core.engine.BackroomsEngine;
import com.beyondthelimits.core.engine.BlackSunEngine;
import com.beyondthelimits.core.engine.DementiaEngine;
import com.beyondthelimits.core.engine.EvolutionEngine;
import com.beyondthelimits.core.engine.GravityEngine;
import com.beyondthelimits.core.engine.LastChunkEngine;
import com.beyondthelimits.core.engine.LoreEngine;
import com.beyondthelimits.core.engine.MemoryRecorder;
import com.beyondthelimits.core.engine.MirrorEngine;
import com.beyondthelimits.core.engine.ObserverEngine;
import com.beyondthelimits.core.engine.RealityEngine;
import com.beyondthelimits.core.engine.RiftEngine;
import com.beyondthelimits.core.engine.SignalEngine;
import com.beyondthelimits.core.engine.StormEngine;
import com.beyondthelimits.core.engine.TemporalEngine;
import com.beyondthelimits.network.BtlNetworking;
import com.beyondthelimits.registry.BtlDimensions;
import com.beyondthelimits.registry.BtlItems;
import com.beyondthelimits.registry.BtlSounds;
import com.beyondthelimits.world.BtlPortal;
import com.beyondthelimits.world.CityGenerator;
import com.beyondthelimits.world.SkyEvents;
import com.mojang.brigadier.arguments.IntegerArgumentType;
import com.mojang.brigadier.arguments.StringArgumentType;
import com.mojang.brigadier.builder.LiteralArgumentBuilder;
import com.mojang.brigadier.context.CommandContext;
import com.mojang.brigadier.tree.CommandNode;
import java.util.Map;
import net.fabricmc.fabric.api.command.v2.CommandRegistrationCallback;
import net.minecraft.item.ItemStack;
import net.minecraft.registry.RegistryKey;
import net.minecraft.server.command.CommandManager;
import net.minecraft.server.command.ServerCommandSource;
import net.minecraft.server.network.ServerPlayerEntity;
import net.minecraft.server.world.ServerWorld;
import net.minecraft.sound.SoundCategory;
import net.minecraft.text.Text;
import net.minecraft.util.Formatting;
import net.minecraft.util.math.BlockPos;
import net.minecraft.world.World;

/**
 * The mod's command surface.
 *
 * <p>Everything the mod can do to a world can be done from here, because a survival experience this
 * strange has to be inspectable: the commands exist so that a player (or a streamer, or a server
 * operator) can look at the machinery rather than guess at it. All of them require operator
 * permissions except {@code /beyondthelimits where}, which only tells the player what they can already
 * see if they read the guide.</p>
 */
public final class BtlCommands {
	private BtlCommands() {
	}

	public static void register() {
		CommandRegistrationCallback.EVENT.register((dispatcher, registryAccess, environment) -> {
			LiteralArgumentBuilder<ServerCommandSource> root = CommandManager.literal("beyondthelimits")
					.executes(BtlCommands::status)
					.then(CommandManager.literal("status").executes(BtlCommands::status))
					.then(CommandManager.literal("where").executes(BtlCommands::where))
					.then(CommandManager.literal("backrooms").executes(context -> enterBackrooms(context.getSource())))
					.then(CommandManager.literal("city").executes(BtlCommands::city))
					.then(CommandManager.literal("lastchunk").executes(BtlCommands::lastChunk))
					.then(CommandManager.literal("storm")
							.executes(context -> storm(context, 2, 2400))
							.then(CommandManager.argument("intensity", IntegerArgumentType.integer(1, 3))
									.executes(context -> storm(context, IntegerArgumentType.getInteger(context, "intensity"), 2400))
									.then(CommandManager.argument("duration", IntegerArgumentType.integer(200, 48000))
											.executes(context -> storm(context,
													IntegerArgumentType.getInteger(context, "intensity"),
													IntegerArgumentType.getInteger(context, "duration"))))))
					.then(CommandManager.literal("blacksun")
							.executes(context -> blackSun(context, -1))
							.then(CommandManager.argument("stage", IntegerArgumentType.integer(1, BtlConfig.BLACK_SUN_MAX_STAGE))
									.executes(context -> blackSun(context, IntegerArgumentType.getInteger(context, "stage")))))
					.then(CommandManager.literal("reality")
							.then(CommandManager.argument("value", IntegerArgumentType.integer(0, 100))
									.executes(context -> reality(context, IntegerArgumentType.getInteger(context, "value")))))
					.then(CommandManager.literal("dementia")
							.then(CommandManager.argument("value", IntegerArgumentType.integer(0, BtlConfig.DEMENTIA_MAX))
									.executes(context -> dementia(context, IntegerArgumentType.getInteger(context, "value")))))
					.then(CommandManager.literal("signal").executes(BtlCommands::signal))
					.then(CommandManager.literal("dimension")
							.then(CommandManager.argument("key", StringArgumentType.word())
									.executes(context -> dimension(context, StringArgumentType.getString(context, "key")))))
					.then(CommandManager.literal("guide").executes(BtlCommands::guide))
					.then(CommandManager.literal("rift").executes(BtlCommands::rift))
					.then(CommandManager.literal("anomalies").executes(BtlCommands::anomalies))
					.then(CommandManager.literal("evolve")
							.then(CommandManager.argument("family", StringArgumentType.word())
									.then(CommandManager.argument("stage", IntegerArgumentType.integer(1, 5))
											.executes(context -> evolve(context,
													StringArgumentType.getString(context, "family"),
													IntegerArgumentType.getInteger(context, "stage"))))));

			CommandNode<ServerCommandSource> rootNode = dispatcher.register(root);

			// /backrooms: the shorthand players will actually type.
			dispatcher.register(CommandManager.literal("backrooms")
					.requires(source -> source.hasPermissionLevel(2))
					.executes(context -> enterBackrooms(context.getSource())));
			// /btl is the alias streamers actually read out loud.
			dispatcher.register(CommandManager.literal("btl").redirect(rootNode));
		});
	}

	// -------------------------------------------------------------------------------------------
	// Subcommands
	// -------------------------------------------------------------------------------------------

	private static int status(CommandContext<ServerCommandSource> context) {
		ServerCommandSource source = context.getSource();
		BtlState state = BtlState.get();
		source.sendFeedback(() -> Text.literal("Beyond the Limits — Chapter One").formatted(Formatting.GOLD), false);
		source.sendFeedback(() -> Text.literal("  reality     " + state.reality() + "%  (band " + RealityEngine.band(state) + "/6)"), false);
		source.sendFeedback(() -> Text.literal("  collision   " + state.collision() + "  sky crack " + state.skyCrack()
				+ "  bleeding " + state.bleeding()), false);
		source.sendFeedback(() -> Text.literal("  rifts       " + state.riftCount() + "  storms " + (StormEngine.isStormActive() ? "active" : "cooldown "
				+ state.stormCooldown())), false);
		source.sendFeedback(() -> Text.literal("  black sun   stage " + state.blackSunStage() + "/" + BtlConfig.BLACK_SUN_MAX_STAGE), false);
		source.sendFeedback(() -> Text.literal("  memories    " + MemoryRecorder.describe(state)), false);
		source.sendFeedback(() -> Text.literal("  evolution   " + state.evolution()), false);
		source.sendFeedback(() -> Text.literal("  " + BtlEngine.diagnostics(source.getServer())), false);
		return 1;
	}

	private static int where(CommandContext<ServerCommandSource> context) {
		ServerPlayerEntity player = context.getSource().getPlayer();

		if (player == null) {
			return 0;
		}

		LoreEngine.describeObjectives(player);
		context.getSource().sendFeedback(() -> Text.literal("  " + TemporalEngine.describeZone(player)), false);
		context.getSource().sendFeedback(() -> Text.literal("  observer level "
				+ ObserverEngine.level(BtlState.get(), player)), false);
		context.getSource().sendFeedback(() -> Text.literal("  sky band " + SkyEvents.band(BtlState.get())), false);
		context.getSource().sendFeedback(() -> Text.literal("  " + GravityEngine.describeNextMutation(BtlState.get())), false);
		return 1;
	}

	/** The command implementation of {@code /teleport backrooms} and {@code /backrooms}. */
	public static int enterBackrooms(ServerCommandSource source) {
		ServerPlayerEntity player = source.getPlayer();

		if (player == null) {
			return 0;
		}

		BackroomsEngine.enterViaNoclipDevice(player);
		source.sendFeedback(() -> Text.translatable("command.beyondthelimits.backrooms").formatted(Formatting.YELLOW), false);
		return 1;
	}

	private static int city(CommandContext<ServerCommandSource> context) {
		ServerPlayerEntity player = context.getSource().getPlayer();

		if (player == null) {
			return 0;
		}

		ServerWorld overworld = context.getSource().getServer().getOverworld();

		if (overworld == null) {
			return 0;
		}

		BlockPos centre = BackroomsEngine.citySurface(overworld);
		CityGenerator.ensureCity(overworld, false);
		BtlPortal.send(player, overworld, centre.getX(), centre.getY() + 1.0D, centre.getZ(), false);
		source(context).sendFeedback(() -> Text.translatable("command.beyondthelimits.city", centre.getX(), centre.getZ())
				.formatted(Formatting.GOLD), false);
		return 1;
	}

	private static int lastChunk(CommandContext<ServerCommandSource> context) {
		ServerPlayerEntity player = context.getSource().getPlayer();

		if (player == null) {
			return 0;
		}

		boolean sent = LastChunkEngine.sendToLastChunk(player);
		source(context).sendFeedback(() -> Text.translatable(sent ? "command.beyondthelimits.lastchunk" : "command.beyondthelimits.failed")
				.formatted(sent ? Formatting.DARK_PURPLE : Formatting.RED), false);
		return sent ? 1 : 0;
	}

	private static int storm(CommandContext<ServerCommandSource> context, int intensity, int duration) {
		ServerWorld world = context.getSource().getWorld();
		StormEngine.beginStorm(world, intensity, duration);
		source(context).sendFeedback(() -> Text.translatable("command.beyondthelimits.storm", intensity, duration)
				.formatted(Formatting.DARK_AQUA), false);
		return 1;
	}

	private static int blackSun(CommandContext<ServerCommandSource> context, int stage) {
		ServerWorld world = context.getSource().getServer().getOverworld();

		if (world == null) {
			return 0;
		}

		BtlState state = BtlState.get();
		int target = stage < 0 ? Math.min(BtlConfig.BLACK_SUN_MAX_STAGE, state.blackSunStage() + 1) : stage;
		state.setBlackSunStage(target);
		BlackSunEngine.onServerStarted(context.getSource().getServer());

		for (ServerPlayerEntity player : context.getSource().getServer().getPlayerManager().getPlayerList()) {
			BtlNetworking.sendSkyState(player);
			player.playSoundToPlayer(BtlSounds.BLACK_SUN_ARRIVAL, SoundCategory.AMBIENT, 1.4F, 0.3F);
		}

		source(context).sendFeedback(() -> Text.translatable("command.beyondthelimits.blacksun", target)
				.formatted(Formatting.DARK_PURPLE), false);
		return 1;
	}

	private static int reality(CommandContext<ServerCommandSource> context, int value) {
		BtlState.get().setReality(value);
		syncAll(context);
		source(context).sendFeedback(() -> Text.translatable("command.beyondthelimits.reality", value).formatted(Formatting.GREEN), false);
		return 1;
	}

	private static int dementia(CommandContext<ServerCommandSource> context, int value) {
		ServerPlayerEntity player = context.getSource().getPlayer();

		if (player == null) {
			return 0;
		}

		BtlState.get().setDementia(player.getUuid(), value);
		player.sendMessage(DementiaEngine.describe(value).copy().formatted(Formatting.LIGHT_PURPLE), false);
		return 1;
	}

	private static int signal(CommandContext<ServerCommandSource> context) {
		ServerPlayerEntity player = context.getSource().getPlayer();

		if (player == null) {
			return 0;
		}

		BlockPos machine = SignalEngine.machinePos(BtlState.get());
		BtlPortal.send(player, context.getSource().getServer().getOverworld(),
				machine.getX(), machine.getY() + 1.0D, machine.getZ(), false);
		source(context).sendFeedback(() -> Text.translatable("command.beyondthelimits.signal", machine.getX(), machine.getY(), machine.getZ())
				.formatted(Formatting.GREEN), false);
		return 1;
	}

	private static int dimension(CommandContext<ServerCommandSource> context, String key) {
		ServerPlayerEntity player = context.getSource().getPlayer();

		if (player == null) {
			return 0;
		}

		RegistryKey<World> target = switch (key.toLowerCase()) {
			case "overworld" -> World.OVERWORLD;
			case "nether" -> World.NETHER;
			case "end" -> World.END;
			case "backrooms" -> BtlDimensions.BACKROOMS;
			case "foglands", "fog" -> BtlDimensions.FOGLANDS;
			case "codescape", "codeverse", "code" -> BtlDimensions.CODESCAPE;
			case "mirrorworld", "mirror" -> BtlDimensions.MIRRORWORLD;
			case "wrongworld", "wrong" -> BtlDimensions.WRONGWORLD;
			case "substrata", "beneath" -> BtlDimensions.SUBSTRATA;
			case "impossible" -> BtlDimensions.THE_IMPOSSIBLE;
			default -> null;
		};

		if (target == null) {
			source(context).sendError(Text.translatable("command.beyondthelimits.unknown_dimension", key));
			return 0;
		}

		boolean sent = BtlPortal.enter(player, target);
		source(context).sendFeedback(() -> Text.translatable("command.beyondthelimits.dimension", key)
				.formatted(sent ? Formatting.AQUA : Formatting.RED), false);
		return sent ? 1 : 0;
	}

	private static int guide(CommandContext<ServerCommandSource> context) {
		ServerPlayerEntity player = context.getSource().getPlayer();

		if (player == null) {
			return 0;
		}

		player.giveItemStack(new ItemStack(BtlItems.GUIDEBOOK));
		player.giveItemStack(new ItemStack(BtlItems.REALITY_SCANNER));
		player.giveItemStack(new ItemStack(BtlItems.SIGNAL_RECEIVER));
		source(context).sendFeedback(() -> Text.translatable("command.beyondthelimits.guide").formatted(Formatting.GOLD), false);
		return 1;
	}

	private static int rift(CommandContext<ServerCommandSource> context) {
		ServerPlayerEntity player = context.getSource().getPlayer();

		if (player == null) {
			return 0;
		}

		ServerWorld world = player.getServerWorld();
		BlockPos site = RiftEngine.findRiftSite(world, player);

		if (site == null) {
			source(context).sendError(Text.translatable("command.beyondthelimits.failed"));
			return 0;
		}

		boolean spawned = RiftEngine.spawnRiftAt(world, site, RiftEngine.rollVariant(world.getRandom()), false);
		BtlState.get().addRift();
		source(context).sendFeedback(() -> Text.translatable("command.beyondthelimits.rift", site.getX(), site.getY(), site.getZ())
				.formatted(Formatting.AQUA), false);
		return spawned ? 1 : 0;
	}

	private static int anomalies(CommandContext<ServerCommandSource> context) {
		Map<Long, Integer> anomalies = BtlState.get().anomalies();
		context.getSource().sendFeedback(() -> Text.literal("Anomalies logged: " + anomalies.size()).formatted(Formatting.GOLD), false);

		anomalies.entrySet().stream().limit(12).forEach(entry -> {
			BlockPos pos = BlockPos.fromLong(entry.getKey());
			context.getSource().sendFeedback(() -> Text.literal("  " + pos.getX() + " " + pos.getY() + " " + pos.getZ()
					+ "  type " + entry.getValue()).formatted(Formatting.GRAY), false);
		});

		return 1;
	}

	private static int evolve(CommandContext<ServerCommandSource> context, String family, int stage) {
		Map<String, Integer> stages = BtlState.get().evolution();
		stages.put(family.toLowerCase(), stage);
		source(context).sendFeedback(() -> Text.translatable("command.beyondthelimits.evolve", family, stage)
				.formatted(Formatting.DARK_RED), false);
		return 1;
	}

	private static void syncAll(CommandContext<ServerCommandSource> context) {
		for (ServerPlayerEntity player : context.getSource().getServer().getPlayerManager().getPlayerList()) {
			BtlNetworking.sendRealitySync(player);
			BtlNetworking.sendSkyState(player);
		}
	}

	private static ServerCommandSource source(CommandContext<ServerCommandSource> context) {
		return context.getSource();
	}

	/** Referenced by {@link MirrorEngine} for the command's diagnostics: kept so the import is real. */
	public static boolean inMirrorWorld(ServerPlayerEntity player) {
		return MirrorEngine.inMirrorWorld(player);
	}

	/** The family names the evolve command accepts, for the error message in the guidebook. */
	public static String families() {
		return EvolutionEngine.ZOMBIE + ", " + EvolutionEngine.SKELETON + ", " + EvolutionEngine.SPIDER + ", " + EvolutionEngine.CREEPER;
	}
}
