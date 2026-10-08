package com.beyondthelimits.core.engine;

import com.beyondthelimits.core.BtlConfig;
import com.beyondthelimits.core.BtlState;
import com.beyondthelimits.entity.RiftEntity;
import com.beyondthelimits.network.BtlNetworking;
import com.beyondthelimits.registry.BtlBlocks;
import com.beyondthelimits.registry.BtlDimensions;
import com.beyondthelimits.registry.BtlEntities;
import com.beyondthelimits.registry.BtlParticles;
import com.beyondthelimits.registry.BtlSounds;
import com.beyondthelimits.util.BtlSafe;
import net.minecraft.block.Block;
import net.minecraft.entity.Entity;
import net.minecraft.entity.LivingEntity;
import net.minecraft.entity.SpawnReason;
import net.minecraft.entity.player.PlayerEntity;
import net.minecraft.particle.ParticleTypes;
import net.minecraft.registry.RegistryKey;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.network.ServerPlayerEntity;
import net.minecraft.server.world.ServerWorld;
import net.minecraft.sound.SoundCategory;
import net.minecraft.text.Text;
import net.minecraft.util.math.BlockPos;
import net.minecraft.util.math.Box;
import net.minecraft.util.math.Vec3d;
import net.minecraft.util.math.random.Random;
import net.minecraft.world.World;

/**
 * Rifts.
 *
 * <p>A rift is a tear in the world: an entity (never a block) that grows over several in-game
 * days, shows you another Minecraft world through it, lets things out of that world, and — once it
 * is large enough — lets you walk through it with no loading screen at all (see
 * {@link #tryPullThrough}).</p>
 *
 * <p>This engine owns rift population, growth, invasions, teleportation, and the "which world is
 * behind this tear" table.</p>
 */
public final class RiftEngine {
	private RiftEngine() {
	}

	/** The six rift families, in the order {@code RiftEntity.VARIANT_*} declares them. */
	public static final RegistryKey<World>[] VARIANTS = new RegistryKey[]{
			BtlDimensions.WRONGWORLD, BtlDimensions.BACKROOMS, BtlDimensions.FOGLANDS,
			BtlDimensions.CODESCAPE, BtlDimensions.MIRRORWORLD, World.NETHER
	};

	private static int cooldown;

	public static int rollVariant(Random random) {
		// Corruption pushes the odds: the more broken the world, the worse the tear behind it.
		int reality = BtlState.get().reality();
		int roll = random.nextInt(100);

		if (reality > 80) {
			return roll < 55 ? RiftEntity.VARIANT_OVERWORLD_SHARD : RiftEntity.VARIANT_BACKROOMS;
		}

		if (reality > 55) {
			return roll < 30 ? RiftEntity.VARIANT_OVERWORLD_SHARD
					: roll < 60 ? RiftEntity.VARIANT_BACKROOMS : RiftEntity.VARIANT_FOGLANDS;
		}

		if (reality > 30) {
			return roll < 20 ? RiftEntity.VARIANT_OVERWORLD_SHARD
					: roll < 45 ? RiftEntity.VARIANT_BACKROOMS
					: roll < 70 ? RiftEntity.VARIANT_FOGLANDS : RiftEntity.VARIANT_CODESCAPE;
		}

		return roll < 15 ? RiftEntity.VARIANT_OVERWORLD_SHARD
				: roll < 35 ? RiftEntity.VARIANT_BACKROOMS
				: roll < 55 ? RiftEntity.VARIANT_FOGLANDS
				: roll < 75 ? RiftEntity.VARIANT_CODESCAPE
				: roll < 90 ? RiftEntity.VARIANT_MIRROR : RiftEntity.VARIANT_COLLISION;
	}

	public static void tick(MinecraftServer server, int ticks) {
		ServerWorld overworld = server.getOverworld();

		if (overworld == null) {
			return;
		}

		BtlState state = BtlState.get();

		if (cooldown > 0) {
			cooldown--;
			return;
		}

		cooldown = BtlConfig.RIFT_SPAWN_INTERVAL_TICKS;

		if (state.riftCount() >= BtlConfig.RIFT_MAX_PER_WORLD) {
			return;
		}

		// Rifts open near players, more often the less reality there is left.
		int chance = 1 + (100 - state.reality()) / 12;

		if (overworld.getRandom().nextInt(24) >= chance) {
			return;
		}

		for (ServerPlayerEntity player : server.getPlayerManager().getPlayerList()) {
			if (player.getServerWorld() != overworld) {
				continue;
			}

			BlockPos pos = findRiftSite(overworld, player);

			if (pos != null) {
				spawnRiftAt(overworld, pos, rollVariant(overworld.getRandom()), false);
				state.addRift();
				BtlNetworking.sendScreenEffect(player, BtlNetworking.EFFECT_RIFT_WASH, 0.35F, 50);
				player.sendMessage(Text.translatable("message.beyondthelimits.rift.opened"), true);
			}
		}
	}

