package com.beyondthelimits.core.engine;

import com.beyondthelimits.core.BtlConfig;
import com.beyondthelimits.core.BtlState;
import com.beyondthelimits.network.BtlNetworking;
import com.beyondthelimits.registry.BtlEntities;
import com.beyondthelimits.registry.BtlParticles;
import com.beyondthelimits.registry.BtlSounds;
import com.beyondthelimits.util.BtlSafe;
import java.util.Map;
import net.minecraft.entity.EntityType;
import net.minecraft.entity.EquipmentSlot;
import net.minecraft.entity.SpawnReason;
import net.minecraft.entity.effect.StatusEffectInstance;
import net.minecraft.entity.effect.StatusEffects;
import net.minecraft.entity.mob.CreeperEntity;
import net.minecraft.entity.mob.MobEntity;
import net.minecraft.entity.mob.SkeletonEntity;
import net.minecraft.entity.mob.SpiderEntity;
import net.minecraft.entity.mob.ZombieEntity;
import net.minecraft.item.ItemStack;
import net.minecraft.item.Items;
import net.minecraft.server.MinecraftServer;
import net.minecraft.entity.player.PlayerEntity;
import net.minecraft.server.network.ServerPlayerEntity;
import net.minecraft.server.world.ServerWorld;
import net.minecraft.sound.SoundCategory;
import net.minecraft.text.Text;
import net.minecraft.util.Formatting;
import net.minecraft.util.math.BlockPos;
import net.minecraft.util.math.Box;
import net.minecraft.util.math.random.Random;

/**
 * Evolutionary mobs.
 *
 * <p>The four families — zombies, skeletons, spiders, creepers — each have an evolution stage per
 * world. Stages are not given to the mobs by the mod; they are earned by them, and the players pay for
 * them. Every evolved mob that dies raises its family's stage; every stage changes what the family
 * <em>is</em>:</p>
 *
 * <ul>
 *     <li>stage 1 — vanilla behaviour;</li>
 *     <li>stage 2 — the family's evolved variant starts replacing normal spawns, and the survivors
 *     get faster;</li>
 *     <li>stage 3 — evolved variants get equipment, and families stop attacking each other's
 *     targets (they share information);</li>
 *     <li>stage 4 — the whole family gets regeneration near their leader, and spawns escalate to
 *     ambushes;</li>
 *     <li>stage 5 — the family stops spawning in the dark at all, and starts hunting by daylight.</li>
 * </ul>
 */
public final class EvolutionEngine {
	private EvolutionEngine() {
	}

	public static final String ZOMBIE = "zombie";
	public static final String SKELETON = "skeleton";
	public static final String SPIDER = "spider";
	public static final String CREEPER = "creeper";

	public static void onServerStarted(MinecraftServer server) {
		BtlSafe.guard("evolution.start", () -> {
			Map<String, Integer> stages = BtlState.get().evolution();

			for (String family : new String[]{ZOMBIE, SKELETON, SPIDER, CREEPER}) {
				stages.putIfAbsent(family, 1);
			}
		});
	}

	public static void tick(MinecraftServer server, int ticks) {
		BtlState state = BtlState.get();
		Map<String, Integer> stages = state.evolution();

		for (ServerPlayerEntity player : server.getPlayerManager().getPlayerList()) {
			BtlSafe.guard("evolution.player", () -> tickPlayer(state, stages, player));
		}
	}

	private static void tickPlayer(BtlState state, Map<String, Integer> stages, ServerPlayerEntity player) {
		ServerWorld world = player.getServerWorld();

		if (world.getTime() % 400L != 0L) {
			return;
		}

		int highest = 1;

		for (int stage : stages.values()) {
			highest = Math.max(highest, stage);
		}

		// Stage 5 changes when things can spawn, which the entity events read; here we handle the
		// visible consequence: adapted patrols forming near the player.
		if (highest >= 4 && world.getRandom().nextInt(3) == 0) {
			BlockPos spawn = player.getBlockPos().add(world.getRandom().nextInt(60) - 30, 0, world.getRandom().nextInt(60) - 30);
			adaptedSpawn(state, world, spawn, highest);
		}
	}

	private static void adaptedSpawn(BtlState state, ServerWorld world, BlockPos pos, int stage) {
		Random random = world.getRandom();
		var type = switch (random.nextInt(4)) {
			case 0 -> BtlEntities.EVOLVED_ZOMBIE;
			case 1 -> BtlEntities.HUNTER_SKELETON;
			case 2 -> BtlEntities.AMBUSH_SPIDER;
			default -> BtlEntities.HIDING_CREEPER;
		};

		MobEntity mob = type.create(world, SpawnReason.EVENT);

		if (mob == null) {
			return;
		}

		BlockPos surface = world.getTopPosition(net.minecraft.world.Heightmap.Type.MOTION_BLOCKING, pos);
		mob.refreshPositionAndAngles(surface.getX() + 0.5D, surface.getY(), surface.getZ() + 0.5D, random.nextFloat() * 360.0F, 0.0F);
		mob.setPersistent();
		equip(mob, stage);
		world.spawnEntity(mob);
		world.spawnParticles(BtlParticles.REALITY_DUST, mob.getX(), mob.getY() + 1.0D, mob.getZ(),
				12, 0.5D, 0.8D, 0.5D, 0.02D);
	}

