package com.beyondthelimits.world;

import com.beyondthelimits.core.BtlState;
import com.beyondthelimits.core.engine.BlackSunEngine;
import com.beyondthelimits.core.engine.EvolutionEngine;
import com.beyondthelimits.core.engine.GravityEngine;
import com.beyondthelimits.core.engine.ImpossibleEngine;
import com.beyondthelimits.core.engine.LoreEngine;
import com.beyondthelimits.core.engine.MutationEngine;
import com.beyondthelimits.core.engine.ObserverEngine;
import com.beyondthelimits.core.engine.RiftEngine;
import com.beyondthelimits.core.engine.StormEngine;
import com.beyondthelimits.network.BtlNetworking;
import com.beyondthelimits.registry.BtlDimensions;
import com.beyondthelimits.registry.BtlEntities;
import com.beyondthelimits.registry.BtlItems;
import com.beyondthelimits.util.BtlSafe;
import net.fabricmc.fabric.api.entity.event.v1.ServerEntityWorldChangeEvents;
import net.fabricmc.fabric.api.entity.event.v1.ServerLivingEntityEvents;
import net.fabricmc.fabric.api.entity.event.v1.ServerPlayerEvents;
import net.fabricmc.fabric.api.entity.event.v1.EntitySleepEvents;
import net.fabricmc.fabric.api.event.lifecycle.v1.ServerEntityEvents;
import net.fabricmc.fabric.api.event.lifecycle.v1.ServerLifecycleEvents;
import net.fabricmc.fabric.api.event.lifecycle.v1.ServerTickEvents;
import net.fabricmc.fabric.api.event.lifecycle.v1.ServerWorldEvents;
import net.fabricmc.fabric.api.event.player.PlayerBlockBreakEvents;
import net.fabricmc.fabric.api.networking.v1.ServerPlayConnectionEvents;
import net.minecraft.entity.Entity;
import net.minecraft.entity.LivingEntity;
import net.minecraft.entity.mob.MobEntity;
import net.minecraft.entity.player.PlayerEntity;
import net.minecraft.item.ItemStack;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.network.ServerPlayerEntity;
import net.minecraft.server.world.ServerWorld;
import net.minecraft.text.Text;
import net.minecraft.util.Formatting;
import net.minecraft.util.math.BlockPos;
import net.minecraft.world.World;

/**
 * The mod's hook into the game.
 *
 * <p>Everything in Chapter One that needs to know about something happening — a player joining for the
 * first time, a mob dying, a block breaking, a bed being slept in, a world being loaded — arrives here
 * and is handed to the engine that owns it. This class is deliberately thin: it translates events into
 * intentions ({@code "the player broke a wrong-grass block"} → {@code "the creeper family learns"}) and
 * does no world editing of its own.</p>
 */
public final class BtlWorldEvents {
	private BtlWorldEvents() {
	}

	public static void register() {
		ServerLifecycleEvents.SERVER_STARTED.register(server -> BtlEngineAccess.serverStarted(server));
		ServerLifecycleEvents.SERVER_STOPPING.register(server -> BtlEngineAccess.serverStopping(server));
		ServerTickEvents.END_SERVER_TICK.register(server -> BtlEngineAccess.tick(server));
		ServerWorldEvents.LOAD.register((server, world) -> BtlSafe.guard("events.world_load", () -> onWorldLoad(server, world)));

		ServerPlayConnectionEvents.JOIN.register((handler, sender, server) ->
				BtlSafe.guard("events.join", () -> onJoin(handler.getPlayer())));
		ServerPlayerEvents.AFTER_RESPAWN.register((oldPlayer, newPlayer, alive) ->
				BtlSafe.guard("events.respawn", () -> onJoin(newPlayer)));
		ServerEntityWorldChangeEvents.AFTER_PLAYER_CHANGE_WORLD.register((player, origin, destination) ->
				BtlSafe.guard("events.dimension_change", () -> onDimensionChange(player, origin, destination)));

		ServerEntityEvents.ENTITY_LOAD.register((entity, world) ->
				BtlSafe.guard("events.entity_load", () -> onEntityLoad(entity, world)));
		ServerLivingEntityEvents.AFTER_DEATH.register((entity, source) ->
				BtlSafe.guard("events.death", () -> onDeath(entity, source)));
		PlayerBlockBreakEvents.AFTER.register((world, player, pos, state, blockEntity) ->
				BtlSafe.guard("events.break", () -> onBlockBroken(world, player, pos, state)));
		EntitySleepEvents.START_SLEEPING.register((entity, sleepingPos) ->
				BtlSafe.guard("events.sleep", () -> onSleep(entity, sleepingPos)));
	}