	public static BlockPos findRiftSite(ServerWorld world, PlayerEntity player) {
		Random random = world.getRandom();

		for (int attempt = 0; attempt < 16; attempt++) {
			double angle = random.nextDouble() * Math.PI * 2.0D;
			double distance = BtlConfig.RIFT_MIN_DISTANCE
					+ random.nextDouble() * (BtlConfig.RIFT_MAX_DISTANCE - BtlConfig.RIFT_MIN_DISTANCE);
			BlockPos candidate = BlockPos.ofFloored(player.getX() + Math.cos(angle) * distance,
					player.getY() + random.nextInt(9) - 4, player.getZ() + Math.sin(angle) * distance);
			BlockPos surface = world.getTopPosition(net.minecraft.world.Heightmap.Type.MOTION_BLOCKING, candidate);

			if (world.isAir(surface) && world.isAir(surface.up())) {
				return surface;
			}
		}

		return null;
	}

	public static boolean spawnRiftAt(ServerWorld world, BlockPos pos, int variant, boolean permanent) {
		return BtlSafe.supply("rift.spawn", () -> {
			RiftEntity rift = BtlEntities.RIFT.create(world);

			if (rift == null) {
				return false;
			}

			rift.refreshPositionAndAngles(pos.getX() + 0.5D, pos.getY() + 0.5D, pos.getZ() + 0.5D,
					world.getRandom().nextFloat() * 360.0F, 0.0F);
			rift.setVariant(variant);
			rift.setPermanent(permanent);
			rift.setRadius((float) BtlConfig.RIFT_BASE_RADIUS);
			rift.setMode(RiftEntity.MODE_VIEW);
			world.spawnEntity(rift);

			world.playSound(null, pos, BtlSounds.RIFT_OPEN, SoundCategory.AMBIENT, 1.1F,
					0.5F + world.getRandom().nextFloat() * 0.4F);
			world.spawnParticles(ParticleTypes.REVERSE_PORTAL, pos.getX() + 0.5D, pos.getY() + 0.8D, pos.getZ() + 0.5D,
					40, 0.6D, 1.2D, 0.6D, 0.05D);
			return true;
		}, false);
	}

	public static void emitAmbientParticles(ServerWorld world, RiftEntity rift) {
		world.spawnParticles(BtlParticles.RIFT_SPARK, rift.getX(), rift.getY() + 0.8D, rift.getZ(),
				3, rift.getRadius() * 0.4D, rift.getRadius() * 0.8D, rift.getRadius() * 0.4D, 0.01D);
	}

	/** Something on the other side noticed the hole. */
	public static void spawnTrespasser(ServerWorld world, RiftEntity rift) {
		BtlSafe.guard("rift.trespasser", () -> {
			var type = switch (rift.getVariant()) {
				case RiftEntity.VARIANT_BACKROOMS -> world.getRandom().nextBoolean() ? BtlEntities.HOUND : BtlEntities.SMILER;
				case RiftEntity.VARIANT_FOGLANDS -> BtlEntities.FOG_SHADE;
				case RiftEntity.VARIANT_CODESCAPE -> BtlEntities.CODE_WRAITH;
				case RiftEntity.VARIANT_MIRROR -> BtlEntities.MIRROR_DOUBLE;
				case RiftEntity.VARIANT_COLLISION -> world.getRandom().nextBoolean()
						? BtlEntities.EVOLVED_ZOMBIE : BtlEntities.HUNTER_SKELETON;
				default -> world.getRandom().nextBoolean() ? BtlEntities.AMBUSH_SPIDER : BtlEntities.HIDING_CREEPER;
			};

			Entity entity = type.create(world);

			if (entity == null) {
				return;
			}

			entity.refreshPositionAndAngles(rift.getX(), rift.getY() + 0.2D, rift.getZ(), world.getRandom().nextFloat() * 360.0F, 0.0F);

			if (entity instanceof LivingEntity living) {
				living.setHealth(living.getMaxHealth());
			}

			world.spawnEntity(entity);
			rift.setInvading(true);
			world.playSound(null, rift.getBlockPos(), BtlSounds.EVOLUTION_GROWL, SoundCategory.HOSTILE, 1.0F, 0.6F);
		});
	}