	/** Stage shapes what the family is wearing and what it knows. */
	public static void equip(MobEntity mob, int stage) {
		if (stage >= 2) {
			mob.addStatusEffect(new StatusEffectInstance(StatusEffects.SPEED, Integer.MAX_VALUE, Math.min(1, stage - 2), true, false), null);
		}

		if (stage >= 3) {
			mob.equipStack(EquipmentSlot.MAINHAND, new ItemStack(mob.getRandom().nextBoolean() ? Items.IRON_SWORD : Items.IRON_AXE));
			mob.equipStack(EquipmentSlot.HEAD, new ItemStack(Items.IRON_HELMET));
		}

		if (stage >= 4) {
			mob.addStatusEffect(new StatusEffectInstance(StatusEffects.REGENERATION, Integer.MAX_VALUE, 0, true, false), null);
			mob.equipStack(EquipmentSlot.CHEST, new ItemStack(Items.IRON_CHESTPLATE));
			mob.equipStack(EquipmentSlot.LEGS, new ItemStack(Items.IRON_LEGGINGS));
			mob.equipStack(EquipmentSlot.FEET, new ItemStack(Items.IRON_BOOTS));
		}

		if (stage >= 5) {
			mob.addStatusEffect(new StatusEffectInstance(StatusEffects.FIRE_RESISTANCE, Integer.MAX_VALUE, 0, true, false), null);
		}
	}

	/**
	 * Called when a player kills an evolved variant: that is the family's lesson.
	 *
	 * @return the family's stage after the lesson
	 */
	public static int onEvolvedKilled(ServerPlayerEntity player, String family) {
		return BtlSafe.supply("evolution.learn", () -> {
			BtlState state = BtlState.get();
			Map<String, Integer> stages = state.evolution();
			int stage = stages.getOrDefault(family, 1);

			// Lessons get more expensive: the family learns fast at first and then plateaus.
			int threshold = stage * BtlConfig.EVOLUTION_PER_ENCOUNTER;
			int progress = state.anomalies().merge(family.hashCode() * 31L, 1, Integer::sum);

			if (progress >= threshold && stage < 5) {
				stage++;
				stages.put(family, stage);
				state.anomalies().put(family.hashCode() * 31L, 0);
				announce(player, family, stage);
			}

			return stage;
		}, 1);
	}

	private static void announce(ServerPlayerEntity player, String family, int stage) {
		String key = "message.beyondthelimits.evolution." + family;

		for (ServerPlayerEntity online : player.getServer().getPlayerManager().getPlayerList()) {
			online.sendMessage(Text.translatable(key, stage).formatted(Formatting.DARK_RED), false);
			BtlNetworking.sendScreenEffect(online, BtlNetworking.EFFECT_EVOLUTION, stage / 5.0F, 60);
		}

		player.getServerWorld().playSound(null, player.getBlockPos(), BtlSounds.EVOLUTION_GROWL, SoundCategory.HOSTILE, 1.2F, 0.6F);
	}

	/**
	 * Breaking the wrong grass is a lesson too: whatever is living under it takes notes.
	 *
	 * <p>This is the only place where the player can raise a family's stage without fighting it, which
	 * makes careless strip-mining in the Wrong Minecraft a genuinely bad idea.</p>
	 */
	public static void onSuspiciousBreak(PlayerEntity player) {
		BtlSafe.guard("evolution.suspicious", () -> {
			BtlState state = BtlState.get();
			long key = "suspicious".hashCode() * 31L;
			int progress = state.anomalies().merge(key, 1, Integer::sum);

			if (progress < BtlConfig.EVOLUTION_PER_ENCOUNTER * 3) {
				return;
			}

			state.anomalies().put(key, 0);

			for (String family : new String[]{ZOMBIE, SKELETON, SPIDER, CREEPER}) {
				int stage = state.evolution().getOrDefault(family, 1);

				if (stage < 2) {
					state.evolution().put(family, stage + 1);
				}
			}

			if (player.getServer() != null) {
				for (ServerPlayerEntity online : player.getServer().getPlayerManager().getPlayerList()) {
					online.sendMessage(Text.translatable("message.beyondthelimits.evolution.learned")
							.formatted(Formatting.DARK_RED), false);
				}
			}
		});
	}

	/** The family a vanilla mob belongs to, or null. */
	public static String familyOf(MobEntity mob) {
		if (mob instanceof ZombieEntity) {
			return ZOMBIE;
		}

		if (mob instanceof SkeletonEntity) {
			return SKELETON;
		}

		if (mob instanceof SpiderEntity) {
			return SPIDER;
		}

		if (mob instanceof CreeperEntity) {
			return CREEPER;
		}

		return null;
	}

	public static int stage(BtlState state, String family) {
		return state.evolution().getOrDefault(family, 1);
	}

	/** Used by the vanilla-mob spawn hook to decide whether to upgrade a spawn into an evolved one. */
	public static boolean shouldUpgrade(BtlState state, String family, Random random) {
		int stage = stage(state, family);
		return stage >= 2 && random.nextInt(10) < stage - 1;
	}

	public static EntityType<? extends MobEntity> evolvedType(String family, Random random) {
		if (ZOMBIE.equals(family)) {
			return BtlEntities.EVOLVED_ZOMBIE;
		}

		if (SKELETON.equals(family)) {
			return BtlEntities.HUNTER_SKELETON;
		}

		if (SPIDER.equals(family)) {
			return BtlEntities.AMBUSH_SPIDER;
		}

		return BtlEntities.HIDING_CREEPER;
	}

	public static boolean nearLeader(ServerWorld world, MobEntity mob) {
		Box box = mob.getBoundingBox().expand(24.0D);
		return !world.getEntitiesByClass(MobEntity.class, box, other -> other != mob && familyOf(other) != null).isEmpty();
	}
}