	/** The events above call into the engine, which lives in {@code core}; kept separate so that the
	 *  world package never has to know how the engine is ticked. */
	private static final class BtlEngineAccess {
		private static void serverStarted(MinecraftServer server) {
			com.beyondthelimits.core.BtlEngine.onServerStarted(server);
		}

		private static void serverStopping(MinecraftServer server) {
			com.beyondthelimits.core.BtlEngine.onServerStopping(server);
		}

		private static void tick(MinecraftServer server) {
			com.beyondthelimits.core.BtlEngine.tick(server);
			CityGenerator.tickProximity(server);
		}
	}

	private static void onWorldLoad(MinecraftServer server, ServerWorld world) {
		// The Black Sun needs to know the world can host it before it starts approaching.
		BlackSunEngine.onServerStarted(server);

		if (world.getRegistryKey() == World.OVERWORLD) {
			CityGenerator.tickProximity(server);
		}

		// Old rifts whose anchors are still standing get their scars cleaned up on load.
		if (world.getRegistryKey() == BtlDimensions.BACKROOMS) {
			world.getServer().getPlayerManager().getPlayerList().forEach(player ->
					player.sendMessage(Text.translatable("message.beyondthelimits.backrooms.hum").formatted(Formatting.YELLOW), false));
		}
	}

	private static void onJoin(ServerPlayerEntity player) {
		// The guidebook is handed out on first spawn, with the city's coordinates already in it.
		LoreEngine.giveStartingGuide(player);
		BtlNetworking.sendRealitySync(player);
		BtlNetworking.sendSkyState(player);

		ServerWorld world = player.getServerWorld();

		if (world.getRegistryKey() == BtlDimensions.BACKROOMS) {
			player.sendMessage(Text.translatable("message.beyondthelimits.backrooms.welcome").formatted(Formatting.YELLOW), false);
		}

		if (world.getRegistryKey() == BtlDimensions.CODESCAPE) {
			player.sendMessage(Text.translatable("message.beyondthelimits.codescape.welcome").formatted(Formatting.GREEN), false);
		}

		// First join on this world: the world's own introduction.
		if (BtlState.get().loreStage() == 0) {
			player.sendMessage(Text.translatable("message.beyondthelimits.intro.one").formatted(Formatting.GRAY), false);
			player.sendMessage(Text.translatable("message.beyondthelimits.intro.two").formatted(Formatting.DARK_GRAY), false);
		}
	}

	private static void onDimensionChange(ServerPlayerEntity player, ServerWorld origin, ServerWorld destination) {
		BtlPortal.noteTravel(player, origin, destination);
		BtlNetworking.sendRealitySync(player);
		BtlNetworking.sendSkyState(player);

		// Anything that changed while the player was away gets applied on the way back in.
		if (destination.getRegistryKey() == World.OVERWORLD && origin.getRegistryKey() != World.OVERWORLD) {
			player.sendMessage(Text.translatable("message.beyondthelimits.returned", GravityEngine.dimensionName(origin.getRegistryKey()))
					.formatted(Formatting.DARK_PURPLE), false);
		}

		if (destination.getRegistryKey() == BtlDimensions.BACKROOMS) {
			player.sendMessage(Text.translatable("message.beyondthelimits.backrooms.welcome").formatted(Formatting.YELLOW), false);
		}
	}

	private static void onEntityLoad(Entity entity, ServerWorld world) {
		// Evolution: a family that has learned something starts replacing the mobs that have not.
		if (entity instanceof MobEntity mob && !(entity instanceof ServerPlayerEntity)) {
			String family = EvolutionEngine.familyOf(mob);

			if (family != null && EvolutionEngine.shouldUpgrade(BtlState.get(), family, world.getRandom())) {
				BtlSafe.guard("events.evolve", () -> {
					MobEntity evolved = EvolutionEngine.evolvedType(family, world.getRandom())
							.create(world);

					if (evolved == null) {
						return;
					}

					evolved.refreshPositionAndAngles(mob.getX(), mob.getY(), mob.getZ(), mob.getYaw(), mob.getPitch());
					EvolutionEngine.equip(evolved, EvolutionEngine.stage(BtlState.get(), family));
					evolved.setPersistent();
					world.spawnEntity(evolved);
					mob.discard();
				});
			}
		}

		// The Last Chunk watches for arrivals itself: loading a chunk of its monument is the
		// signal it needs, and the engine's own tick does the rest.
	}