	/**
	 * The seamless part.
	 *
	 * <p>Anything that touches a grown rift is moved to the other side while keeping its velocity
	 * and facing. There is no loading screen, no Nether-style animation, and — for entities — no
	 * interruption at all. For players the client plays a short "rift wash" shader overlay so the
	 * transition reads as a tear in vision rather than a teleport.</p>
	 */
	public static void tryPullThrough(ServerWorld world, RiftEntity rift) {
		if (!rift.isInvading() && rift.getMode() != RiftEntity.MODE_SEAMLESS) {
			return;
		}

		Box box = rift.getBoundingBox().expand(rift.getRadius() * 0.6D, rift.getRadius(), rift.getRadius() * 0.6D);

		for (Entity entity : world.getOtherEntities(rift, box, e -> e instanceof LivingEntity)) {
			if (entity instanceof PlayerEntity player) {
				if (!(player instanceof ServerPlayerEntity serverPlayer)) {
					continue;
				}

				RegistryKey<World> destination = VARIANTS[Math.min(VARIANTS.length - 1, Math.max(0, rift.getVariant()))];
				ServerWorld target = world.getServer().getWorld(destination);

				if (target == null) {
					continue;
				}

				BtlNetworking.sendScreenEffect(serverPlayer, BtlNetworking.EFFECT_RIFT_WASH, 0.8F, 25);
				BtlState.get().addRiftTouch(serverPlayer.getUuid());
				teleportSeamless(serverPlayer, target, rift);
			} else {
				// Mobs are pulled in "behind the scenes": the tear moves them without a trace.
				entity.discard();
			}
		}
	}

	/** Moves a player through a tear, preserving heading and momentum. */
	public static void teleportSeamless(ServerPlayerEntity player, ServerWorld target, RiftEntity rift) {
		Vec3d velocity = player.getVelocity();
		double x = rift.getX();
		double y = Math.max(target.getBottomY() + 2, rift.getY());
		double z = rift.getZ();

		player.teleport(target, x, y, z, player.getYaw(), player.getPitch());
		player.setVelocity(velocity);
		player.velocityModified = true;
		player.getServerWorld().playSound(null, player.getBlockPos(), BtlSounds.NOCLIP_WHOOSH,
				SoundCategory.AMBIENT, 0.9F, 0.7F);
	}

	public static void onPlayerEntered(ServerPlayerEntity player, RiftEntity rift) {
		// The per-tick pull handles the teleport; this hook only handles the bookkeeping.
		if (BtlState.get().riftTouches(player.getUuid()) % 8 == 0) {
			player.sendMessage(Text.translatable("message.beyondthelimits.rift.touched"), true);
		}
	}

	public static void onRiftClosed(ServerWorld world, BlockPos pos, int variant) {
		BtlSafe.guard("rift.close_effects", () -> {
			world.spawnParticles(ParticleTypes.REVERSE_PORTAL, pos.getX() + 0.5D, pos.getY() + 0.5D, pos.getZ() + 0.5D,
					30, 0.8D, 1.5D, 0.8D, 0.02D);
			// A closed rift leaves a scar: the anchor that keeps opening new tears forever.
			if (world.getRandom().nextInt(3) == 0 && world.isAir(pos)) {
				world.setBlockState(pos, BtlBlocks.RIFT_ANCHOR.getDefaultState(), Block.NOTIFY_ALL);
			}
		});
	}

	public static void closeRift(ServerWorld world, RiftEntity rift) {
		world.spawnParticles(ParticleTypes.REVERSE_PORTAL, rift.getX(), rift.getY() + 1.0D, rift.getZ(),
				60, 1.0D, 1.6D, 1.0D, 0.03D);
		world.playSound(null, rift.getBlockPos(), BtlSounds.REALITY_TEAR, SoundCategory.AMBIENT, 1.0F, 0.5F);
		rift.discard();
	}

	/** Marks every rift within range as "revealed" for the client lens overlay. */
	public static int revealNearby(ServerWorld world, PlayerEntity player, double range) {
		int count = 0;

		for (RiftEntity rift : world.getEntitiesByClass(RiftEntity.class, new Box(player.getBlockPos()).expand(range),
				entity -> true)) {
			world.spawnParticles(ParticleTypes.END_ROD, rift.getX(), rift.getY() + 1.0D, rift.getZ(),
					12, 0.4D, 0.6D, 0.4D, 0.01D);
			count++;
		}

		return count;
	}

	/** Hostile pressure used by the storm and black sun events. */
	public static void surge(ServerWorld world, int amount) {
		BlockPos origin = null;
		ServerPlayerEntity player = world.getRandomAlivePlayer();

		if (player != null) {
			origin = player.getBlockPos();
		}

		if (origin == null) {
			return;
		}

		RiftEntity gate = ensureRift(world, origin);

		if (gate == null) {
			return;
		}

		for (int i = 0; i < amount; i++) {
			spawnTrespasser(world, gate);
		}
	}

	private static RiftEntity ensureRift(ServerWorld world, BlockPos near) {
		for (RiftEntity existing : world.getEntitiesByClass(RiftEntity.class, new Box(near).expand(48.0D), e -> true)) {
			return existing;
		}

		BlockPos site = near.add(world.getRandom().nextInt(16) - 8, 2, world.getRandom().nextInt(16) - 8);
		spawnRiftAt(world, site, rollVariant(world.getRandom()), true);
		return world.getEntitiesByClass(RiftEntity.class, new Box(site).expand(24.0D), e -> true).stream().findFirst().orElse(null);
	}
}