	private static void onDeath(LivingEntity entity, net.minecraft.entity.damage.DamageSource source) {
		BtlState state = BtlState.get();
		Entity attacker = source.getAttacker();

		// Kill credits in another dimension are debt owed to this one.
		if (attacker instanceof ServerPlayerEntity player && !(entity instanceof ServerPlayerEntity)) {
			if (player.getServerWorld().getRegistryKey() != World.OVERWORLD) {
				GravityEngine.offworldKill(player, entity);
			}

			// Evolution is fed by players, not by time.
			if (entity instanceof MobEntity mob) {
				String family = EvolutionEngine.familyOf(mob);

				if (family != null) {
					EvolutionEngine.onEvolvedKilled(player, family);
				}
			}
		}

		// Killing the observer is not possible; killing its reflection is not either, but it counts.
		if (entity instanceof com.beyondthelimits.entity.ObserverEntity && attacker instanceof ServerPlayerEntity player) {
			ObserverEngine.onObserved(player, (com.beyondthelimits.entity.ObserverEntity) entity);
		}

		state.setBleeding(Math.min(100, state.bleeding() + 1));
	}

	private static void onBlockBroken(World world, PlayerEntity player, BlockPos pos, net.minecraft.block.BlockState broken) {
		if (!(player instanceof ServerPlayerEntity serverPlayer)) {
			return;
		}

		ImpossibleEngine.onPlayerBlockBroken(serverPlayer, pos);

		if (world.getRegistryKey() != World.OVERWORLD) {
			GravityEngine.offworldBlockBroken(serverPlayer);
		}

		// Breaking the vein releases what is in it.
		if (broken.isOf(com.beyondthelimits.registry.BtlBlocks.BLEEDING_VEIN)
				&& world.getRandom().nextInt(20) == 0) {
			MutationEngine.apply(serverPlayer.getServerWorld(), serverPlayer, MutationEngine.BLOODY_LAKE);
		}
	}

	private static void onSleep(Entity entity, BlockPos sleepingPos) {
		if (!(entity instanceof ServerPlayerEntity player)) {
			return;
		}

		com.beyondthelimits.core.engine.LostCivilizationEngine.onSleep(player);

		// Sleeping is when the world reorganises itself. It always has been.
		BtlState state = BtlState.get();
		state.setSkyCrack(state.skyCrack() + 1);

		if (state.reality() < 70 && player.getWorld().getRandom().nextInt(4) == 0) {
			RiftEngine.spawnRiftAt(player.getServerWorld(), sleepingPos.up(2),
					RiftEngine.rollVariant(player.getWorld().getRandom()), false);
		}

		if (player.getWorld().getRandom().nextInt(6) == 0) {
			player.giveItemStack(new ItemStack(BtlItems.MEMORY_SHARD));
		}
	}

	/** Keeps the guidebook usable when the player has died and lost it. */
	public static void ensureGuide(ServerPlayerEntity player) {
		if (!LoreEngine.hasGuide(player)) {
			player.giveItemStack(new ItemStack(BtlItems.GUIDEBOOK));
			player.sendMessage(Text.translatable("message.beyondthelimits.guide.again").formatted(Formatting.GOLD), true);
		}
	}

	/** Called by the storm beacon and the command: force a storm now. */
	public static boolean summonStorm(ServerPlayerEntity player, int intensity, int duration) {
		return BtlSafe.supply("events.summon_storm", () -> {
			StormEngine.beginStorm(player.getServerWorld(), Math.max(1, Math.min(3, intensity)), duration);
			return true;
		}, false);
	}

	static {
		// Referencing the entity registry here means the mod's entity types are initialised before any
		// event can fire, which matters because the very first player join already syncs them.
		BtlSafe.guard("events.entity_registry_touch", () -> {
			if (BtlEntities.RIFT == null) {
				throw new IllegalStateException("beyondthelimits: entities not initialised");
			}
		});
	}
}
